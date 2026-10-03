'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCopy, Eye, EyeOff, FileText, Loader2, TextCursorInput, ZoomIn, ZoomOut } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { joinSelectedLines, type PageTextLayer } from '@/lib/page-text-layer';
import { describePageList } from '@/lib/page-parity';

/**
 * The book exactly as printed, page for page: each page is the rendered image
 * of the original PDF page (so layout and content are identical by
 * construction) with an invisible, positioned text layer on top. Select text
 * on one page or across several, copy it, or send it straight into the
 * question / option / answer / solution field being edited.
 *
 * Text is copied in the pipeline's own LaTeX convention ($...$), the same
 * text extraction stores, so a pasted formula needs no clean-up.
 */

export interface InsertTarget { id: string; label: string }

interface PageMeta { pageNumber: number; width: number | null; height: number | null; hasImage: boolean; textSource: string | null; garbled: number | null; detectedQuestions: number }
interface Parity { pdfPages: number; pagesHeld: number; matches: boolean; missingPages: number[]; missingImagePages: number[]; unexpectedPages: number[] }
interface Overview {
  bookId: string; bookTitle: string; runId: string; fileName: string; pdfPages: number | null;
  draft: { expiresAt: string | null; purgedAt: string | null; daysRemaining: number | null };
  pages: PageMeta[]; parity: Parity | null;
  textLayers: { native: number; garbledNative: number; ocr: number; none: number } | null;
}
interface PickedLine { page: number; y: number; h: number; text: string }

const ASPECT_FALLBACK = 0.707;
const SELECT_TINT = 'rgba(79, 70, 229, 0.30)';
const LAYER_CSS = `
.srcv-layer ::selection { background: transparent; }
.srcv-line { position: absolute; overflow: hidden; white-space: nowrap; line-height: 1; text-align: justify; text-align-last: justify; }
.srcv-line .math-renderer-container { max-width: none; }
.srcv-line .prose, .srcv-line .prose p { margin: 0; font-size: inherit; line-height: 1; max-width: none; }
.srcv-line .katex { font-size: 1em; }
`;

function lineKey(page: number, line: number, word?: number) { return word === undefined ? `${page}:${line}` : `${page}:${line}:${word}`; }

export default function SourcePageViewer({
  bookId, initialPage, insertTargets, onInsert, height = '78vh', showHeaderLink = true,
}: {
  bookId: string;
  initialPage?: number | null;
  insertTargets?: InsertTarget[];
  onInsert?: (text: string, targetId: string) => void;
  height?: string | number;
  showHeaderLink?: boolean;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<Record<number, PageTextLayer | null>>({});
  const [near, setNear] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(100);
  const [showText, setShowText] = useState(false);
  const [picked, setPicked] = useState<{ keys: Set<string>; lines: PickedLine[]; text: string } | null>(null);
  const [pageInput, setPageInput] = useState(String(initialPage && initialPage > 0 ? initialPage : 1));
  const [copied, setCopied] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);
  const requested = useRef<Set<number>>(new Set());
  const scrolledTo = useRef<number | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/books/${bookId}/source`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the book');
      setOverview(data as Overview);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the book');
    }
  }, [bookId]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  // Which pages are close enough to the viewport to be worth loading.
  useEffect(() => {
    const root = scroller.current;
    if (!root || !overview || overview.pages.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      setNear((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.pageWrap);
          if (entry.isIntersecting) next.add(page); else next.delete(page);
        }
        return next;
      });
    }, { root, rootMargin: '1400px 0px' });
    root.querySelectorAll('[data-page-wrap]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [overview, zoom]);

  // Fetch each nearby page's text layer once.
  useEffect(() => {
    for (const page of near) {
      if (requested.current.has(page)) continue;
      requested.current.add(page);
      void (async () => {
        try {
          const response = await fetch(`/api/admin/books/${bookId}/pages/${page}/text-layer`);
          const data = response.ok ? await response.json() : null;
          setLayers((previous) => ({ ...previous, [page]: data?.textLayer ?? null }));
        } catch {
          requested.current.delete(page);
        }
      })();
    }
  }, [near, bookId]);

  const scrollToPage = useCallback((page: number) => {
    const target = scroller.current?.querySelector(`[data-page-wrap="${page}"]`);
    target?.scrollIntoView({ block: 'start' });
  }, []);

  useEffect(() => {
    if (!overview || overview.pages.length === 0) return;
    const wanted = initialPage && initialPage > 0 ? initialPage : null;
    if (wanted && scrolledTo.current !== wanted) { scrolledTo.current = wanted; requestAnimationFrame(() => scrollToPage(wanted)); }
  }, [overview, initialPage, scrollToPage]);

  // ---- selection -> text -------------------------------------------------
  useEffect(() => {
    let frame = 0;
    const read = () => {
      const root = scroller.current;
      const selection = document.getSelection();
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) { setPicked(null); return; }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return; // a selection elsewhere (e.g. an editor field) leaves ours alone
      const keys = new Set<string>();
      const grouped = new Map<string, PickedLine & { words: string[] }>();
      root.querySelectorAll<HTMLElement>('[data-l]').forEach((el) => {
        if (!range.intersectsNode(el)) return;
        const text = el.firstChild;
        // A range that merely touches the edge of a word has not selected it.
        if (text && text.nodeType === Node.TEXT_NODE) {
          if (text === range.endContainer && range.endOffset === 0) return;
          if (text === range.startContainer && range.startOffset >= (text.textContent?.length ?? 0)) return;
        }
        const page = Number(el.dataset.p);
        const index = Number(el.dataset.l);
        const word = el.dataset.w;
        keys.add(lineKey(page, index, word === undefined ? undefined : Number(word)));
        const layerLine = layersRef.current[page]?.lines[index];
        if (!layerLine) return;
        const groupKey = lineKey(page, index);
        const entry = grouped.get(groupKey) ?? { page, y: layerLine.y, h: layerLine.h, text: '', words: [] };
        if (word !== undefined) entry.words.push(layerLine.words?.[Number(word)]?.[2] ?? '');
        else entry.text = layerLine.text;
        grouped.set(groupKey, entry);
      });
      const lines: PickedLine[] = [...grouped.values()].map((entry) => ({ page: entry.page, y: entry.y, h: entry.h, text: entry.words.length ? entry.words.join(' ') : entry.text })).filter((line) => line.text);
      if (lines.length === 0) { setPicked(null); return; }
      setPicked({ keys, lines, text: joinSelectedLines(lines) });
    };
    const onChange = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); };
    document.addEventListener('selectionchange', onChange);
    return () => { document.removeEventListener('selectionchange', onChange); cancelAnimationFrame(frame); };
  }, []);

  const layersRef = useRef(layers);
  useEffect(() => { layersRef.current = layers; }, [layers]);

  const copySelection = async () => {
    if (!picked) return;
    try { await navigator.clipboard.writeText(picked.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* the native copy shortcut still works */ }
  };

  const selectWholePage = (page: number) => {
    const layer = scroller.current?.querySelector(`[data-layer="${page}"]`);
    if (layer) document.getSelection()?.selectAllChildren(layer);
  };

  const pages = overview?.pages ?? [];
  const goTo = (page: number) => {
    const clamped = Math.min(Math.max(1, page), Math.max(1, pages.length));
    setPageInput(String(clamped));
    scrollToPage(clamped);
  };

  const needsText = useMemo(() => (overview?.textLayers ? overview.textLayers.none + overview.textLayers.garbledNative : 0), [overview]);

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>;
  if (!overview) return <div className="flex h-40 items-center justify-center text-sm text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the book…</div>;

  const purged = Boolean(overview.draft.purgedAt);

  return (
    <div className="flex flex-col gap-3">
      <style>{LAYER_CSS}</style>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-gray-900 dark:text-white">{overview.bookTitle}</p>
          <p className="truncate text-[11px] text-gray-400">{overview.fileName}</p>
        </div>
        <ParityChip parity={overview.parity} pdfPages={overview.pdfPages} purged={purged} />
        <DraftChip bookId={bookId} runId={overview.runId} draft={overview.draft} onExtended={loadOverview} />
        {showHeaderLink && <Link href={`/admin/question-bank/books/${bookId}/source`} target="_blank" className="text-[11px] font-bold text-indigo-600 hover:underline">Open full page ↗</Link>}
      </div>

      {purged ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This draft passed its 60-day retention and its extracted pages were deleted. Questions already saved to the question bank are unaffected. Upload or re-render the book&apos;s PDF to build a new draft.
        </p>
      ) : pages.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">No pages have been rendered for this book yet. Pages appear here as soon as the PDF is rendered.</p>
      ) : (
        <>
          {needsText > 0 && <TextLayerBuilder bookId={bookId} runId={overview.runId} missing={overview.textLayers?.none ?? 0} garbled={overview.textLayers?.garbledNative ?? 0} onDone={loadOverview} />}

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => goTo(Number(pageInput) - 1)} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <input
              type="number" min={1} max={pages.length} value={pageInput} aria-label="Go to page"
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') goTo(Number(pageInput) || 1); }}
              className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm"
            />
            <span className="text-xs text-gray-400">of {pages.length}</span>
            <button type="button" onClick={() => goTo(Number(pageInput) + 1)} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            <button type="button" onClick={() => setZoom((z) => Math.max(50, z - 15))} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button>
            <span className="w-10 text-center text-xs tabular-nums text-gray-500">{zoom}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.min(220, z + 15))} className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button>
            <button
              type="button" onClick={() => setShowText((v) => !v)} aria-pressed={showText}
              className={`ml-1 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${showText ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {showText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showText ? 'Hide extracted text' : 'Show extracted text'}
            </button>
            <span className="text-[11px] text-gray-400">Select text on the page, then copy it or send it to a field.</span>
          </div>

          <div
            ref={scroller}
            onCopy={(e) => { if (picked) { e.clipboardData.setData('text/plain', picked.text); e.preventDefault(); } }}
            className="relative overflow-auto rounded-xl border border-gray-200 bg-gray-100"
            style={{ height }}
          >
            {picked && (
              <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-indigo-200 bg-indigo-50/95 px-3 py-2 backdrop-blur" onMouseDown={(e) => e.preventDefault()}>
                <span className="text-[11px] font-black uppercase tracking-widest text-indigo-600">{picked.lines.length} line{picked.lines.length === 1 ? '' : 's'} selected{new Set(picked.lines.map((l) => l.page)).size > 1 ? ` · pages ${describePageList([...new Set(picked.lines.map((l) => l.page))])}` : ''}</span>
                <button type="button" onClick={() => void copySelection()} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
                </button>
                {onInsert && insertTargets?.map((target) => (
                  <button key={target.id} type="button" onClick={() => onInsert(picked.text, target.id)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100">
                    <TextCursorInput className="h-3.5 w-3.5" /> {target.label}
                  </button>
                ))}
                <p className="w-full truncate font-mono text-[11px] text-indigo-900/70" title={picked.text}>{picked.text.replace(/\s+/g, ' ')}</p>
              </div>
            )}

            <div className="mx-auto flex flex-col items-center gap-4 p-4" style={{ width: `${zoom}%`, minWidth: 'min-content' }}>
              {pages.map((page) => {
                const aspect = page.width && page.height ? page.width / page.height : ASPECT_FALLBACK;
                const isNear = near.has(page.pageNumber);
                const layer = layers[page.pageNumber];
                return (
                  <div key={page.pageNumber} className="w-full">
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      <span>Page {page.pageNumber}</span>
                      <span className="flex items-center gap-3">
                        {layer === null && page.hasImage && <span className="text-amber-600">no selectable text yet</span>}
                        {layer && layer.source === 'NATIVE_PDF' && (layer.garbled ?? 0) >= 0.08 && <span className="text-amber-600">PDF text is garbled — build the OCR text layer</span>}
                        {layer && <button type="button" onClick={() => selectWholePage(page.pageNumber)} className="normal-case tracking-normal text-indigo-600 hover:underline">select page</button>}
                      </span>
                    </div>
                    <div
                      data-page-wrap={page.pageNumber}
                      className="relative w-full overflow-hidden rounded-sm bg-white shadow-md"
                      style={{ aspectRatio: String(aspect), containerType: 'size' }}
                    >
                      {isNear && page.hasImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/admin/books/${bookId}/pages/${page.pageNumber}/image`} alt={`Page ${page.pageNumber}`} draggable={false}
                          className="absolute inset-0 h-full w-full select-none"
                          style={showText ? { opacity: 0.25 } : undefined}
                        />
                      ) : !page.hasImage ? (
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-red-500">Page {page.pageNumber} has no rendered image</div>
                      ) : null}
                      {isNear && layer && (
                        <div className="srcv-layer absolute inset-0 select-text" data-layer={page.pageNumber}>
                          {layer.lines.map((line, index) => (
                            line.words && layer.source === 'NATIVE_PDF'
                              ? line.words.map(([x, w, text], wordIndex) => (
                                <span
                                  key={`${index}:${wordIndex}`} className="srcv-line" data-p={page.pageNumber} data-l={index} data-w={wordIndex}
                                  style={{ left: `${x * 100}%`, top: `${line.y * 100}%`, width: `${w * 100}%`, height: `${line.h * 100}%`, fontSize: `${line.h * 100 * 0.82}cqh`, color: showText ? '#111' : 'transparent', background: picked?.keys.has(lineKey(page.pageNumber, index, wordIndex)) ? SELECT_TINT : showText ? 'rgba(255,255,255,0.85)' : 'transparent' }}
                                >{text}</span>
                              ))
                              : (
                                <span
                                  key={index} className="srcv-line" data-p={page.pageNumber} data-l={index}
                                  style={{ left: `${line.x * 100}%`, top: `${line.y * 100}%`, width: `${line.w * 100}%`, height: `${line.h * 100}%`, fontSize: `${line.h * 100 * 0.82}cqh`, color: showText ? '#111' : 'transparent', userSelect: line.kind === 'text' ? 'text' : 'all', background: picked?.keys.has(lineKey(page.pageNumber, index)) ? SELECT_TINT : showText ? 'rgba(255,255,255,0.85)' : 'transparent' }}
                                >{showText && line.text.includes('$') ? <MathRenderer content={line.text} /> : line.text}</span>
                              )
                          ))}
                        </div>
                      )}
                      {isNear && layer === undefined && page.hasImage && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-300" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ParityChip({ parity, pdfPages, purged }: { parity: Parity | null; pdfPages: number | null; purged: boolean }) {
  if (purged || !parity) return null;
  if (parity.matches) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> {parity.pagesHeld} of {pdfPages} pages — matches the PDF</span>;
  }
  const detail = [
    parity.missingPages.length ? `missing ${describePageList(parity.missingPages)}` : '',
    parity.missingImagePages.length ? `no image for ${describePageList(parity.missingImagePages)}` : '',
    parity.unexpectedPages.length ? `unexpected ${describePageList(parity.unexpectedPages)}` : '',
  ].filter(Boolean).join(' · ');
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700"><AlertTriangle className="h-3.5 w-3.5" /> {parity.pagesHeld} of {pdfPages} pages — does not match the PDF ({detail})</span>;
}

function DraftChip({ bookId, runId, draft, onExtended }: { bookId: string; runId: string; draft: Overview['draft']; onExtended: () => void }) {
  const [busy, setBusy] = useState(false);
  if (draft.purgedAt) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700"><CalendarClock className="h-3.5 w-3.5" /> Draft deleted</span>;
  if (!draft.expiresAt || draft.daysRemaining === null) return null;
  const soon = draft.daysRemaining <= 14;
  const extend = async () => {
    setBusy(true);
    try { await fetch(`/api/admin/book-drafts/${runId}/extend`, { method: 'POST' }); onExtended(); } finally { setBusy(false); }
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${soon ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`} data-book={bookId}>
      <CalendarClock className="h-3.5 w-3.5" /> Draft kept until {new Date(draft.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · {Math.max(0, draft.daysRemaining)} day{draft.daysRemaining === 1 ? '' : 's'} left
      <button type="button" onClick={() => void extend()} disabled={busy} className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider hover:bg-white disabled:opacity-50">{busy ? '…' : 'Keep 60 more days'}</button>
    </span>
  );
}

function TextLayerBuilder({ bookId, runId, missing, garbled, onDone }: { bookId: string; runId: string; missing: number; garbled: number; onDone: () => void }) {
  const [counts, setCounts] = useState<{ freeToBuild: number; needOcr: number } | null>(null);
  const [busy, setBusy] = useState<'free' | 'ocr' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/text-layers`);
      if (response.ok) setCounts(await response.json());
    })();
  }, [bookId, runId, missing, garbled]);

  const run = async (allowOcr: boolean) => {
    setBusy(allowOcr ? 'ocr' : 'free');
    setStatus(null);
    let startPage = 1;
    let native = 0, ocr = 0, skipped = 0;
    const failures: string[] = [];
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/text-layers`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startPage, allowOcr }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not build the text layer');
        native += data.batch.nativeBuilt; ocr += data.batch.ocrBuilt; skipped += data.batch.ocrSkipped;
        failures.push(...data.batch.failures.map((f: { pageNumber: number; error: string }) => `p.${f.pageNumber}: ${f.error}`));
        setStatus(`Working… ${native + ocr} page${native + ocr === 1 ? '' : 's'} done${data.batch.pages.length ? ` (through page ${data.batch.pages[data.batch.pages.length - 1]})` : ''}`);
        if (!data.nextStartPage) break;
        startPage = data.nextStartPage;
      }
      setStatus(`Done: ${native} from the PDF's text${allowOcr ? `, ${ocr} read with OCR` : skipped ? `, ${skipped} still need OCR` : ''}${failures.length ? ` · ${failures.length} failed (${failures.slice(0, 3).join('; ')})` : ''}.`);
      onDone();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not build the text layer');
    } finally {
      setBusy(null);
    }
  };

  const confirmOcr = () => {
    const n = counts?.needOcr ?? 0;
    if (window.confirm(`Read ${n} page${n === 1 ? '' : 's'} with Mathpix OCR?\n\nThis makes about ${n} paid Mathpix request${n === 1 ? '' : 's'} and cannot be undone.`)) void run(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <FileText className="h-4 w-4 shrink-0" />
      <p className="min-w-[14rem] flex-1">
        {missing} page{missing === 1 ? ' has' : 's have'} no selectable text yet{garbled ? ` and ${garbled} ${garbled === 1 ? 'has' : 'have'} unreadable PDF text` : ''}. The page images are complete either way; this only adds the text you select and copy.
      </p>
      {counts && counts.freeToBuild > 0 && (
        <button type="button" disabled={busy !== null} onClick={() => void run(false)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold hover:bg-amber-100 disabled:opacity-50">
          {busy === 'free' ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Build {counts.freeToBuild} from the PDF text (free)
        </button>
      )}
      {counts && counts.needOcr > 0 && (
        <button type="button" disabled={busy !== null} onClick={confirmOcr} className="rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 font-bold hover:bg-amber-200 disabled:opacity-50">
          {busy === 'ocr' ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Read {counts.needOcr} page{counts.needOcr === 1 ? '' : 's'} with OCR (uses Mathpix credits)
        </button>
      )}
      {status && <p className="w-full font-semibold">{status}</p>}
    </div>
  );
}
