'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import SourcePageViewer from '../../../SourcePageViewer';

export default function SourceBookClient({ bookId, initialPage }: { bookId: string; initialPage: number | null }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Link href="/admin/question-bank/books" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Book Library
      </Link>
      <div>
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Source book</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Every page exactly as printed in the PDF. Select text on a page or across pages to copy it, so a question, option, answer or solution can be corrected straight from the source.
        </p>
      </div>
      <SourcePageViewer bookId={bookId} initialPage={initialPage} showHeaderLink={false} height="80vh" />
    </div>
  );
}
