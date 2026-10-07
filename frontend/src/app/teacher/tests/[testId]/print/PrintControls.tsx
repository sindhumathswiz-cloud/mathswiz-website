'use client';

import Link from 'next/link';
import { Printer } from 'lucide-react';

/** Screen-only bar above the paper: print it, or switch between the student copy and the answer key. */
export default function PrintControls({ testId, withKey }: { testId: string; withKey: boolean }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700">
        <Printer className="h-4 w-4" /> Print
      </button>
      {withKey ? (
        <Link href={`/teacher/tests/${testId}/print`} className="text-sm font-bold text-indigo-700 underline dark:text-brand">Show the student copy (no answers)</Link>
      ) : (
        <Link href={`/teacher/tests/${testId}/print?key=1`} className="text-sm font-bold text-indigo-700 underline dark:text-brand">Add the answer key (teacher copy)</Link>
      )}
      <Link href="/teacher/tests" className="ml-auto text-sm font-bold text-slate-600 underline dark:text-slate-300">Back to tests</Link>
      <p className="w-full text-xs font-semibold text-slate-500 dark:text-slate-400">In the print dialog choose A4 and turn off headers and footers. The student copy never includes answers.</p>
    </div>
  );
}
