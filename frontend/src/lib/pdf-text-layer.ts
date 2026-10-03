import { spawn } from 'node:child_process';
import path from 'node:path';
import { withLocalBookPdfPath } from './book-storage';
import { pythonExecutable } from './pdf-page-renderer';
import { parseTextLayer, type PageTextLayer } from './page-text-layer';

/**
 * Builds the native (embedded-text) text layer for specific pages of a stored
 * book PDF. Free and local -- no rendering and no OCR -- so it is how pages
 * rendered before text layers were stored get one without any provider spend.
 * A page with no usable embedded text (a scan) maps to null.
 */
export function buildNativeTextLayers(storedPdfPath: string, pageNumbers: number[]): Promise<Map<number, PageTextLayer | null>> {
  if (pageNumbers.length === 0) return Promise.resolve(new Map());
  return withLocalBookPdfPath(storedPdfPath, (localPdf) => new Promise<Map<number, PageTextLayer | null>>((resolve, reject) => {
    const script = path.join(process.cwd(), 'scripts', 'extract-pdf-text-layer.py');
    const child = spawn(pythonExecutable(), [script, localPdf, pageNumbers.join(',')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Text layer extraction timed out')); }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Text layer extraction exited with code ${code}`));
      try {
        const parsed = JSON.parse(stdout) as { pages?: Array<{ pageNumber: number; textLayer: unknown }> };
        if (!Array.isArray(parsed.pages)) throw new Error('Invalid text layer response');
        resolve(new Map(parsed.pages.map(page => [page.pageNumber, parseTextLayer(page.textLayer)])));
      } catch (error) {
        reject(error);
      }
    });
  }));
}
