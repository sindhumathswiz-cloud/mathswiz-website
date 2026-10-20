import { deflateSync } from "node:zlib";

/**
 * A small PNG writer for tests: a "screenshot" with a coloured frame and a darker band for a toolbar at the top,
 * so cropping and splitting can be checked from the pictures that come back. No dependencies.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export interface ScreenshotOptions {
  width: number;
  height: number;
  /** Height of a dark "browser toolbar" band across the top, in pixels. */
  toolbar?: number;
  /** Two pages side by side (left and right), each tinted differently, with a dark gutter line between. */
  spread?: boolean;
  /** Base tint so each image is distinguishable. */
  seed?: number;
}

export function screenshotPng({ width, height, toolbar = 0, spread = false, seed = 0 }: ScreenshotOptions): Buffer {
  const row = 1 + width * 3;
  const raw = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      let r = 250, g = 248, b = 242;
      if (y < toolbar) { r = 40; g = 44; b = 52; }
      else if (spread) {
        const left = x < width / 2;
        r = left ? 250 - (seed * 9) % 40 : 236;
        g = left ? 245 : 242 - (seed * 7) % 30;
        b = left ? 235 : 252;
        if (Math.abs(x - width / 2) < 2) { r = 90; g = 90; b = 90; }
      } else { r = 250 - (seed * 9) % 40; g = 245; b = 240 - (seed * 5) % 30; }
      // A darker frame so edges are visible in the picture.
      if (y >= toolbar && (y < toolbar + 4 || y >= height - 4 || x < 4 || x >= width - 4)) { r = 30; g = 30; b = 30; }
      const at = y * row + 1 + x * 3;
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0; // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
