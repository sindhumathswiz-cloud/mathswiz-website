import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Runs the Python unit tests under scripts/ (geometry detectors, text layer,
// render batch) as part of the normal suite. Skipped, with the reason, where no
// Python with numpy is available, so a machine without the pilot tooling
// still gets a green run.
function findPython(): string | null {
  const candidates = [
    process.env.QB_PYTHON_EXECUTABLE,
    path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'python', 'python.exe'),
    'python3',
    'python',
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-c', 'import numpy, PIL, pdfplumber, pypdf'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const python = findPython();

describe('scripts/*.py', () => {
  it.skipIf(!python)('passes its Python unit tests', () => {
    const result = spawnSync(python!, ['-m', 'unittest', ...['test_page_geometry.py', 'test_page_text_layer.py', 'test_render_pdf_page_batch.py'].map(file => path.join('scripts', file))], { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.stderr + result.stdout).toContain('OK');
    expect(result.status).toBe(0);
  });
});
