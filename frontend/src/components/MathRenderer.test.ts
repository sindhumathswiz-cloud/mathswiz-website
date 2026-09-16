import { describe, expect, it } from 'vitest';
import { sanitizeLatex } from './MathRenderer';

describe('sanitizeLatex', () => {
  it('wraps a bare \\vec expression that has no other recognized LaTeX command', () => {
    // Regression: previously only \cdot, \times, etc. triggered auto-wrap,
    // so an options string like this rendered as literal unrendered text
    // ("|\vec{a}| |\vec{b}|" shown on-screen instead of the math).
    const result = sanitizeLatex('|\\vec{a}| |\\vec{b}|');
    expect(result).toBe('$|\\vec{a}| |\\vec{b}|$');
  });

  it('still wraps a segment that mixes \\vec with an already-recognized command', () => {
    const result = sanitizeLatex('\\vec{a} \\cdot \\vec{b}');
    expect(result).toBe('$\\vec{a} \\cdot \\vec{b}$');
  });

  it('wraps other common accent/decoration commands', () => {
    expect(sanitizeLatex('\\hat{x}')).toBe('$\\hat{x}$');
    expect(sanitizeLatex('\\overrightarrow{AB}')).toBe('$\\overrightarrow{AB}$');
    expect(sanitizeLatex('\\dfrac{1}{2}')).toBe('$\\dfrac{1}{2}$');
  });

  it('leaves plain text with no LaTeX untouched', () => {
    expect(sanitizeLatex('Choose the correct option.')).toBe('Choose the correct option.');
  });

  it('does not double-wrap content already inside $...$', () => {
    expect(sanitizeLatex('$\\vec{a}$')).toBe('$\\vec{a}$');
  });

  it('does not corrupt a \\begin{aligned} block already wrapped in single $...$ (PageSnipTool OCR output)', () => {
    // Regression: Mathpix OCR on a snipped region commonly returns each step
    // as its own inline "$\begin{aligned}...\end{aligned}$" block. The old
    // "wrap bare aligned in display math" step only guarded against an
    // existing $$ (display) wrapper, not a single $ (inline) one, so it
    // injected a redundant $$...$$ around already-valid content -- e.g.
    // "(i)$\begin{aligned}...\end{aligned}$(ii)$..." became
    // "(i)$\n$$\begin{aligned}...\end{aligned}$$\n$(ii)$...", which KaTeX
    // can't parse (rendered as a red error instead of the equation).
    const raw = '(i)$\\begin{aligned}\nA \\times B & = \\{ 1,3,5 \\} \\times \\{ 2,3 \\}\n\\end{aligned}$(ii)$c = d$';
    const result = sanitizeLatex(raw);
    expect(result).not.toContain('$$');
    expect(result).toBe('(i)$\\begin{aligned}\nA \\times B & = \\{ 1,3,5 \\} \\times \\{ 2,3 \\}\n\\\\\\end{aligned}$(ii)$c = d$');
  });
});
