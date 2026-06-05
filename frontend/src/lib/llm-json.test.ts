import { describe, it, expect } from 'vitest';
import { parseLLMJson, repairJson, stripFences } from './llm-json';

describe('parseLLMJson', () => {
  it('parses already-valid JSON unchanged', () => {
    expect(parseLLMJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('preserves genuine \\n newlines in valid JSON', () => {
    const out = parseLLMJson<{ a: string }>('{"a":"line1\\nline2"}');
    expect(out?.a).toBe('line1\nline2');
  });

  it('strips ```json fences', () => {
    expect(parseLLMJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores preamble/commentary around the object', () => {
    expect(parseLLMJson('Sure! Here you go:\n{"a":1} hope this helps')).toEqual({ a: 1 });
  });

  it('removes trailing commas', () => {
    expect(parseLLMJson('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  // ── The core LaTeX cases ────────────────────────────────────────────────
  it('repairs invalid LaTeX escapes that would throw (\\sqrt, \\int, \\alpha)', () => {
    const out = parseLLMJson<{ q: string }>('{"q":"$\\sqrt{2}+\\int x\\,dx+\\alpha$"}');
    expect(out?.q).toBe('$\\sqrt{2}+\\int x\\,dx+\\alpha$');
  });

  it('repairs valid-but-corrupting LaTeX escapes mixed with invalid ones (\\frac, \\times, \\sqrt)', () => {
    const out = parseLLMJson<{ q: string }>('{"q":"$\\frac{1}{2}\\times\\sqrt{3}\\neq 0$"}');
    expect(out?.q).toBe('$\\frac{1}{2}\\times\\sqrt{3}\\neq 0$');
  });

  it('handles a realistic questions payload with heavy LaTeX', () => {
    const raw = '{"questions":[{"content":"Evaluate $\\lim_{x\\to0}\\frac{\\sin x}{x}$","correctAnswer":"$1$"}]}';
    const out = parseLLMJson<{ questions: { content: string; correctAnswer: string }[] }>(raw);
    expect(out?.questions[0].content).toBe('Evaluate $\\lim_{x\\to0}\\frac{\\sin x}{x}$');
    expect(out?.questions[0].correctAnswer).toBe('$1$');
  });

  it('returns null for unrecoverable junk', () => {
    expect(parseLLMJson('not json at all')).toBeNull();
    expect(parseLLMJson('')).toBeNull();
    expect(parseLLMJson(null)).toBeNull();
  });
});

describe('helpers', () => {
  it('stripFences trims fences and whitespace', () => {
    expect(stripFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('repairJson doubles a lone LaTeX backslash', () => {
    // raw (single-backslash) -> repaired (double) so JSON.parse succeeds
    const repaired = repairJson('{"q":"\\sqrt"}');
    expect(JSON.parse(repaired)).toEqual({ q: '\\sqrt' });
  });
});
