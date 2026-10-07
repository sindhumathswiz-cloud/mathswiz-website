/**
 * Shrinks a photo in the browser before it is uploaded: a phone photo of a page is several megabytes,
 * but a legible copy needs about 1600 pixels on its long side. Smaller uploads are faster on a school
 * connection and cheaper to store, and the server's size limit then rarely matters.
 */

export const MAX_LONG_SIDE = 1600;
export const JPEG_QUALITY = 0.82;

/** The size to draw at: unchanged if it already fits, otherwise scaled so the long side is `max`. */
export function fitWithin(width: number, height: number, max = MAX_LONG_SIDE): { width: number; height: number; scaled: boolean } {
  const longSide = Math.max(width, height);
  if (!(longSide > max) || !(width > 0) || !(height > 0)) return { width, height, scaled: false };
  const ratio = max / longSide;
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)), scaled: true };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo')); };
    image.src = url;
  });
}

/**
 * Returns a JPEG no larger than MAX_LONG_SIDE on its long side. A file that is already a small JPEG
 * is returned as it is, so nothing is re-compressed needlessly.
 */
export async function downscalePhoto(file: File): Promise<File> {
  if (file.type === 'image/jpeg' && file.size <= 400 * 1024) return file;
  const image = await loadImage(file);
  const size = fitWithin(image.naturalWidth, image.naturalHeight);
  if (!size.scaled && file.type === 'image/jpeg' && file.size <= 2 * 1024 * 1024) return file;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return file;
  // JPEG has no transparency: paint white first so a transparent PNG does not turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) return file;
  return new File([blob], 'working.jpg', { type: 'image/jpeg' });
}
