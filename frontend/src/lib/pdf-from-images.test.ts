import { describe, expect, it } from 'vitest';
import { buildPdfFromJpegs, looksLikeJpeg } from './pdf-from-images';

// Not a viewable picture, but it has the JPEG signature, which is all the writer checks and embeds as-is.
const fakeJpeg = (size: number, fill = 7) => { const bytes = new Uint8Array(size).fill(fill); bytes.set([0xff, 0xd8, 0xff, 0xe0], 0); return bytes; };
const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

describe('buildPdfFromJpegs', () => {
  const pages = [
    { jpeg: fakeJpeg(300, 1), width: 1200, height: 1600 },
    { jpeg: fakeJpeg(500, 2), width: 1500, height: 1000 },
    { jpeg: fakeJpeg(400, 3), width: 800, height: 800 },
  ];
  const pdf = buildPdfFromJpegs(pages);
  const source = text(pdf);

  it('writes a PDF with the right header, trailer and page count', () => {
    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(source).toContain('/Count 3');
    expect(source.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(source).toContain('/Size 12'); // 1 catalog + 1 page tree + 3 x 3 objects, plus the free entry
  });

  it('sizes each page to its image at 150 dpi and embeds the image untouched', () => {
    expect(source).toContain('/MediaBox [0 0 576 768]'); // 1200 x 1600 px
    expect(source).toContain('/MediaBox [0 0 720 480]'); // 1500 x 1000 px
    expect(source).toContain('/Filter /DCTDecode');
    expect(source).toContain('/Width 1200 /Height 1600');
    // The page's JPEG bytes appear exactly as given.
    const second = source.indexOf('/Width 1500');
    const streamStart = source.indexOf('stream\n', second) + 'stream\n'.length;
    expect(Array.from(pdf.slice(streamStart, streamStart + 500)).every((b, i) => b === pages[1].jpeg[i])).toBe(true);
  });

  it('has a cross-reference table whose offsets point at the objects they name', () => {
    const startxref = Number(source.match(/startxref\n(\d+)\n%%EOF/)![1]);
    expect(source.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...source.slice(startxref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(11);
    entries.forEach((offset, index) => expect(source.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`));
  });

  it('refuses no pages, a page that is not a JPEG, and a page without a size', () => {
    expect(() => buildPdfFromJpegs([])).toThrow(/at least one page/);
    expect(() => buildPdfFromJpegs([{ jpeg: new Uint8Array([1, 2, 3, 4, 5]), width: 10, height: 10 }])).toThrow(/not a JPEG/);
    expect(() => buildPdfFromJpegs([{ jpeg: fakeJpeg(50), width: 0, height: 10 }])).toThrow(/no size/);
  });
});

describe('looksLikeJpeg', () => {
  it('recognises the JPEG signature only', () => {
    expect(looksLikeJpeg(fakeJpeg(20))).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});
