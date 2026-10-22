import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { sanitizeLatex } from './latex-sanitize';
import { mathBlocks } from './question-qa';

const renders = (s: string) => mathBlocks(s).every((b) => {
  try { katex.renderToString(b, { throwOnError: true, strict: false, displayMode: true }); return true; } catch { return false; }
});
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe('sanitizeLatex', () => {
  it('leaves an aligned block that already sits in $$ on its own lines wrapped once', () => {
    const src = String.raw`Let $t=\tan ^{-1} x$
$$
\begin{aligned}
\int_{0}^{1} \frac{\tan ^{-1} x}{1+x^{2}} d x & =\int_{0}^{\frac{\pi}{4}} t d t \\
& =\frac{\pi^{2}}{32}
\end{aligned}
$$`;
    const out = sanitizeLatex(src);
    expect(count(out, '$$')).toBe(2);
    expect(renders(out)).toBe(true);
  });

  it('still wraps a bare aligned block, and leaves one inside single-$ maths alone', () => {
    // ("$$" in a replacement string is one "$": a bare block has always been wrapped as inline maths.)
    const bare = sanitizeLatex(String.raw`We have \begin{aligned} y & = x \\ & = 1 \end{aligned} so done.`);
    expect(bare).toContain(String.raw`$\begin{aligned}`);
    expect(renders(bare)).toBe(true);
    const inline = sanitizeLatex(String.raw`(i)$\begin{aligned} y & = x \end{aligned}$ (ii)$x$`);
    expect(count(inline, '$$')).toBe(0);
  });

  it('wraps a bare matrix answer in maths, keeps a bare formula around a matrix one formula, and leaves one in maths alone', () => {
    const bare = sanitizeLatex(String.raw`\begin{bmatrix} 7 & 5 \\ -11 & -8 \end{bmatrix}`);
    expect(bare.trim()).toBe(String.raw`$\begin{bmatrix} 7 & 5 \\ -11 & -8 \\\end{bmatrix}$`);
    expect(renders(bare)).toBe(true);
    const bracketed = sanitizeLatex(String.raw`\frac{1}{24}\left[\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}\right]`);
    expect(renders(bracketed)).toBe(true);
    expect(bracketed.split('$').length - 1).toBe(2);
    const inMaths = sanitizeLatex(String.raw`Let $A = \begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}$.`);
    expect(inMaths.split('$').length - 1).toBe(2);
  });

  it('splits two inline formulas that touch, but not a display block', () => {
    const touching = sanitizeLatex(String.raw`Sol. $f(x)=\cot ^{-1} x$$\begin{aligned} f'(x) & =2 \end{aligned}$`);
    expect(touching).toContain(String.raw`\cot ^{-1} x$ $`);
    expect(renders(touching)).toBe(true);
    const display = sanitizeLatex('Hence\n$$\nx = 1\n$$\ndone');
    expect(count(display, '$$')).toBe(2);
  });

  it('keeps an inline formula that spans lines on one line, so a line starting "+ " is not read as a list', () => {
    const src = 'Since$\\begin{array}{l}\n| \\vec{a} | ^ { 2 } \\\\\n+ \\vec { b } + \\vec { c } = \\sqrt { 3 } x\n\\end{array}$so done.';
    const out = sanitizeLatex(src);
    expect(out).not.toMatch(/\n\+ /);
    expect(out).toContain('\\\\ + \\vec { b }');
    const display = sanitizeLatex('So\n$$\nx = 1 \\\\\n+ y\n$$\n');
    expect(display).toContain('\n+ y');
  });

  it('restores backslash commands a broken escape turned into control characters', () => {
    const broken = 'Evaluate $\\cot\\left[\\frac{1}{2}\\sin^{-1}\\left(\\frac{\\sqrt{3}}{2}\right)\\right]$ and $a \times b$, $\frac{1}{2}$, $\beta$, $\vec{a}$.';
    const out = sanitizeLatex(broken);
    expect(out).toContain(String.raw`\right)`);
    expect(out).toContain(String.raw`a \times b`);
    expect(out).toContain(String.raw`\frac{1}{2}`);
    expect(out).toContain(String.raw`\beta`);
    expect(out).toContain(String.raw`\vec{a}`);
    expect(renders(out)).toBe(true);
    // An ordinary tab or line break is not touched.
    expect(sanitizeLatex('a\tb\r\nc')).toBe('a\tb\r\nc');
  });
});
