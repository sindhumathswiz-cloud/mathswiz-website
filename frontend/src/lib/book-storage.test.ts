import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  activeBookStorageBackend,
  assertPrivateImageReference,
  discardPrivateImageOutputDirectory,
  hasPdfSignature,
  pdfHash,
  persistPrivateImageOutputDirectory,
  privateImageReference,
  privatePageImageDirectory,
  privateQuestionImageDirectory,
  readPrivateImage,
  removePrivateBookPdf,
  removePrivateImage,
  resolvePrivateImageOutputDirectory,
  storePrivateBookPdf,
  validateBookPdf,
  withLocalBookPdfPath,
  withLocalPageImagePath,
} from './book-storage';

// A minimal Blob-like stand-in for what supabase-js's storage.download()
// resolves `data` to — only `.arrayBuffer()` is ever called on it here.
function fakeBlob(bytes: Buffer) {
  return { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

// vi.mock below is hoisted above every top-level statement in this file,
// including plain `const x = vi.fn()` declarations — referencing one of
// those directly from the mock factory throws "Cannot access before
// initialization" (the const hasn't run yet when the factory executes).
// vi.hoisted() runs its callback as part of that same hoisting pass, so
// these are ready by the time the factory below needs them.
const { upload, remove, download, from, createClient } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const download = vi.fn();
  const from = vi.fn(() => ({ upload, remove, download }));
  const createClient = vi.fn(() => ({ storage: { from } }));
  return { upload, remove, download, from, createClient };
});

// book-storage.ts's own `import { createClient } from '@supabase/supabase-js'`
// resolves to this mock rather than the real package.
vi.mock('@supabase/supabase-js', () => ({ createClient }));

const testRoot = path.join(process.cwd(), 'tmp', 'book-storage-tests');

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.QB_PRIVATE_STORAGE_ROOT;
  delete process.env.QB_STORAGE_BACKEND;
  delete process.env.QB_STORAGE_BUCKET;
  delete process.env.SUPABASE_PROJECT_REF;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  vi.clearAllMocks();
});

describe('private book storage', () => {
  it('validates and stores a PDF outside public assets using its content hash', async () => {
    process.env.QB_PRIVATE_STORAGE_ROOT = testRoot;
    const bytes = Buffer.from('%PDF-1.7\n%%EOF');
    const file = new File([bytes], 'calculus.pdf', { type: 'application/pdf' });
    expect(() => validateBookPdf(file)).not.toThrow();
    expect(hasPdfSignature(bytes)).toBe(true);
    const hash = pdfHash(bytes);
    const storedPath = await storePrivateBookPdf('book-1', hash, bytes);
    expect(storedPath.startsWith(testRoot)).toBe(true);
    expect(await readFile(storedPath)).toEqual(bytes);
  });

  it('rejects files that are not PDFs', () => {
    const file = new File(['not a pdf'], 'notes.txt', { type: 'text/plain' });
    expect(() => validateBookPdf(file)).toThrow('Only PDF files are accepted');
    expect(hasPdfSignature(Buffer.from('not a pdf'))).toBe(false);
  });

  it('defaults to the local-disk backend', () => {
    expect(activeBookStorageBackend()).toBe('LOCAL_DISK');
  });

  describe('privateQuestionImageDirectory', () => {
    beforeEach(() => {
      process.env.QB_PRIVATE_STORAGE_ROOT = testRoot;
    });

    it('resolves a per-run directory under the private storage root', () => {
      const directory = privateQuestionImageDirectory('book-1', 'run-1');
      expect(directory).toBe(path.resolve(testRoot, 'book-1', 'runs', 'run-1', 'question-images'));
    });

    it('rejects ids that could escape the storage root', () => {
      expect(() => privateQuestionImageDirectory('../../etc', 'run-1')).toThrow('Invalid question image directory');
      expect(() => privateQuestionImageDirectory('book-1', '../../etc')).toThrow('Invalid question image directory');
    });
  });

  describe('Supabase Storage backend', () => {
    beforeEach(() => {
      process.env.QB_STORAGE_BACKEND = 'SUPABASE';
      process.env.SUPABASE_PROJECT_REF = 'test-ref';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
    });

    it('reports Supabase as the active backend', () => {
      expect(activeBookStorageBackend()).toBe('SUPABASE');
    });

    it('uploads to the configured bucket and returns a storage key', async () => {
      upload.mockResolvedValue({ data: { path: 'book-1/hash.pdf' }, error: null });
      const bytes = Buffer.from('%PDF-1.7\n%%EOF');
      const hash = pdfHash(bytes);
      const key = await storePrivateBookPdf('book-1', hash, bytes);
      expect(key).toBe(`book-1/${hash}.pdf`);
      expect(from).toHaveBeenCalledWith('book-ingestion');
      expect(upload).toHaveBeenCalledWith(`book-1/${hash}.pdf`, bytes, { upsert: true, contentType: 'application/pdf' });
    });

    it('uses QB_STORAGE_BUCKET when set', async () => {
      process.env.QB_STORAGE_BUCKET = 'custom-bucket';
      upload.mockResolvedValue({ data: {}, error: null });
      const bytes = Buffer.from('%PDF-1.7\n%%EOF');
      await storePrivateBookPdf('book-1', pdfHash(bytes), bytes);
      expect(from).toHaveBeenCalledWith('custom-bucket');
    });

    it('surfaces an upload error instead of returning a bad key', async () => {
      upload.mockResolvedValue({ data: null, error: { message: 'bucket not found' } });
      const bytes = Buffer.from('%PDF-1.7\n%%EOF');
      await expect(storePrivateBookPdf('book-1', pdfHash(bytes), bytes)).rejects.toThrow('bucket not found');
    });

    it('deletes by storage key', async () => {
      remove.mockResolvedValue({ data: [], error: null });
      const hash = 'a'.repeat(64);
      await removePrivateBookPdf(`book-1/${hash}.pdf`);
      expect(remove).toHaveBeenCalledWith([`book-1/${hash}.pdf`]);
    });

    it('rejects a malformed storage key before ever calling Supabase', async () => {
      await expect(removePrivateBookPdf('../../etc/passwd')).rejects.toThrow('Invalid book storage key');
      expect(remove).not.toHaveBeenCalled();
    });

    it('throws a clear error when credentials are missing', async () => {
      // The Supabase client is cached at module scope once created (same
      // pattern as lib/env.ts), so a clean module instance is needed here —
      // otherwise an earlier test's already-cached client would mask a
      // missing-credentials condition that only matters on first use.
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      vi.resetModules();
      const fresh = await import('./book-storage');
      const bytes = Buffer.from('%PDF-1.7\n%%EOF');
      await expect(fresh.storePrivateBookPdf('book-1', fresh.pdfHash(bytes), bytes)).rejects.toThrow('SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY');
    });
  });

  describe('Python-pipeline staging helpers', () => {
    describe('on LOCAL_DISK', () => {
      beforeEach(() => {
        process.env.QB_PRIVATE_STORAGE_ROOT = testRoot;
      });

      it('withLocalBookPdfPath hands the already-stored path straight through, unstaged', async () => {
        const directory = path.join(testRoot, 'book-1');
        await mkdir(directory, { recursive: true });
        const pdfPath = path.join(directory, `${'a'.repeat(64)}.pdf`);
        await writeFile(pdfPath, Buffer.from('%PDF-1.7\n%%EOF'));
        const seen = await withLocalBookPdfPath(pdfPath, async (localPath) => {
          expect(localPath).toBe(path.resolve(pdfPath));
          return readFile(localPath);
        });
        expect(seen.toString()).toContain('%PDF-1.7');
      });

      it('resolvePrivateImageOutputDirectory/persistPrivateImageOutputDirectory round-trip through the real per-run directory', async () => {
        const directory = await resolvePrivateImageOutputDirectory('book-1', 'run-1', 'pages');
        expect(directory).toBe(privatePageImageDirectory('book-1', 'run-1'));
        await writeFile(path.join(directory, 'page-1.jpg'), Buffer.from('jpeg-bytes'));
        const map = await persistPrivateImageOutputDirectory('book-1', 'run-1', 'pages', directory);
        expect(map.get('page-1.jpg')).toBe(path.join(directory, 'page-1.jpg'));
        // LOCAL_DISK's directory is the file's real home, not scratch space —
        // persisting must not delete it.
        expect(await readdir(directory)).toEqual(['page-1.jpg']);
      });

      it('discardPrivateImageOutputDirectory is a no-op for the real on-disk directory', async () => {
        const directory = await resolvePrivateImageOutputDirectory('book-1', 'run-1', 'question-images');
        await writeFile(path.join(directory, 'q-1.jpg'), Buffer.from('bytes'));
        await discardPrivateImageOutputDirectory(directory);
        expect(await readdir(directory)).toEqual(['q-1.jpg']);
      });

      it('privateImageReference/assertPrivateImageReference resolve the same real path readPrivateImage/removePrivateImage use', async () => {
        const directory = privateQuestionImageDirectory('book-1', 'run-1');
        await mkdir(directory, { recursive: true });
        const imagePath = path.join(directory, 'q-1-0.jpg');
        await writeFile(imagePath, Buffer.from('crop-bytes'));
        const reference = privateImageReference('book-1', 'run-1', 'question-images', 'q-1-0.jpg');
        expect(reference).toBe(path.resolve(imagePath));
        expect(assertPrivateImageReference(reference)).toBe(reference);
        expect((await readPrivateImage(reference)).toString()).toBe('crop-bytes');
        await removePrivateImage(reference);
        await expect(readPrivateImage(reference)).rejects.toThrow();
      });
    });

    describe('on SUPABASE', () => {
      beforeEach(() => {
        process.env.QB_STORAGE_BACKEND = 'SUPABASE';
        process.env.SUPABASE_PROJECT_REF = 'test-ref';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      });

      it('withLocalBookPdfPath downloads the object to a temp file and cleans it up either way', async () => {
        download.mockResolvedValue({ data: fakeBlob(Buffer.from('%PDF-1.7\n%%EOF')), error: null });
        const key = `book-1/${'a'.repeat(64)}.pdf`;
        let capturedPath = '';
        const result = await withLocalBookPdfPath(key, async (localPath) => {
          capturedPath = localPath;
          return readFile(localPath);
        });
        expect(download).toHaveBeenCalledWith(key);
        expect(result.toString()).toContain('%PDF-1.7');
        // The temp file (and its containing directory) must not survive the call.
        await expect(readFile(capturedPath)).rejects.toThrow();
      });

      it('withLocalBookPdfPath rejects a malformed key before ever calling Supabase', async () => {
        await expect(withLocalBookPdfPath('../../etc/passwd', async (p) => p)).rejects.toThrow('Invalid book storage key');
        expect(download).not.toHaveBeenCalled();
      });

      it('withLocalPageImagePath downloads a page image to a temp file with the right extension', async () => {
        download.mockResolvedValue({ data: fakeBlob(Buffer.from('jpeg-bytes')), error: null });
        const key = 'book-1/runs/run-1/pages/page-3.jpg';
        const localPath = await withLocalPageImagePath(key, async (p) => p);
        expect(download).toHaveBeenCalledWith(key);
        expect(localPath.endsWith('.jpg')).toBe(true);
      });

      it('resolvePrivateImageOutputDirectory/persistPrivateImageOutputDirectory upload every file and remove the temp directory', async () => {
        upload.mockResolvedValue({ data: {}, error: null });
        const directory = await resolvePrivateImageOutputDirectory('book-1', 'run-1', 'pages');
        await writeFile(path.join(directory, 'page-1.jpg'), Buffer.from('jpeg-bytes'));
        await writeFile(path.join(directory, 'page-1-processed.jpg'), Buffer.from('processed-bytes'));

        const map = await persistPrivateImageOutputDirectory('book-1', 'run-1', 'pages', directory);

        expect(map.get('page-1.jpg')).toBe('book-1/runs/run-1/pages/page-1.jpg');
        expect(map.get('page-1-processed.jpg')).toBe('book-1/runs/run-1/pages/page-1-processed.jpg');
        expect(upload).toHaveBeenCalledWith('book-1/runs/run-1/pages/page-1.jpg', expect.any(Buffer), { upsert: true, contentType: 'image/jpeg' });
        // The scratch temp directory is gone once every file is uploaded.
        await expect(readdir(directory)).rejects.toThrow();
      });

      it('discardPrivateImageOutputDirectory removes the scratch temp directory without uploading anything', async () => {
        const directory = await resolvePrivateImageOutputDirectory('book-1', 'run-1', 'question-images');
        await writeFile(path.join(directory, 'q-1.jpg'), Buffer.from('bytes'));
        await discardPrivateImageOutputDirectory(directory);
        expect(upload).not.toHaveBeenCalled();
        await expect(readdir(directory)).rejects.toThrow();
      });

      it('privateImageReference/assertPrivateImageReference resolve to the same key readPrivateImage/removePrivateImage validate', async () => {
        const reference = privateImageReference('book-1', 'run-1', 'question-images', 'q-1-0.jpg');
        expect(reference).toBe('book-1/runs/run-1/question-images/q-1-0.jpg');
        expect(assertPrivateImageReference(reference)).toBe(reference);

        download.mockResolvedValue({ data: fakeBlob(Buffer.from('crop-bytes')), error: null });
        expect((await readPrivateImage(reference)).toString()).toBe('crop-bytes');

        remove.mockResolvedValue({ data: [], error: null });
        await removePrivateImage(reference);
        expect(remove).toHaveBeenCalledWith([reference]);
      });

      it('rejects a malformed image key on every entry point before calling Supabase', async () => {
        expect(() => assertPrivateImageReference('../../etc/passwd')).toThrow('Invalid private image key');
        await expect(readPrivateImage('../../etc/passwd')).rejects.toThrow('Invalid private image key');
        await expect(removePrivateImage('../../etc/passwd')).rejects.toThrow('Invalid private image key');
        expect(download).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
      });
    });
  });
});
