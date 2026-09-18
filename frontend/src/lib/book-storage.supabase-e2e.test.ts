import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Real end-to-end coverage of the Supabase-backed storage workflow, against
 * an actual Supabase Storage bucket — not the mocked @supabase/supabase-js
 * client book-storage.test.ts uses. That file proves each function calls
 * the SDK correctly in isolation; this file proves the whole staging
 * pipeline (store -> stage to a real local temp file for Python -> persist
 * the Python step's output back to Storage -> read it back -> clean up)
 * actually works against Supabase, end to end, the way render-pages/
 * inventory/snip's real API routes exercise it in production.
 *
 * Gated on QB_SUPABASE_E2E_BUCKET, a dedicated env var that's deliberately
 * NOT the same one the app's own runtime reads (QB_STORAGE_BUCKET) -- so a
 * developer or CI job that happens to have real SUPABASE_PROJECT_REF /
 * SUPABASE_SERVICE_ROLE_KEY set for some other reason (e.g. testing the
 * admin UI locally against a real project) can never trigger this test by
 * accident. It only runs when someone has explicitly named a bucket to test
 * against -- which should always be an isolated test bucket, never the
 * production one -- and overrides QB_STORAGE_BUCKET to that name for the
 * duration, restoring it afterward. Every object this test creates lives
 * under one throwaway bookId/runId pair and is removed in `afterAll`, pass
 * or fail, but pointing this at anything other than a disposable test
 * bucket is still the caller's responsibility, not this file's.
 *
 * This file's own gate stays a graceful skip on purpose, for a LOCAL `npm
 * test` run with no Supabase test env configured. The CI workflow enforces
 * the opposite of that for itself: its "Require Supabase integration
 * secrets" step fails the job outright if these secrets are missing, so the
 * required check can't quietly stop validating Storage if a secret is ever
 * rotated or removed -- see .github/workflows/test.yml.
 */

const testBucket = process.env.QB_SUPABASE_E2E_BUCKET;
const hasSupabaseTestEnvironment = Boolean(
  process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_SERVICE_ROLE_KEY && testBucket,
);

describe.skipIf(!hasSupabaseTestEnvironment)('book-storage against a real Supabase backend', () => {
  const originalBackend = process.env.QB_STORAGE_BACKEND;
  const originalBucket = process.env.QB_STORAGE_BUCKET;
  process.env.QB_STORAGE_BACKEND = 'SUPABASE';
  process.env.QB_STORAGE_BUCKET = testBucket;

  const bookId = `e2e-test-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const runId = `run-${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let storedPdfKey: string | null = null;
  const uploadedImageKeys: string[] = [];

  afterAll(async () => {
    const { removePrivateBookPdf, removePrivateImage } = await import('./book-storage');
    if (storedPdfKey) await removePrivateBookPdf(storedPdfKey).catch(() => undefined);
    for (const key of uploadedImageKeys) await removePrivateImage(key).catch(() => undefined);
    if (originalBackend === undefined) delete process.env.QB_STORAGE_BACKEND; else process.env.QB_STORAGE_BACKEND = originalBackend;
    if (originalBucket === undefined) delete process.env.QB_STORAGE_BUCKET; else process.env.QB_STORAGE_BUCKET = originalBucket;
  });

  it('stores a book PDF, stages it to a real local temp file, and removes the temp copy afterward', async () => {
    const { pdfHash, storePrivateBookPdf, withLocalBookPdfPath } = await import('./book-storage');
    const { readFile } = await import('node:fs/promises');

    const bytes = Buffer.from(`%PDF-1.7\n% e2e test fixture ${runId}\n%%EOF`);
    const hash = pdfHash(bytes);
    const key = await storePrivateBookPdf(bookId, hash, bytes);
    storedPdfKey = key;
    expect(key).toBe(`${bookId}/${hash}.pdf`);

    let capturedLocalPath = '';
    const readBack = await withLocalBookPdfPath(key, async (localPath) => {
      capturedLocalPath = localPath;
      return readFile(localPath);
    });
    expect(readBack.equals(bytes)).toBe(true);

    // The staged temp file must not survive past the callback.
    await expect(readFile(capturedLocalPath)).rejects.toThrow();
  });

  it('round-trips a Python step\'s output directory through Storage: stage -> write -> persist -> read -> remove', async () => {
    const {
      discardPrivateImageOutputDirectory,
      persistPrivateImageOutputDirectory,
      readPrivateImage,
      resolvePrivateImageOutputDirectory,
    } = await import('./book-storage');
    const { writeFile, readdir } = await import('node:fs/promises');
    const path = await import('node:path');

    // Simulates what renderPrivatePdfBatch does around the Python subprocess:
    // get a scratch directory, have "Python" write into it, then persist.
    const outputDirectory = await resolvePrivateImageOutputDirectory(bookId, runId, 'pages');
    const pageBytes = Buffer.from(`fake rendered page for ${runId}`);
    await writeFile(path.join(outputDirectory, 'page-1.jpg'), pageBytes);

    const fileMap = await persistPrivateImageOutputDirectory(bookId, runId, 'pages', outputDirectory);
    const key = fileMap.get('page-1.jpg');
    expect(key).toBe(`${bookId}/runs/${runId}/pages/page-1.jpg`);
    uploadedImageKeys.push(key!);

    // persistPrivateImageOutputDirectory must have already cleaned up the
    // local scratch directory -- nothing left for discard to do, and this
    // also proves it isn't silently a no-op when it uploads for real.
    await expect(readdir(outputDirectory)).rejects.toThrow();

    const readBack = await readPrivateImage(key!);
    expect(readBack.equals(pageBytes)).toBe(true);

    // discardPrivateImageOutputDirectory on an already-persisted (and thus
    // already-removed) directory is safely a no-op, not an error -- the
    // failure-path cleanup a real caller's catch block would call.
    await expect(discardPrivateImageOutputDirectory(outputDirectory)).resolves.toBeUndefined();
  });

  it('serves an uploaded question-image crop the same way the image-serving routes do', async () => {
    const { persistPrivateImageOutputDirectory, privateImageReference, readPrivateImage, resolvePrivateImageOutputDirectory } = await import('./book-storage');
    const { writeFile } = await import('node:fs/promises');
    const path = await import('node:path');

    const outputDirectory = await resolvePrivateImageOutputDirectory(bookId, runId, 'question-images');
    const cropBytes = Buffer.from(`fake question crop for ${runId}`);
    await writeFile(path.join(outputDirectory, 'q-1-0.jpg'), cropBytes);
    const fileMap = await persistPrivateImageOutputDirectory(bookId, runId, 'question-images', outputDirectory);
    const key = fileMap.get('q-1-0.jpg')!;
    uploadedImageKeys.push(key);

    // What the question-images GET route reconstructs from {bookId, runId,
    // fileName} alone, without ever seeing the DB row's stored value.
    const reconstructed = privateImageReference(bookId, runId, 'question-images', 'q-1-0.jpg');
    expect(reconstructed).toBe(key);
    expect((await readPrivateImage(reconstructed)).equals(cropBytes)).toBe(true);
  });
});
