'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Eraser, FilePlus2, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react';

/**
 * A blank board to work on beside the book: write with a pen, finger or mouse, rub out, undo and redo, keep several
 * sheets, and save a sheet as a picture. Kept on this device under `storageKey` (one board per exercise), so a reload
 * keeps the working. Strokes are stored as points, so the board redraws sharply at any size.
 */

type Tool = 'pen' | 'eraser';
export interface Stroke { tool: Tool; color: string; size: number; points: number[] }
type Saved = { sheets: Stroke[][]; at: number };

export const BOARD_COLORS: Array<[name: string, value: string]> = [['Black', '#0f172a'], ['Blue', '#2563eb'], ['Red', '#dc2626'], ['Green', '#059669']];
const PEN_SIZES = [2, 4, 8];
const ERASER_SIZE = 28;
const MAX_SHEETS = 20;

function readSaved(key: string): Saved | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (!parsed || !Array.isArray(parsed.sheets) || !parsed.sheets.length) return null;
    const at = Number.isInteger(parsed.at) && parsed.at >= 0 && parsed.at < parsed.sheets.length ? parsed.at : 0;
    return { sheets: parsed.sheets, at };
  } catch { return null; }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const p = stroke.points;
  if (p.length < 2) return;
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 2) {
    // A tap leaves a dot.
    ctx.beginPath();
    ctx.arc(p[0], p[1], stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

export default function Whiteboard({ storageKey }: { storageKey: string }) {
  const [sheets, setSheets] = useState<Stroke[][]>([[]]);
  const [at, setAt] = useState(0);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [cleared, setCleared] = useState<Stroke[] | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(BOARD_COLORS[0][1]);
  const [size, setSize] = useState(PEN_SIZES[1]);
  const [ready, setReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);

  const sheet = useMemo(() => sheets[at] ?? [], [sheets, at]);

  // What was on the board last time, once on this device (the server never has it).
  useEffect(() => {
    try {
      const saved = readSaved(storageKey);
      if (saved) { setSheets(saved.sheets); setAt(saved.at); }
    } finally {
      setReady(true);
    }
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      try { window.localStorage.setItem(storageKey, JSON.stringify({ sheets, at })); } catch { /* too large, or storage off: the board still works */ }
    }, 400);
    return () => clearTimeout(t);
  }, [sheets, at, ready, storageKey]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of sheet) drawStroke(ctx, stroke);
  }, [sheet]);

  // The canvas follows its box, at the screen's pixel density.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      redraw();
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [redraw]);
  useEffect(() => { redraw(); }, [redraw]);

  const pointAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return [Math.round((e.clientX - box.left) * 10) / 10, Math.round((e.clientY - box.top) * 10) / 10];
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* a pointer the browser no longer tracks: draw anyway */ }
    drawing.current = { tool, color, size: tool === 'eraser' ? ERASER_SIZE : size, points: pointAt(e) };
    const ctx = e.currentTarget.getContext?.('2d');
    if (ctx) drawStroke(ctx, drawing.current);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = drawing.current;
    if (!stroke) return;
    const [x, y] = pointAt(e);
    const n = stroke.points.length;
    if (stroke.points[n - 2] === x && stroke.points[n - 1] === y) return;
    stroke.points.push(x, y);
    const ctx = e.currentTarget.getContext?.('2d');
    if (ctx) drawStroke(ctx, { ...stroke, points: stroke.points.slice(-4) });
  };
  const up = () => {
    const stroke = drawing.current;
    drawing.current = null;
    if (!stroke) return;
    setSheets((all) => all.map((s, i) => (i === at ? [...s, stroke] : s)));
    setRedo([]);
    setCleared(null);
  };

  const undo = () => {
    if (!sheet.length && cleared) { setSheets((all) => all.map((s, i) => (i === at ? cleared : s))); setCleared(null); return; }
    const last = sheet[sheet.length - 1];
    if (!last) return;
    setSheets((all) => all.map((s, i) => (i === at ? s.slice(0, -1) : s)));
    setRedo((r) => [...r, last]);
  };
  const redoStroke = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setSheets((all) => all.map((s, i) => (i === at ? [...s, next] : s)));
    setRedo((r) => r.slice(0, -1));
  };
  const clear = () => {
    if (!sheet.length) return;
    setCleared(sheet);
    setRedo([]);
    setSheets((all) => all.map((s, i) => (i === at ? [] : s)));
  };
  const goSheet = (to: number) => { setAt(Math.max(0, Math.min(sheets.length - 1, to))); setRedo([]); setCleared(null); };
  const addSheet = () => {
    if (sheets.length >= MAX_SHEETS) return;
    setSheets((all) => [...all, []]);
    setAt(sheets.length);
    setRedo([]);
    setCleared(null);
  };
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.href = out.toDataURL('image/png');
    link.download = `whiteboard-sheet-${at + 1}.png`;
    link.click();
  };

  const toolBtn = (on: boolean) => `inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-black ${on ? 'bg-slate-900 text-white dark:bg-white/20' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10'}`;
  const iconBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10';

  return (
    <div data-testid="whiteboard" data-strokes={sheet.length} className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label="Whiteboard tools" className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-surface">
        <button type="button" aria-label="Pen" title="Pen" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} className={toolBtn(tool === 'pen')}><PenLine className="h-4 w-4" /><span className="hidden 2xl:inline">Pen</span></button>
        <button type="button" aria-label="Eraser" title="Eraser" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')} className={toolBtn(tool === 'eraser')}><Eraser className="h-4 w-4" /><span className="hidden 2xl:inline">Eraser</span></button>
        <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />
        {BOARD_COLORS.map(([name, value]) => (
          <button key={value} type="button" aria-label={name} aria-pressed={tool === 'pen' && color === value} onClick={() => { setColor(value); setTool('pen'); }}
            className={`h-7 w-7 rounded-full border-2 ${tool === 'pen' && color === value ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-brand/40' : 'border-white dark:border-surface'}`} style={{ backgroundColor: value }} />
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />
        {PEN_SIZES.map((s) => (
          <button key={s} type="button" aria-label={`Pen size ${s}`} aria-pressed={size === s} onClick={() => { setSize(s); setTool('pen'); }} className={toolBtn(tool === 'pen' && size === s)}>
            <span className="rounded-full bg-current" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/10" />
        <button type="button" onClick={undo} disabled={!sheet.length && !cleared} aria-label="Undo" className={iconBtn}><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={redoStroke} disabled={!redo.length} aria-label="Redo" className={iconBtn}><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={clear} disabled={!sheet.length} aria-label="Clear this sheet" className={iconBtn}><Trash2 className="h-4 w-4" /></button>
        <button type="button" onClick={download} aria-label="Save this sheet as a picture" className={iconBtn}><Download className="h-4 w-4" /></button>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-white">
        <canvas
          ref={canvasRef}
          data-testid="whiteboard-canvas"
          aria-label={`Whiteboard, sheet ${at + 1}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={(e) => { if (e.buttons === 0) up(); }}
          className={`absolute inset-0 touch-none ${tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`}
        />
        {!sheet.length && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-slate-300">Write or work here</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-white/10 dark:bg-surface dark:text-slate-300">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => goSheet(at - 1)} disabled={at === 0} aria-label="Previous sheet" className={iconBtn}><ChevronLeft className="h-4 w-4" /></button>
          <span data-testid="whiteboard-sheet" className="tabular-nums">Sheet {at + 1} of {sheets.length}</span>
          <button type="button" onClick={() => goSheet(at + 1)} disabled={at >= sheets.length - 1} aria-label="Next sheet" className={iconBtn}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={addSheet} disabled={sheets.length >= MAX_SHEETS} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-white/10"><FilePlus2 className="h-4 w-4" /> New sheet</button>
      </div>
    </div>
  );
}
