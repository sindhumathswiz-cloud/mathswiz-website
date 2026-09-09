import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { assertPrivatePageImagePath, privateQuestionImageDirectory } from './book-storage';

/**
 * Crops one diagram/figure region out of an already-rendered page image and
 * saves it as its own private JPEG, for attaching to a Question as a
 * QuestionImage. Thin wrapper around scripts/crop-page-region.py, mirroring
 * pdf-page-renderer.ts's spawn pattern (same Python resolution, same
 * stdout-is-JSON contract).
 */

export interface PageDiagramRegion {
  // Pixel coordinates, relative to the source page image these came from
  // (the same image Mathpix OCR'd) — NOT normalized/fractional.
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface CroppedQuestionImage {
  imagePath: string;
  width: number;
  height: number;
}

function localTool(relativePath: string, fallback: string) {
  const candidate = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', relativePath);
  return existsSync(candidate) ? candidate : fallback;
}

function runCropScript(python: string, script: string, args: string[]): Promise<{ outputPath: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Region crop timed out')); }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      let parsed: any;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return reject(new Error(stderr.trim() || `Region crop exited with code ${code}`));
      }
      if (code !== 0 || parsed?.error) return reject(new Error(parsed?.error || stderr.trim() || `Region crop exited with code ${code}`));
      resolve(parsed);
    });
  });
}

/**
 * Crops `region` out of `sourceImagePath` (a whole rendered page image) and
 * writes the result into that book/run's private question-images directory
 * under a caller-supplied file name, returning the crop's own path + final
 * pixel size (post-clamp, so may differ slightly from the requested region).
 *
 * Best-effort by design: a single bad region should not fail the page it
 * came from, so callers are expected to catch and log rather than let this
 * throw abort a whole extraction batch — see extract-questions/route.ts.
 */
export async function cropPageRegion(
  bookId: string,
  runId: string,
  sourceImagePath: string,
  fileName: string,
  region: PageDiagramRegion,
): Promise<CroppedQuestionImage> {
  const safeSource = assertPrivatePageImagePath(sourceImagePath);
  if (!/^[a-zA-Z0-9_.-]+\.jpg$/.test(fileName)) throw new Error('Invalid question image file name');

  const outputDirectory = privateQuestionImageDirectory(bookId, runId);
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, fileName);

  const python = process.env.QB_PYTHON_EXECUTABLE || localTool(path.join('python', 'python.exe'), 'python');
  const script = path.join(process.cwd(), 'scripts', 'crop-page-region.py');

  const result = await runCropScript(python, script, [
    safeSource,
    outputPath,
    '--x', String(Math.round(region.x)),
    '--y', String(Math.round(region.y)),
    '--width', String(Math.round(region.width)),
    '--height', String(Math.round(region.height)),
  ]);
  return { imagePath: result.outputPath, width: result.width, height: result.height };
}
