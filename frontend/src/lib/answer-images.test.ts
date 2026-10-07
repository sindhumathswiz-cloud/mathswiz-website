import { describe, expect, it } from 'vitest';
import { answerImageUrl, decodeImageRefs, encodeImageRefs, sniffImageType } from './answer-images';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('answer images', () => {
  it('recognises real images by their first bytes, whatever the upload says', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('image/jpeg');
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('image/png');
    const webp = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([1, 2, 3, 4], [...'WEBP'].map(c => c.charCodeAt(0))));
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });

  it('stores urls as JSON and reads them back, with none stored as null', () => {
    const urls = [answerImageUrl('abc'), answerImageUrl('d_e-f')];
    expect(decodeImageRefs(encodeImageRefs(urls))).toEqual(urls);
    expect(encodeImageRefs([])).toBeNull();
    expect(decodeImageRefs(null)).toEqual([]);
  });

  it('reads the older single-url form but refuses anything that is not one of our own image paths', () => {
    expect(decodeImageRefs('/api/answer-images/abc123')).toEqual(['/api/answer-images/abc123']);
    expect(decodeImageRefs('https://evil.example/x.png')).toEqual([]);
    expect(decodeImageRefs('javascript:alert(1)')).toEqual([]);
    expect(decodeImageRefs(JSON.stringify(['/api/answer-images/ok', '//evil.example', '/api/answer-images/../secret']))).toEqual(['/api/answer-images/ok']);
    expect(decodeImageRefs('[not json')).toEqual([]);
  });
});
