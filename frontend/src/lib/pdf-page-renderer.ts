import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { discardPrivateImageOutputDirectory, persistPrivateImageOutputDirectory, resolvePrivateImageOutputDirectory, withLocalBookPdfPath } from './book-storage';
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

function runRenderScript(safeInput: string, outputDirectory: string, start: number, end: number, profile: PdfSourceProfile): Promise<RenderedPage[]> {
  const python = process.env.QB_PYTHON_EXECUTABLE || localTool(path.join('python', 'python.exe'), 'python');
  const pdftoppm = process.env.QB_PDFTOPPM_EXECUTABLE || localTool(path.join('native', 'poppler', 'Library', 'bin', 'pdftoppm.exe'), 'pdftoppm');
  const script = path.join(process.cwd(), 'scripts', 'render-pdf-page-batch.py');
  return new Promise((resolve, reject) => {
    // PYTHONIOENCODING is a second, independent safety net for the same
    // Windows cp1252-console encoding crash the script itself now guards
    // against via sys.stdout.reconfigure (see pdf-inventory.ts for the same
    // pattern, and analyze-pdf-pilot.py for where this was first found).
    const child = spawn(python, [script, safeInput, outputDirectory, String(start), String(end), '--dpi', '150', '--pdftoppm', pdftoppm, '--profile', profile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
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

/**
 * inputPath is a stored book PDF's path (LOCAL_DISK) or storage key
 * (SUPABASE) — staged into a real local file for the Python script either
 * way via withLocalBookPdfPath. Its output images are written into a
 * per-batch directory that's either the run's real on-disk home
 * (LOCAL_DISK) or a scratch temp directory uploaded to Supabase Storage
 * once the script finishes (SUPABASE) — see book-storage.ts.
 */
export function renderPrivatePdfBatch(inputPath: string, bookId: string, runId: string, start: number, end: number, profile: PdfSourceProfile): Promise<RenderedPage[]> {
  return withLocalBookPdfPath(inputPath, async (safeInput) => {
    const outputDirectory = await resolvePrivateImageOutputDirectory(bookId, runId, 'pages');
    let pages: RenderedPage[];
    try {
      pages = await runRenderScript(safeInput, outputDirectory, start, end, profile);
    } catch (error) {
      await discardPrivateImageOutputDirectory(outputDirectory);
      throw error;
    }
    const fileMap = await persistPrivateImageOutputDirectory(bookId, runId, 'pages', outputDirectory);
    return pages.map((page) => ({
      ...page,
      imagePath: fileMap.get(path.basename(page.imagePath)) ?? page.imagePath,
      processedImagePath: page.processedImagePath ? (fileMap.get(path.basename(page.processedImagePath)) ?? page.processedImagePath) : null,
    }));
  });
}
