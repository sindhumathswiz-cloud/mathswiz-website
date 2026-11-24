'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { Menu, X } from 'lucide-react';

/**
 * A side menu that stays open beside the page from tablet width up, and on a phone folds into a menu button on a slim
 * top bar, opening over the page and closing once a link in it is followed. The page then gets the phone's full width.
 */
export default function ResponsiveSidebar({ children, title = "Sindhu's Mathswiz Classes" }: { children: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  // Following a link closes the menu; the page underneath changes on its own.
  const closeOnLink = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) setOpen(false);
  };

  return (
    <>
      <div className="hidden shrink-0 md:block">{children}</div>

      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 md:hidden dark:border-white/10 dark:bg-surface">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open the menu" aria-expanded={open} data-testid="open-menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">
          <Menu className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg object-contain" />
        <span className="truncate font-display text-sm font-black text-slate-900 dark:text-white">{title}</span>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] flex md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close the menu" onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/50" />
          <div className="relative h-full max-w-[85vw] overflow-y-auto shadow-2xl" onClickCapture={closeOnLink}>{children}</div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close the menu" className="relative ml-2 mt-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow dark:bg-surface dark:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}
