import { describe, expect, it } from 'vitest';
import { parseRenderOutput } from './pdf-page-renderer';

describe('parseRenderOutput', () => {
  it('removes NUL characters from every string, which Postgres refuses in text columns', () => {
    // As the Python script prints it: JSON escapes for NUL inside the page text, its text layer and its layout.
    const stdout = JSON.stringify({
      pages: [{
        pageNumber: 3,
        nativeText: 'Exercise\u0000 1.2',
        textLayer: { lines: [{ text: '\u0000x\u0000 + 1', x: 0.1 }] },
        regions: [{ kind: 'TEXT', text: 'a\u0000b' }],
        width: 1240,
      }],
    });
    const [page] = parseRenderOutput(stdout) as unknown as Array<Record<string, any>>;
    expect(page.nativeText).toBe('Exercise 1.2');
    expect(page.textLayer.lines[0].text).toBe('x + 1');
    expect(page.regions[0].text).toBe('ab');
    expect(page.width).toBe(1240);
    expect(JSON.stringify(page)).not.toContain('\\u0000');
  });

  it('refuses output without a page list', () => {
    expect(() => parseRenderOutput('{"ok":true}')).toThrow('Invalid page renderer response');
  });
});
