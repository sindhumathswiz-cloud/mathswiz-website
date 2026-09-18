import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
// before. Setting QB_STORAGE_BACKEND=SUPABASE switches book PDF and
// page/question image storage to a Supabase Storage bucket — required
// before this ever runs on Vercel, whose function filesystem is read-only
// outside /tmp and doesn't persist between invocations, so a file written to
// local disk in production is gone before the next request can read it back.
//
// The Python-backed steps (pdf-page-renderer.ts, pdf-inventory.ts,
// page-image-crop.ts) shell out to scripts that need a real file on disk
// regardless of backend — Poppler and pdfplumber don't know what Supabase
// is. withLocalBookPdfPath/withLocalPageImagePath below stage a Supabase
// object into a per-job OS temp file before handing it to those scripts, and
// delete the temp copy once the callback returns; resolvePrivateImageOutputDirectory
// / persistPrivateImageOutputDirectory do the same on the output side — a
// scratch temp directory for Python to write into, uploaded and cleaned up
// once the batch finishes. On LOCAL_DISK these are all no-ops that resolve
// straight to the existing on-disk paths, so local development is unchanged.
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

// Page renders and question-image crops share one shape, on both backends:
// "<bookId>/runs/<runId>/(pages|question-images)/<fileName>" — this is
// exactly privatePageImageDirectory/privateQuestionImageDirectory's own
// directory structure below, so a Supabase key and a local-disk relative
// path always agree and the same fileName maps to the same place either way.
const PRIVATE_IMAGE_KEY_PATTERN = /^[a-zA-Z0-9_-]+\/runs\/[a-zA-Z0-9_-]+\/(pages|question-images)\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/;

function privateImageKey(bookId: string, runId: string, kind: 'pages' | 'question-images', fileName: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(bookId) || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid image key');
  if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/.test(fileName)) throw new Error('Invalid image file name');
  return `${bookId}/runs/${runId}/${kind}/${fileName}`;
}

function imageContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  return 'image/jpeg';
}

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

// ---------------------------------------------------------------------------
// Staging helpers for the Python-backed pipeline steps
// ---------------------------------------------------------------------------

/**
 * Gives `fn` a real local file path for a stored book PDF, regardless of
 * backend — on LOCAL_DISK that's just the already-validated path; on
 * SUPABASE the object is downloaded into a fresh per-call temp file first.
 * The temp file (and its containing directory) is always removed before
 * this returns, whether `fn` succeeds or throws.
 */
export async function withLocalBookPdfPath<T>(pdfPathOrKey: string, fn: (localPath: string) => Promise<T>): Promise<T> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!BOOK_PDF_KEY_PATTERN.test(pdfPathOrKey)) throw new Error('Invalid book storage key');
    const { data, error } = await supabaseStorageClient().storage.from(storageBucket()).download(pdfPathOrKey);
    if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message || 'no data'}`);
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'qb-pdf-'));
    const localPath = path.join(workingDirectory, 'source.pdf');
    await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
    try {
      return await fn(localPath);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
  return fn(assertPrivateBookPdfPath(pdfPathOrKey));
}

/**
 * Same idea as withLocalBookPdfPath, for a single already-rendered page
 * image (page-image-crop.ts's crop source) rather than a whole book PDF.
 */
export async function withLocalPageImagePath<T>(imagePathOrKey: string, fn: (localPath: string) => Promise<T>): Promise<T> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!PRIVATE_IMAGE_KEY_PATTERN.test(imagePathOrKey)) throw new Error('Invalid private image key');
    const { data, error } = await supabaseStorageClient().storage.from(storageBucket()).download(imagePathOrKey);
    if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message || 'no data'}`);
    const workingDirectory = await mkdtemp(path.join(tmpdir(), 'qb-img-'));
    const localPath = path.join(workingDirectory, `source${path.extname(imagePathOrKey) || '.jpg'}`);
    await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
    try {
      return await fn(localPath);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  }
  return fn(assertPrivatePageImagePath(imagePathOrKey));
}

/**
 * A directory for a Python script to write one batch's output images into.
 * On LOCAL_DISK this is the file's real, final home (unchanged from before —
 * privatePageImageDirectory/privateQuestionImageDirectory, created if
 * missing). On SUPABASE it's a fresh, empty OS temp directory — the files
 * written there are only staged, and must be handed to
 * persistPrivateImageOutputDirectory (success) to be uploaded, or cleaned up
 * directly by the caller (failure), since nothing else will do either.
 */
export async function resolvePrivateImageOutputDirectory(bookId: string, runId: string, kind: 'pages' | 'question-images'): Promise<string> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    return mkdtemp(path.join(tmpdir(), `qb-${kind}-`));
  }
  const directory = kind === 'pages' ? privatePageImageDirectory(bookId, runId) : privateQuestionImageDirectory(bookId, runId);
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * The write side of resolvePrivateImageOutputDirectory: takes every file a
 * Python script just wrote into `localDir` and returns the path/key callers
 * should now use to refer to it. On LOCAL_DISK the files are already in
 * their final place, so this just maps each fileName back to that same
 * path. On SUPABASE it uploads every file to its content-addressed-by-run
 * key and removes the temp directory once all of them are up.
 */
export async function persistPrivateImageOutputDirectory(bookId: string, runId: string, kind: 'pages' | 'question-images', localDir: string): Promise<Map<string, string>> {
  const entries = await readdir(localDir);
  if (activeBookStorageBackend() !== 'SUPABASE') {
    return new Map(entries.map((fileName) => [fileName, path.join(localDir, fileName)]));
  }
  const map = new Map<string, string>();
  for (const fileName of entries) {
    const key = privateImageKey(bookId, runId, kind, fileName);
    const bytes = await readFile(path.join(localDir, fileName));
    const { error } = await supabaseStorageClient().storage.from(storageBucket()).upload(key, bytes, { upsert: true, contentType: imageContentType(fileName) });
    if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
    map.set(fileName, key);
  }
  await rm(localDir, { recursive: true, force: true });
  return map;
}

/**
 * Best-effort cleanup for resolvePrivateImageOutputDirectory's temp
 * directory when the Python step failed before persistPrivateImageOutputDirectory
 * ever ran — a no-op on LOCAL_DISK, since that directory is the file's real
 * home and isn't scratch space to delete.
 */
export async function discardPrivateImageOutputDirectory(localDir: string): Promise<void> {
  if (activeBookStorageBackend() !== 'SUPABASE') return;
  await rm(localDir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * A validated reference to an already-stored page/question image, for
 * callers that only need to pass it along (Mathpix's multipart form,
 * cropPageRegion's source arg) rather than read its bytes — the resolved
 * local path on LOCAL_DISK, or the key itself (format-checked) on SUPABASE.
 */
export function assertPrivateImageReference(imagePathOrKey: string): string {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!PRIVATE_IMAGE_KEY_PATTERN.test(imagePathOrKey)) throw new Error('Invalid private image key');
    return imagePathOrKey;
  }
  return assertPrivatePageImagePath(imagePathOrKey);
}

/** The GET-route counterpart of persistPrivateImageOutputDirectory's map: given a
 * book/run/kind/fileName, reconstructs the same reference a render or crop
 * call would have returned for it, without needing the DB row's stored
 * value on hand.
 */
export function privateImageReference(bookId: string, runId: string, kind: 'pages' | 'question-images', fileName: string): string {
  if (activeBookStorageBackend() === 'SUPABASE') return privateImageKey(bookId, runId, kind, fileName);
  const directory = kind === 'pages' ? privatePageImageDirectory(bookId, runId) : privateQuestionImageDirectory(bookId, runId);
  return assertPrivatePageImagePath(path.join(directory, fileName));
}

/**
 * Reads a stored page/question image's bytes — the read half of
 * removePrivateImage below, and what every OCR/vision/image-serving
 * consumer now calls instead of `readFile(assertPrivatePageImagePath(...))`
 * directly, so they work unmodified against either backend.
 */
export async function readPrivateImage(imagePathOrKey: string): Promise<Buffer> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!PRIVATE_IMAGE_KEY_PATTERN.test(imagePathOrKey)) throw new Error('Invalid private image key');
    const { data, error } = await supabaseStorageClient().storage.from(storageBucket()).download(imagePathOrKey);
    if (error || !data) throw new Error(`Supabase Storage download failed: ${error?.message || 'no data'}`);
    return Buffer.from(await data.arrayBuffer());
  }
  return readFile(assertPrivatePageImagePath(imagePathOrKey));
}

/** Deletes a stored page/question image — used for the snip tool's throwaway OCR crop. */
export async function removePrivateImage(imagePathOrKey: string): Promise<void> {
  if (activeBookStorageBackend() === 'SUPABASE') {
    if (!PRIVATE_IMAGE_KEY_PATTERN.test(imagePathOrKey)) throw new Error('Invalid private image key');
    const { error } = await supabaseStorageClient().storage.from(storageBucket()).remove([imagePathOrKey]);
    if (error) throw new Error(`Supabase Storage delete failed: ${error.message}`);
    return;
  }
  await rm(assertPrivatePageImagePath(imagePathOrKey), { force: true });
}
