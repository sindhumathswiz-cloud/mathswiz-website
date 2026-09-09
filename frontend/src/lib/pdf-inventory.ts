import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { assertPrivateBookPdfPath } from './book-storage';

export type PdfSourceProfile = 'DIGITAL_MATH' | 'MIXED_LAYOUT_ASSESSMENT' | 'IMAGE_BOOK' | 'PHOTOGRAPHED_BOOK';

export type PdfInventory = {
  pages: number;
  encrypted: boolean;
  outline_items: number;
  sample_character_median: number;
  sample_image_median: number;
  sample_text_rich_pages: number;
  source_profile: PdfSourceProfile;
  metadata: Record<string, string>;
  sample_pages: Record<string, { characters: number; words: number; images: number; preview: string }>;
};

export function inspectPrivatePdf(filePath: string): Promise<PdfInventory> {
  const safePath = assertPrivateBookPdfPath(filePath);
  const bundledPython = path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe');
  const python = process.env.QB_PYTHON_EXECUTABLE || (existsSync(bundledPython) ? bundledPython : 'python');
  const script = path.join(process.cwd(), 'scripts', 'analyze-pdf-pilot.py');
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, safePath], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('PDF inventory timed out')); }, 120_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `PDF inventory exited with code ${code}`));
      try {
        const result = JSON.parse(stdout);
        if (!Array.isArray(result) || !result[0] || result[0].error) throw new Error(result?.[0]?.error || 'Invalid inventory response');
        resolve(result[0] as PdfInventory);
      } catch (error) {
        reject(error);
      }
    });
  });
}
