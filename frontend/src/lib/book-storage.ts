import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const MAX_BOOK_PDF_BYTES = 250 * 1024 * 1024;

export function validateBookPdf(file: File) {
  if (!file.name.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF files are accepted');
  if (file.type && file.type !== 'application/pdf') throw new Error('The uploaded file is not identified as a PDF');
  if (file.size === 0) throw new Error('The PDF is empty');
  if (file.size > MAX_BOOK_PDF_BYTES) throw new Error('PDF exceeds the 250 MB pilot limit');
}

export function pdfHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function hasPdfSignature(buffer: Buffer) {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

// ---------------------------------------------------------------------------
// Storage backend
//
// Local disk (default) is what local development uses, unchanged from
// before. Setting QB_STORAGE_BACKEND=SUPABASE switches book PDF storage to a
// Supabase Storage bucket — required before this ever runs on Vercel, whose
// function filesystem is read-only outside /tmp and doesn't persist between
// invocations, so a PDF written to local disk in production is gone before
// the next request can read it back.
//
// Scope note: only storePrivateBookPdf/removePrivateBookPdf are
// Storage-backed so far. Three other modules still treat their input as a
// real filesystem path — lib/book-vision-benchmark.ts (OCR/vision
// benchmarking) and lib/pdf-page-renderer.ts + lib/pdf-inventory.ts (both of
// which shell out to Python scripts that need a real file on disk). Running
// with QB_STORAGE_BACKEND=SUPABASE before those three are migrated will make
// page rendering, inventory, and benchmarking fail — loudly and immediately
// (assertPrivateBookPdfPath below still validates real filesystem paths and
// will reject a storage key), not silently. That's intentional until they
// get their own follow-up pass.
// ---------------------------------------------------------------------------

export type BookStorageBackend = 'LOCAL_DISK' | 'SUPABASE';

export function activeBookStorageBackend(): BookStorageBackend {
  return process.env.QB_STORAGE_BACKEND === 'SUPABASE' ? 'SUPABASE' : 'LOCAL_DISK';
}

let _supabase: SupabaseClient | null = null;

function supabaseStorageClient(): SupabaseClient {
  if (_supabase) return _supabase;
  const ref = process.env.SUPABASE_PROJECT_REF;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ref || !serviceRoleKey) {
    throw new Error('QB_STORAGE_BACKEND=SUPABASE requires SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY to be set');
  }
  _supabase = createClient(`https://${ref}.supabase.co`, serviceRoleKey, { auth: { persistSession: false } });
  return _supabase;
}

function storageBucket() {
  return process.env.QB_STORAGE_BUCKET || 'book-ingestion';
}

// A book PDF's storage key (Supabase backend) or filename (local-disk
// backend) is always "<bookId>/<sha256-hex>.pdf" — this shape is shared by
// both backends and is what keeps a stored reference safe to validate before
// it's used to upload, delete, or (for local disk) resolve a real path.
const BOOK_PDF_KEY_PATTERN = /^[a-zA-Z0-9_-]+\/[a-f0-9]{64}\.pdf$/;

function storageRoot() {
  return path.resolve(process.env.QB_PRIVATE_STORAGE_ROOT || path.join(process.cwd(), '.private', 'book-ingestion'));
}

export function assertPrivateBookPdfPath(filePath: string) {
  const root = storageRoot();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${root}${path.sep}`) || path.extname(resolved).toLowerCase() !== '.pdf') {
    throw new Error('Invalid private PDF path');
  }
  return resolved;
}

export function privatePageImageDirectory(bookId: string, runId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(bookId) || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid page image directory');
  const root = storageRoot();
  const directory = path.resolve(root, bookId, 'runs', runId, 'pages');
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Invalid page image target');
  return directory;
}

export function assertPrivatePageImagePath(filePath: string) {
  const root = storageRoot();
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(`${root}${path.sep}`) || !['.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(resolved).toLowerCase())) {
    throw new Error('Invalid private page image path');
  }
  return resolved;
}

// Cropped per-question diagram/figure images (question-qa-time crops of an
// already-rendered page, produced by lib/page-image-crop.ts) live in their
// own subtree, sibling to the whole-page renders above. Kept as a distinct
// directory (rather than dropped into the pages/ directory) so a run's page
// renders and its derived question crops can be cleaned up or reasoned about
// independently. assertPrivatePageImagePath above already validates any path
// under storageRoot() with an image extension, so it doubles as the
// containment check for files written here too.
export function privateQuestionImageDirectory(bookId: string, runId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(bookId) || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid question image directory');
  const root = storageRoot();
  const directory = path.resolve(root, bookId, 'runs', runId, 'question-images');
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Invalid question image target');
  return directory;
}

export async function storePrivateBookPdf(bookId: string, hash: string, buffer: Buffer): Promise<string> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    const key = `${bookId}/${hash}.pdf`;
    if (!BOOK_PDF_KEY_PATTERN.test(key)) throw new Error('Invalid book storage key');
    // upsert: true because storage keys are content-addressed by hash — a
    // duplicate upload of the same bytes is a safe no-op, matching the
    // EEXIST-tolerant behavior of the local-disk path below.
    const { error } = await supabaseStorageClient().storage.from(storageBucket()).upload(key, buffer, {
      upsert: true,
      contentType: 'application/pdf',
    });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    return key;
  }

  const root = storageRoot();
  const directory = path.resolve(root, bookId);
  if (!directory.startsWith(`${root}${path.sep}`)) throw new Error('Invalid book storage target');
  await mkdir(directory, { recursive: true });
  const finalPath = path.join(directory, `${hash}.pdf`);
  const temporaryPath = path.join(directory, `.${hash}.${randomUUID()}.upload`);
  await writeFile(temporaryPath, buffer, { flag: 'wx' });
  try {
    await rename(temporaryPath, finalPath);
  } catch (error: any) {
    await rm(temporaryPath, { force: true });
    if (error?.code !== 'EEXIST') throw error;
  }
  return finalPath;
}

export async function removePrivateBookPdf(filePath: string) {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!BOOK_PDF_KEY_PATTERN.test(filePath)) throw new Error('Invalid book storage key');
    const { error } = await supabaseStorageClient().storage.from(storageBucket()).remove([filePath]);
    if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
    return;
  }
  const resolved = assertPrivateBookPdfPath(filePath);
  await rm(resolved, { force: true });
}
