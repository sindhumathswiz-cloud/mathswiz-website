import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { benchmarkGeminiVision, benchmarkMathpixOcr } from './book-vision-benchmark';

const root = path.join(process.cwd(), 'tmp', 'vision-benchmark-tests');
const imagePath = path.join(root, 'book-1', 'runs', 'run-1', 'pages', 'page-001.jpg');

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function prepareImage() {
  vi.stubEnv('QB_PRIVATE_STORAGE_ROOT', root);
  await mkdir(path.dirname(imagePath), { recursive: true });
  await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
}

describe('book vision benchmark guards', () => {
  it('does not call Gemini without a configured key', async () => {
    await prepareImage();
    for (const key of ['GEMINI_API_KEY', 'GEMINI_API_KEY_1', 'GEMINI_API_KEY_2', 'GEMINI_API_KEY_3', 'GEMINI_API_KEYS']) vi.stubEnv(key, '');
    await expect(benchmarkGeminiVision(imagePath)).rejects.toThrow('No Gemini API key is configured');
  });

  it('does not call Mathpix without both credentials', async () => {
    await prepareImage();
    vi.stubEnv('MATHPIX_APP_ID', '');
    vi.stubEnv('MATHPIX_APP_KEY', '');
    await expect(benchmarkMathpixOcr(imagePath)).rejects.toThrow('Mathpix credentials are not configured');
  });
});
