import { EventEmitter } from 'node:events';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const withLocalPageImagePath = vi.fn((imagePath: string, fn: (p: string) => Promise<unknown>) => fn(imagePath));
const resolvePrivateImageOutputDirectory = vi.fn(async (bookId: string, runId: string) => `/private/${bookId}/runs/${runId}/question-images`);
// Defaults to an empty map -- cropPageRegion's `fileMap.get(fileName) ?? result.outputPath`
// fallback then returns the crop script's own reported path, exactly like the
// (unstaged, LOCAL_DISK-only) behavior this test suite covered before. Tests
// that care about the staged/uploaded path set this per-call instead.
const persistPrivateImageOutputDirectory = vi.fn(async () => new Map<string, string>());
const discardPrivateImageOutputDirectory = vi.fn(async () => undefined);
const spawn = vi.fn();

vi.mock('./book-storage', () => ({ withLocalPageImagePath, resolvePrivateImageOutputDirectory, persistPrivateImageOutputDirectory, discardPrivateImageOutputDirectory }));
// Vitest 4 checks a mocked built-in module's shape against the real one —
// node:child_process exposes a `default` (mirroring its named exports) via
// its ESM interop shim, so the mock needs a `default` key too or Vitest
// rejects it with "No 'default' export is defined on the mock."
vi.mock('node:child_process', () => ({ spawn, default: { spawn } }));

class FakeChildProcess extends EventEmitter {
  // Real ChildProcess.stdout/stderr are Readable streams — page-image-crop.ts
  // calls `.setEncoding('utf8')` on them, which a plain EventEmitter doesn't
  // have. PassThrough is a real stream (so setEncoding works) that still
  // lets the test drive it by hand with `.emit('data', ...)`.
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn();
}

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('cropPageRegion', () => {
  let child: FakeChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    withLocalPageImagePath.mockImplementation((imagePath: string, fn: (p: string) => Promise<unknown>) => fn(imagePath));
    resolvePrivateImageOutputDirectory.mockImplementation(async (bookId: string, runId: string) => `/private/${bookId}/runs/${runId}/question-images`);
    persistPrivateImageOutputDirectory.mockResolvedValue(new Map());
    child = new FakeChildProcess();
    spawn.mockReturnValue(child);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns the crop script with rounded pixel args and resolves the crop result', async () => {
    const { cropPageRegion } = await import('./page-image-crop');

    const promise = cropPageRegion('book-1', 'run-1', '/private/book-1/runs/run-1/pages/page-3.jpg', 'q-1-0.jpg', {
      x: 10.4, y: 20.6, width: 300.2, height: 150.9,
    });
    await nextTick();

    expect(withLocalPageImagePath).toHaveBeenCalledWith('/private/book-1/runs/run-1/pages/page-3.jpg', expect.any(Function));
    expect(resolvePrivateImageOutputDirectory).toHaveBeenCalledWith('book-1', 'run-1', 'question-images');
    expect(spawn).toHaveBeenCalledTimes(1);
    const [, args] = spawn.mock.calls[0];
    // The source code builds the output path with `path.join`, which
    // normalizes to the platform's own separator (backslashes on Windows) —
    // build the expectation the same way instead of hardcoding forward
    // slashes, so this passes on both Windows dev machines and Linux CI.
    const expectedOutputPath = path.join('/private/book-1/runs/run-1/question-images', 'q-1-0.jpg');
    expect(args).toEqual(expect.arrayContaining([
      '/private/book-1/runs/run-1/pages/page-3.jpg',
      expectedOutputPath,
      '--x', '10', '--y', '21', '--width', '300', '--height', '151',
    ]));

    child.stdout.emit('data', JSON.stringify({ outputPath: '/private/book-1/runs/run-1/question-images/q-1-0.jpg', width: 300, height: 151 }));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      imagePath: '/private/book-1/runs/run-1/question-images/q-1-0.jpg',
      width: 300,
      height: 151,
    });
    expect(persistPrivateImageOutputDirectory).toHaveBeenCalledWith('book-1', 'run-1', 'question-images', '/private/book-1/runs/run-1/question-images');
  });

  it('returns the persisted (e.g. uploaded Supabase) path when the output directory was staged', async () => {
    persistPrivateImageOutputDirectory.mockResolvedValue(new Map([['q-1-0.jpg', 'book-1/runs/run-1/question-images/q-1-0.jpg']]));
    const { cropPageRegion } = await import('./page-image-crop');

    const promise = cropPageRegion('book-1', 'run-1', '/private/page-3.jpg', 'q-1-0.jpg', { x: 0, y: 0, width: 10, height: 10 });
    await nextTick();
    child.stdout.emit('data', JSON.stringify({ outputPath: '/tmp/qb-question-images-abc/q-1-0.jpg', width: 10, height: 10 }));
    child.emit('close', 0);

    await expect(promise).resolves.toEqual({
      imagePath: 'book-1/runs/run-1/question-images/q-1-0.jpg',
      width: 10,
      height: 10,
    });
  });

  it('rejects when the script reports an error object even with exit code 0', async () => {
    const { cropPageRegion } = await import('./page-image-crop');
    const promise = cropPageRegion('book-1', 'run-1', '/private/page-3.jpg', 'q-1-0.jpg', { x: 0, y: 0, width: 10, height: 10 });
    await nextTick();

    child.stdout.emit('data', JSON.stringify({ error: 'cannot identify image file' }));
    child.emit('close', 0);

    await expect(promise).rejects.toThrow('cannot identify image file');
    expect(discardPrivateImageOutputDirectory).toHaveBeenCalledWith('/private/book-1/runs/run-1/question-images');
  });

  it('rejects with stderr when the script exits non-zero and stdout is not valid JSON', async () => {
    const { cropPageRegion } = await import('./page-image-crop');
    const promise = cropPageRegion('book-1', 'run-1', '/private/page-3.jpg', 'q-1-0.jpg', { x: 0, y: 0, width: 10, height: 10 });
    await nextTick();

    child.stderr.emit('data', 'Traceback: something exploded\n');
    child.emit('close', 1);

    await expect(promise).rejects.toThrow('Traceback: something exploded');
  });

  it('rejects immediately on spawn error (e.g. python not found)', async () => {
    const { cropPageRegion } = await import('./page-image-crop');
    const promise = cropPageRegion('book-1', 'run-1', '/private/page-3.jpg', 'q-1-0.jpg', { x: 0, y: 0, width: 10, height: 10 });
    await nextTick();

    child.emit('error', new Error('ENOENT: python not found'));

    await expect(promise).rejects.toThrow('ENOENT: python not found');
  });

  it('rejects a file name that is not a plain .jpg basename, without spawning', async () => {
    const { cropPageRegion } = await import('./page-image-crop');
    await expect(cropPageRegion('book-1', 'run-1', '/private/page-3.jpg', '../escape.jpg', { x: 0, y: 0, width: 10, height: 10 }))
      .rejects.toThrow('Invalid question image file name');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('validates (or stages) the source image before spawning', async () => {
    withLocalPageImagePath.mockRejectedValue(new Error('Invalid private page image path'));
    const { cropPageRegion } = await import('./page-image-crop');
    await expect(cropPageRegion('book-1', 'run-1', '/etc/passwd', 'q-1-0.jpg', { x: 0, y: 0, width: 10, height: 10 }))
      .rejects.toThrow('Invalid private page image path');
    expect(spawn).not.toHaveBeenCalled();
  });
});
