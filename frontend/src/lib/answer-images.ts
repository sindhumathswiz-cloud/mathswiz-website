/**
 * Photos of handwritten working attached to a written answer. The rules in one place so the
 * upload route, the submit route, the serving route and the exam screen agree.
 */

export const MAX_IMAGES_PER_ANSWER = 3;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Where an uploaded image is served from. Only ever built from a database id, never from user input. */
export const answerImageUrl = (id: string) => `/api/answer-images/${id}`;

/** What is stored in TestResponse.subjectiveImage: the urls as a JSON array, or null when there are none. */
export function encodeImageRefs(urls: string[]): string | null {
  return urls.length > 0 ? JSON.stringify(urls) : null;
}

/**
 * Reads TestResponse.subjectiveImage back into urls. Understands the JSON array above and the older
 * single-url form, and returns only same-site paths, so nothing stored can turn into a link elsewhere.
 */
export function decodeImageRefs(stored: string | null | undefined): string[] {
  if (!stored) return [];
  let candidates: unknown;
  try { candidates = stored.trim().startsWith('[') ? JSON.parse(stored) : [stored]; } catch { return []; }
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((value): value is string => typeof value === 'string' && /^\/api\/answer-images\/[A-Za-z0-9_-]+$/.test(value));
}

/** The real type of an image from its first bytes, ignoring whatever the upload claims. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}
