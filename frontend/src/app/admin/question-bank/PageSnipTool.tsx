'use client';

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crop, Loader2 } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';

/**
 * Draw-a-rectangle-over-the-source-PDF-page tool: lets an admin recover
 * content the extraction pipeline got wrong (garbled symbols, a formula
 * near a figure, etc.) by snipping the actual page region, OCRing just that
 * crop via Mathpix, and pasting the result into the question or solution
 * field they're editing -- rather than retyping LaTeX from a screenshot.
 * Backed by GET/POST .../pages/[pageNumber]/{image,snip}.
 */

type DisplayRect = { x: number; y: number; w: number; h: number };

export default function PageSnipTool({
  bookId,
  initialPage,
  onInsert,
}: {
  bookId: string;
  initialPage: number | null;
  onInsert: (text: string, target: 'content' | 'explanation') => void;
}) {
  const [page, setPage] = useState(initialPage && initialPage > 0 ? initialPage : 1);
  const [pageInput, setPageInput] = useState(String(page));
  const [imgError, setImgError] = useState(false);
  const [selection, setSelection] = useState<DisplayRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [snipping, setSnipping] = useState(false);
  const [snipText, setSnipText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goToPage = (next: number) => {
    const clamped = Math.max(1, next);
    setPage(clamped);
    setPageInput(String(clamped));
    setImgError(false);
    setSelection(null);
    setSnipText(null);
    setError(null);
  };

  const pointerPos = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    // The container scrolls (the page image is almost always taller than its
    // viewer), so positions must include scroll offset to stay anchored to
    // the image content rather than the container's visible viewport.
    return { x: e.clientX - rect.left + el.scrollLeft, y: e.clientY - rect.top + el.scrollTop };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    const p = pointerPos(e);
    dragStart.current = p;
    setDragging(true);
    setSelection({ x: p.x, y: p.y, w: 0, h: 0 });
    setSnipText(null);
    setError(null);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart.current) return;
    const p = pointerPos(e);
    const start = dragStart.current;
    setSelection({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  };

  const endDrag = () => setDragging(false);

  const snip = async () => {
    const img = imgRef.current;
    if (!img || !selection || selection.w < 5 || selection.h < 5) return;
    setSnipping(true);
    setError(null);
    setSnipText(null);
    try {
      const scaleX = img.naturalWidth / img.clientWidth;
      const scaleY = img.naturalHeight / img.clientHeight;
      const region = {
        x: Math.round(selection.x * scaleX),
        y: Math.round(selection.y * scaleY),
        width: Math.round(selection.w * scaleX),
        height: Math.round(selection.h * scaleY),
      };
      const res = await fetch(`/api/admin/books/${bookId}/pages/${page}/snip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(region),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Snip failed');
      setSnipText(data.text || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snip failed');
    } finally {
      setSnipping(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="number"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={() => { const n = parseInt(pageInput, 10); if (Number.isInteger(n) && n > 0) goToPage(n); else setPageInput(String(page)); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm text-center"
        />
        <button type="button" onClick={() => goToPage(page + 1)} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50">
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-400">Drag a box over the text/math to snip, then extract it.</span>
      </div>

      <div
        className="relative select-none overflow-auto rounded-xl border border-gray-200 bg-gray-50"
        style={{ maxHeight: 420 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {imgError ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">No rendered image for page {page}.</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={`/api/admin/books/${bookId}/pages/${page}/image`}
            alt={`Page ${page}`}
            draggable={false}
            onError={() => setImgError(true)}
            className="block w-full cursor-crosshair"
          />
        )}
        {selection && (
          <div
            className="pointer-events-none absolute border-2 border-indigo-500 bg-indigo-500/10"
            style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => void snip()}
        disabled={!selection || selection.w < 5 || selection.h < 5 || snipping}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {snipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crop className="h-3.5 w-3.5" />} Snip &amp; Extract
      </button>

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}

      {snipText !== null && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-indigo-500">Extracted</p>
          <pre className="mb-2 whitespace-pre-wrap break-words font-mono text-xs text-gray-700">{snipText || '(nothing recognized in that region)'}</pre>
          {snipText && (
            <div className="mb-3 rounded-lg bg-white p-2 text-sm">
              <MathRenderer content={snipText} />
            </div>
          )}
          {snipText && (
            <div className="flex gap-2">
              <button type="button" onClick={() => onInsert(snipText, 'content')} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                Insert into Question
              </button>
              <button type="button" onClick={() => onInsert(snipText, 'explanation')} className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100">
                Insert into Solution
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
