'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Maximize2, Minimize2, Minus, PanelRightClose, PanelRightOpen, PenLine, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Whiteboard from './Whiteboard';
import { chapterAt, type ReaderChapter } from '@/lib/book-reader-chapters';

/**
 * A whole book, read like its PDF: every page one below another on the left, a blank whiteboard on the right to write
 * and work on. A chapter list jumps to each chapter, and the book reopens where it was last read on this device. On a
 * phone the book and the board take turns on the screen.
 */

export interface BookReaderProps {
  bookId: string;
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  pages: number[];
  chapters: ReaderChapter[];
  /** Height over width of a page, when known, so the pages hold their place before their images arrive. */
  pageAspect?: number | null;
  /** Page images are served at `${pageImageBase}/${page}`. */
  pageImageBase: string;
  /** Keeps this reader's last page and whiteboard on this device. */
  storageKey: string;
  /** Open at this page instead of where the book was last left. */
  initialPage?: number | null;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function readSavedPage(key: string): number | null {
  try {
    const n = Number.parseInt(window.localStorage.getItem(key) ?? '', 10);
    return Number.isInteger(n) ? n : null;
  } catch { return null; }
}

export default function BookReader(props: BookReaderProps) {
  const { pages, chapters } = props;
  const [zoom, setZoom] = useState(1);
  const [visiblePage, setVisiblePage] = useState<number | null>(props.initialPage ?? pages[0] ?? null);
  const [aspect, setAspect] = useState<number | null>(props.pageAspect ?? null);
  const [boardOpen, setBoardOpen] = useState(true);
  const [phonePanel, setPhonePanel] = useState<'book' | 'board'>('book');
  const [fullscreen, setFullscreen] = useState(false);
  const [goTo, setGoTo] = useState('');
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageKey = `${props.storageKey}:page`;

  const nearest = (page: number) => pages.reduce((best, p) => (Math.abs(p - page) < Math.abs(best - page) ? p : best), pages[0]);
  const scrollToPage = (page: number | null, smooth = false) => {
    if (page == null || !pages.length) return;
    const target = nearest(page);
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${target}"]`);
    el?.scrollIntoView?.({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    setVisiblePage(target);
  };

  // Open at the page asked for, else where this book was left on this device, else its first page.
  useEffect(() => {
    scrollToPage(props.initialPage ?? readSavedPage(pageKey) ?? pages[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // When the page shape becomes known, or the zoom changes, the pages above change height: keep the same page in view.
  const layoutRef = useRef({ aspect, zoom });
  useEffect(() => {
    if (layoutRef.current.aspect === aspect && layoutRef.current.zoom === zoom) return;
    layoutRef.current = { aspect, zoom };
    scrollToPage(visiblePage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, zoom]);
  useEffect(() => {
    if (visiblePage == null) return;
    const t = setTimeout(() => { try { window.localStorage.setItem(pageKey, String(visiblePage)); } catch { /* not remembered: fine */ } }, 500);
    return () => clearTimeout(t);
  }, [visiblePage, pageKey]);

  const onBookScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top + 64;
    for (const el of box.querySelectorAll<HTMLElement>('[data-page]')) {
      if (el.getBoundingClientRect().bottom > top) { setVisiblePage(Number(el.dataset.page)); return; }
    }
  };

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void viewerRef.current?.requestFullscreen?.().catch(() => toast.error('Full screen is not available here.'));
  };

  const chapter = chapterAt(chapters, visiblePage);
  const first = pages[0];
  const last = pages[pages.length - 1];
  const at = visiblePage != null ? pages.indexOf(visiblePage) : -1;
  const submitGoTo = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number.parseInt(goTo, 10);
    if (!Number.isInteger(n)) return;
    scrollToPage(n, false);
    setGoTo('');
  };
  const btn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30';

  return (
    <main className="flex h-full flex-col bg-[#F8FAFC] dark:bg-background">
      {/* Top bar: the book, where you are in it, and the chapter list */}
      <header className="z-30 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-white/10 dark:bg-surface/95">
        <Link href={props.backHref} className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-brand"><ArrowLeft className="h-4 w-4" />{props.backLabel}</Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-black text-slate-900 dark:text-white">{props.title}</h1>
          {props.subtitle && <p className="truncate text-xs text-slate-500">{props.subtitle}</p>}
        </div>
        {chapters.length > 0 && (
          <label className="flex min-w-0 items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="sr-only">Chapter</span>
            <select
              data-testid="reader-chapter"
              value={chapter?.id ?? ''}
              onChange={(e) => { const c = chapters.find((x) => x.id === e.target.value); if (c) scrollToPage(c.startPage); }}
              className="max-w-[16rem] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-bold text-slate-800 dark:border-white/10 dark:bg-surface dark:text-slate-100"
            >
              {!chapter && <option value="">Choose a chapter</option>}
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.chapterNumber ? `${c.chapterNumber}. ` : ''}{c.name}</option>)}
            </select>
          </label>
        )}
        <form onSubmit={submitGoTo} className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
          <label htmlFor="reader-goto">Go to page</label>
          <input id="reader-goto" data-testid="reader-goto" inputMode="numeric" value={goTo} onChange={(e) => setGoTo(e.target.value.replace(/\D/g, ''))} placeholder={String(first ?? '')}
            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-white/10 dark:bg-surface" />
        </form>
      </header>

      {/* Phones: the book and the board take turns */}
      <div role="tablist" aria-label="Reader" className="flex shrink-0 gap-1 border-b border-slate-200 bg-slate-50 p-1.5 md:hidden dark:border-white/10 dark:bg-white/5">
        {([['book', 'Book', BookOpen], ['board', 'Whiteboard', PenLine]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={phonePanel === value} onClick={() => setPhonePanel(value)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black ${phonePanel === value ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div ref={viewerRef} data-testid="book-reader" className={`grid min-h-0 flex-1 bg-slate-100 dark:bg-background ${boardOpen ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
        {/* Left: the book */}
        <section aria-label="Book pages" className={`min-h-0 flex-col bg-slate-600 dark:bg-slate-900 ${phonePanel === 'book' ? 'flex' : 'hidden'} md:flex`}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-slate-800 px-3 py-1.5 text-xs text-slate-200">
            <span data-testid="reader-page" className="min-w-0 truncate font-black tabular-nums text-white">
              Page {visiblePage ?? '–'}<span className="font-bold text-slate-400"> · {at >= 0 ? at + 1 : '–'} of {pages.length}</span>
              {chapter && <span className="font-bold text-slate-300"> · {chapter.name}</span>}
            </span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out" className={btn}><Minus className="h-4 w-4" /></button>
              <span className="w-10 text-center font-black tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" className={btn}><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => setBoardOpen((o) => !o)} aria-label={boardOpen ? 'Hide the whiteboard' : 'Show the whiteboard'} title={boardOpen ? 'Hide the whiteboard' : 'Show the whiteboard'} className={`${btn} hidden md:inline-flex`}>
                {boardOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              </button>
              <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? 'Leave full screen' : 'Full screen'} className={btn}>{fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
            </div>
          </div>
          <div ref={scrollRef} onScroll={onBookScroll} data-testid="reader-pages" className="min-h-0 flex-1 overflow-auto px-3 py-4">
            {pages.length ? (
              <div className="mx-auto space-y-4" style={{ width: `${zoom * 100}%`, maxWidth: boardOpen ? undefined : `${zoom * 900}px` }}>
                {pages.map((page, i) => (
                  <figure key={page} data-page={page} className="scroll-mt-2">
                    <div className="relative bg-white shadow-xl" style={{ aspectRatio: String(aspect ? 1 / aspect : 0.74) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${props.pageImageBase}/${page}`}
                        alt={`Page ${page}`}
                        loading={at >= 0 && Math.abs(i - at) <= 2 ? 'eager' : 'lazy'}
                        decoding="async"
                        onLoad={(e) => { const img = e.currentTarget; if (aspect == null && img.naturalWidth) setAspect(img.naturalHeight / img.naturalWidth); }}
                        className="block h-full w-full select-none"
                        draggable={false}
                      />
                    </div>
                    <figcaption className="mt-1 text-center text-[11px] font-bold tabular-nums text-slate-300">{page}</figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="p-10 text-center text-sm text-slate-300">This book has no pages to show yet.</p>
            )}
          </div>
          {last != null && <span className="sr-only">Pages {first} to {last}</span>}
        </section>

        {/* Right: the whiteboard */}
        {boardOpen && (
          <section aria-label="Whiteboard" className={`min-h-0 flex-col border-slate-200 bg-white dark:border-white/10 dark:bg-surface md:flex md:border-l ${phonePanel === 'board' ? 'flex' : 'hidden'}`}>
            <Whiteboard storageKey={`${props.storageKey}:board`} />
          </section>
        )}
      </div>
    </main>
  );
}
