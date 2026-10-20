/**
 * Builds a PDF from page images (one JPEG per page), with no dependencies, so a book captured as
 * screenshots or photos can go through the same upload and extraction pipeline as a PDF.
 *
 * Each page is a PDF page sized to its image (at 150 dpi) with the JPEG drawn across it. JPEG data is
 * embedded as-is (DCTDecode), so nothing is recompressed here.
 */

export interface PageJpeg {
  /** The JPEG file's bytes. */
  jpeg: Uint8Array;
  /** Pixel size of the image. */
  width: number;
  height: number;
}

const POINTS_PER_PIXEL = 72 / 150;
const encoder = new TextEncoder();

const fmt = (value: number) => (Math.round(value * 100) / 100).toString();

/** True for the first bytes of a JPEG file (an SOI marker followed by another marker). */
export const looksLikeJpeg = (bytes: Uint8Array) => bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export function buildPdfFromJpegs(pages: PageJpeg[]): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  pages.forEach((page, index) => {
    if (!looksLikeJpeg(page.jpeg)) throw new Error(`Page ${index + 1} is not a JPEG`);
    if (!(page.width > 0) || !(page.height > 0)) throw new Error(`Page ${index + 1} has no size`);
  });

  // Object numbering: 1 catalog, 2 page tree, then three objects per page (page, content, image).
  const pageObject = (i: number) => 3 + i * 3;
  const contentObject = (i: number) => 4 + i * 3;
  const imageObject = (i: number) => 5 + i * 3;
  const objectCount = 2 + pages.length * 3;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = new Array(objectCount + 1).fill(0);
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const begin = (id: number) => { offsets[id] = length; push(`${id} 0 obj\n`); };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  begin(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(' ')}] >>\nendobj\n`);

  pages.forEach((page, i) => {
    const w = page.width * POINTS_PER_PIXEL;
    const h = page.height * POINTS_PER_PIXEL;
    begin(pageObject(i));
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(w)} ${fmt(h)}] /Resources << /XObject << /Im0 ${imageObject(i)} 0 R >> >> /Contents ${contentObject(i)} 0 R >>\nendobj\n`);

    const content = `q ${fmt(w)} 0 0 ${fmt(h)} 0 0 cm /Im0 Do Q`;
    begin(contentObject(i));
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    begin(imageObject(i));
    push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push('\nendstream\nendobj\n');
  });

  const xrefOffset = length;
  push(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}
