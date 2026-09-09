import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  activeBookStorageBackend,
  hasPdfSignature,
  pdfHash,
  privateQuestionImageDirectory,
  removePrivateBookPdf,
  storePrivateBookPdf,
  validateBookPdf,
} from './book-storage';

// vi.mock below is hoisted above every top-level statement in this file,
// including plain `const x = vi.fn()` declarations — referencing one of
// those directly from the mock factory throws "Cannot access before
// initialization" (the const hasn't run yet when the factory executes).
// vi.hoisted() runs its callback as part of that same hoisting pass, so
// these are ready by the time the factory below needs them.
const { upload, remove, from, createClient } = vi.hoisted(() => {
  const upload = vi.fn();
  const remove = vi.fn();
  const from = vi.fn(() => ({ upload, remove }));
  const createClient = vi.fn(() => ({ storage: { from } }));
  return { upload, remove, from, createClient };
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
});
