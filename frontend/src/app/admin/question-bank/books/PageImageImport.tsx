'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { buildPdfFromJpegs, type PageJpeg } from '@/lib/pdf-from-images';
import { DEFAULT_OPTIONS, checkImport, cleanOptions, describePlan, planImage, sortByName, type ImportOptions } from '@/lib/page-image-import';

/** Mirrors MAX_BOOK_PDF_BYTES in lib/book-storage.ts (that file reads the disk, so a browser component cannot import it). */
const UPLOAD_LIMIT_BYTES = 250 * 1024 * 1024;
const JPEG_QUALITY = 0.82;
const PREVIEW_WIDTH = 360;

type Source = { file: File; width: number; height: number };

async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * Turns page images (screenshots of an online reader, scans or photos) into one PDF, in the browser, and
 * hands it back to be uploaded exactly like any other book PDF. Nothing is sent to the server here.
 */
export default function PageImageImport({ bookTitle, onPdfReady, onClose }: { bookTitle: string; onPdfReady: (pdf: File) => void; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [firstSize, setFirstSize] = useState<{ width: number; height: number } | null>(null);
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLCanvasElement | null>(null);
  const cancelled = useRef(false);

  const clean = useMemo(() => cleanOptions(options), [options]);
  const problems = useMemo(() => checkImport(files.length, clean, firstSize ?? undefined), [files.length, clean, firstSize]);
  const blocked = problems.some((p) => p.level === 'error');

  useEffect(() => () => { cancelled.current = true; }, []);

  const choose = async (list: FileList | null) => {
    const images = sortByName(Array.from(list ?? []).filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(f.name)));
    setFiles(images);
    setError(null);
    setFirstSize(null);
    if (images[0]) {
      try {
        const bitmap = await loadBitmap(images[0]);
        setFirstSize({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      } catch { setError('The first image could not be read. Is it a PNG, JPEG or WebP picture?'); }
    }
  };

  // Live preview of the first image with the crop and split lines drawn on it.
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas || !files[0] || !firstSize) return;
    let alive = true;
    void (async () => {
      try {
        const bitmap = await loadBitmap(files[0]);
        if (!alive) { bitmap.close(); return; }
        const scale = PREVIEW_WIDTH / bitmap.width;
        canvas.width = PREVIEW_WIDTH;
        canvas.height = Math.round(bitmap.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { bitmap.close(); return; }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        const pages = planImage(0, firstSize.width, firstSize.height, clean);
        // Shade what will be cut away, outline each page that will be kept.
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (const page of pages) ctx.clearRect(page.x * scale, page.y * scale, page.width * scale, page.height * scale);
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        for (const page of pages) ctx.strokeRect(page.x * scale, page.y * scale, page.width * scale, page.height * scale);
      } catch { /* the preview is a convenience */ }
    })();
    return () => { alive = false; };
  }, [files, firstSize, clean]);

  const setCrop = (side: keyof ImportOptions['crop'], percent: number) => setOptions((o) => ({ ...o, crop: { ...o.crop, [side]: (Number.isFinite(percent) ? percent : 0) / 100 } }));

  const build = async () => {
    if (blocked || files.length === 0) return;
    setBusy(true);
    setError(null);
    cancelled.current = false;
    const pages: PageJpeg[] = [];
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot draw images');
      let bytes = 0;
      setProgress({ done: 0, total: files.length });
      for (let index = 0; index < files.length; index++) {
        if (cancelled.current) return;
        const bitmap = await loadBitmap(files[index]).catch(() => { throw new Error(`"${files[index].name}" could not be read as a picture`); });
        for (const page of planImage(index, bitmap.width, bitmap.height, clean)) {
          canvas.width = page.outWidth;
          canvas.height = page.outHeight;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, page.x, page.y, page.width, page.height, 0, 0, page.outWidth, page.outHeight);
          const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
          if (!blob) throw new Error('A page could not be encoded');
          pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: page.outWidth, height: page.outHeight });
          bytes += blob.size;
        }
        bitmap.close();
        // Stop early if it is clear the book will not fit the upload limit.
        const projected = (bytes / (index + 1)) * files.length;
        if (index >= 9 && projected > UPLOAD_LIMIT_BYTES * 1.05) throw new Error(`This book would be about ${Math.round(projected / 1024 / 1024)} MB, over the ${UPLOAD_LIMIT_BYTES / 1024 / 1024} MB upload limit. Import it in two or more parts, or use smaller images.`);
        setProgress({ done: index + 1, total: files.length });
      }
      const pdf = buildPdfFromJpegs(pages);
      if (pdf.length > UPLOAD_LIMIT_BYTES) throw new Error(`The PDF is ${Math.round(pdf.length / 1024 / 1024)} MB, over the ${UPLOAD_LIMIT_BYTES / 1024 / 1024} MB upload limit. Import the book in parts.`);
      const name = `${bookTitle.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'book'}-pages.pdf`;
      onPdfReady(new File([pdf as BlobPart], name, { type: 'application/pdf' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The pages could not be built');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const cropField = (side: keyof ImportOptions['crop'], label: string) => (
    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
      {label}
      <input
        type="number" min={0} max={45} step={1} value={Math.round(options.crop[side] * 100)} disabled={busy}
        onChange={(e) => setCrop(side, Number(e.target.value))}
        data-testid={`crop-${side}`}
        className="mt-1 block w-full rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="page-import-title">
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-surface">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 dark:border-white/10">
          <div>
            <h2 id="page-import-title" className="font-display text-xl font-black text-slate-900 dark:text-white">Import page images</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">For a book you hold the rights to, captured as screenshots, scans or photos of its pages. They become one PDF, which is then uploaded and extracted like any other book.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_auto]">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white">
                <ImagePlus className="h-4 w-4" /> Choose images
                <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="page-images-input" disabled={busy} onChange={(e) => { void choose(e.target.files); e.currentTarget.value = ''; }} />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">
                Choose a folder
                {/* @ts-expect-error webkitdirectory is supported by browsers but not in React's types */}
                <input type="file" webkitdirectory="" multiple className="sr-only" disabled={busy} onChange={(e) => { void choose(e.target.files); e.currentTarget.value = ''; }} />
              </label>
            </div>

            {files.length > 0 && (
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200" data-testid="import-summary">
                {describePlan(files.length, clean)} <span className="font-medium text-slate-500">· in file-name order, {files[0].name} … {files[files.length - 1].name}</span>
              </p>
            )}

            <fieldset className="space-y-3" disabled={busy}>
              <legend className="text-[11px] font-black uppercase tracking-widest text-slate-400">Cut away (percent of each edge)</legend>
              <div className="grid grid-cols-4 gap-2">{cropField('top', 'Top')}{cropField('bottom', 'Bottom')}{cropField('left', 'Left')}{cropField('right', 'Right')}</div>
              <p className="text-xs text-slate-500">Use this to remove the browser toolbar, the reader&apos;s header and any side panels. The shaded area in the preview is what will be cut.</p>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={options.split === 'halves'} data-testid="split-toggle" onChange={(e) => setOptions((o) => ({ ...o, split: e.target.checked ? 'halves' : 'none' }))} />
                Split each image into two pages (it shows an open book)
              </label>
              {options.split === 'halves' && (
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  Where the pages meet: {Math.round(clean.splitAt * 100)}% across
                  <input type="range" min={30} max={70} value={Math.round(options.splitAt * 100)} onChange={(e) => setOptions((o) => ({ ...o, splitAt: Number(e.target.value) / 100 }))} className="mt-1 block w-full" />
                </label>
              )}
            </fieldset>

            {problems.map((p, i) => <p key={i} className={`rounded-lg px-3 py-2 text-xs font-semibold ${p.level === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{p.message}</p>)}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">{error}</p>}
          </div>

          <div className="w-[360px] max-w-full">
            {files.length > 0 && firstSize ? (
              <>
                <canvas ref={preview} className="w-full rounded-xl border border-slate-200 shadow-sm dark:border-white/10" aria-label="Preview of the first image with the cut and split lines" />
                <p className="mt-1 text-[11px] text-slate-400">First image. Outlined = kept pages.</p>
              </>
            ) : <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-400">The first image appears here</div>}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 p-5 dark:border-white/10">
          {progress && <p className="mr-auto text-sm font-bold text-slate-600 dark:text-slate-300" role="status">Preparing pages… {progress.done} of {progress.total}</p>}
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border-2 border-slate-200 px-5 py-2.5 text-sm font-black text-slate-600 disabled:opacity-50 dark:border-white/10 dark:text-slate-300">Cancel</button>
          <button type="button" onClick={() => void build()} disabled={busy || blocked || files.length === 0} data-testid="build-pdf" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-black text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Build PDF and upload
          </button>
        </footer>
      </div>
    </div>
  );
}
