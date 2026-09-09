import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertPrivateBookPdfPath, privatePageImageDirectory } from './book-storage';
import type { PdfSourceProfile } from './pdf-inventory';

export type RenderedPage = {
  pageNumber: number;
  imagePath: string;
  processedImagePath: string | null;
  width: number;
  height: number;
  nativeText: string;
  nativeCharacters: number;
  embeddedImages: number;
  pageType: string;
  regions: Array<{ [key: string]: string | number | boolean | null }>;
  preprocessing: { operations: string[]; deskewAngle?: number; contrastScore?: number };
  imageQualityScore: number;
};

function localTool(relativePath: string, fallback: string) {
  const candidate = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', relativePath);
  return existsSync(candidate) ? candidate : fallback;
}

export function renderPrivatePdfBatch(inputPath: string, bookId: string, runId: string, start: number, end: number, profile: PdfSourceProfile): Promise<RenderedPage[]> {
  const safeInput = assertPrivateBookPdfPath(inputPath);
  const outputDirectory = privatePageImageDirectory(bookId, runId);
  const python = process.env.QB_PYTHON_EXECUTABLE || localTool(path.join('python', 'python.exe'), 'python');
  const pdftoppm = process.env.QB_PDFTOPPM_EXECUTABLE || localTool(path.join('native', 'poppler', 'Library', 'bin', 'pdftoppm.exe'), 'pdftoppm');
  const script = path.join(process.cwd(), 'scripts', 'render-pdf-page-batch.py');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, safeInput, outputDirectory, String(start), String(end), '--dpi', '150', '--pdftoppm', pdftoppm, '--profile', profile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Page rendering timed out')); }, 180_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Page rendering exited with code ${code}`));
      try {
        const result = JSON.parse(stdout);
        if (!Array.isArray(result.pages)) throw new Error('Invalid page renderer response');
        resolve(result.pages as RenderedPage[]);
      } catch (error) {
        reject(error);
      }
    });
  });
}
