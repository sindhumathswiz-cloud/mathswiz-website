'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Loader2, Plus, Search, Sparkles } from 'lucide-react';

type CatalogBook = {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  edition: string | null;
  publicationYear: number | null;
  isbn: string | null;
  board: string | null;
  className: string;
  _count: { chapters: number; questions: number; ingestionRuns: number };
  ingestionRuns: Array<{ id: string; status: string; stage: string; progress: number; totalPages: number | null; processedPages: number; extractedQuestions: number; reviewRequired: number; providerConfig: { sourceProfile?: string } | null }>;
};

const emptyForm = { title: '', author: '', publisher: '', edition: '', publicationYear: '', isbn: '', board: '', className: 'Class 11' };

export default function BookCatalogClient() {
  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingBookId, setUploadingBookId] = useState<string | null>(null);
  const [renderingBookId, setRenderingBookId] = useState<string | null>(null);
  const [extractingBookId, setExtractingBookId] = useState<string | null>(null);
  const [benchmarkingKey, setBenchmarkingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/books${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load books');
      setBooks(data.books || []);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load books' });
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void loadBooks(); }, [loadBooks]);

  async function registerBook(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not register book');
      setForm(emptyForm);
      setMessage({ kind: 'success', text: 'Book registered. It is ready for chapter mapping and PDF ingestion.' });
      await loadBooks();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not register book' });
    } finally {
      setSaving(false);
    }
  }

  async function uploadBookPdf(bookId: string, file: File | null) {
    if (!file) return;
    setUploadingBookId(bookId);
    setMessage(null);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/admin/books/${bookId}/ingestions`, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not upload PDF');
      setMessage({ kind: 'success', text: 'The original PDF is stored privately. Building its page inventory…' });
      const inventoryResponse = await fetch(`/api/admin/books/${bookId}/ingestions/${data.ingestionRun.id}/inventory`, { method: 'POST' });
      const inventoryData = await inventoryResponse.json();
      if (!inventoryResponse.ok) throw new Error(inventoryData.error || 'PDF stored, but page inventory failed');
      setMessage({ kind: 'success', text: `PDF ready: ${inventoryData.inventory.totalPages} pages · ${inventoryData.inventory.sourceProfile.replaceAll('_', ' ').toLowerCase()} profile.` });
      await loadBooks();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not upload PDF' });
    } finally {
      setUploadingBookId(null);
    }
  }

  async function renderBookPages(book: CatalogBook) {
    const run = book.ingestionRuns[0];
    if (!run?.totalPages) return;
    setRenderingBookId(book.id);
    setMessage(null);
    let startPage = Math.max(1, run.processedPages + 1);
    try {
      while (startPage <= run.totalPages) {
        setMessage({ kind: 'success', text: `Rendering ${book.title}: pages ${startPage}-${Math.min(run.totalPages, startPage + 19)} of ${run.totalPages}…` });
        const response = await fetch(`/api/admin/books/${book.id}/ingestions/${run.id}/render-pages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startPage, batchSize: 20 }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Page rendering failed');
        if (data.complete || !data.nextStartPage) break;
        startPage = data.nextStartPage;
      }
      setMessage({ kind: 'success', text: `${book.title}: all ${run.totalPages} pages were archived and structurally analysed. Ready to extract questions.` });
      await loadBooks();
    } catch (error) {
      setMessage({ kind: 'error', text: `${error instanceof Error ? error.message : 'Page rendering failed'} Completed batches were preserved; use Resume page rendering to continue.` });
      await loadBooks();
    } finally {
      setRenderingBookId(null);
    }
  }

  async function extractBookQuestions(book: CatalogBook) {
    const run = book.ingestionRuns[0];
    if (!run?.processedPages) return;
    setExtractingBookId(book.id);
    setMessage(null);
    let startPage = 1;
    let totalSaved = 0;
    let totalDuplicates = 0;
    let totalNeedsReview = 0;
    // The server's own retry logic loops back to earlier FAILED pages (up to
    // its own bounded retry budget) rather than this client resetting
    // startPage itself — see extract-questions/route.ts. This just collects
    // every per-page failure message across the whole run so it's visible
    // instead of silently dropped, which is what let the Mathpix
    // include_line_data bug run undetected across an entire book earlier.
    const allFailures: string[] = [];
    let permanentFailures = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const response = await fetch(`/api/admin/books/${book.id}/ingestions/${run.id}/extract-questions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startPage, batchSize: 5 }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Question extraction failed');
        totalSaved += data.batch.saved || 0;
        totalDuplicates += data.batch.duplicates || 0;
        totalNeedsReview += data.batch.needsReview || 0;
        if (Array.isArray(data.batch.failures) && data.batch.failures.length > 0) allFailures.push(...data.batch.failures);
        if (typeof data.permanentFailures === 'number') permanentFailures = data.permanentFailures;
        setMessage({ kind: 'success', text: `Extracting ${book.title}: ${totalSaved} question${totalSaved === 1 ? '' : 's'} saved as drafts so far${data.batch.endPage ? ` (through page ${data.batch.endPage})` : ''}${allFailures.length ? ` · ${allFailures.length} page failure${allFailures.length === 1 ? '' : 's'} so far` : ''}…` });
        if (data.complete || !data.nextStartPage) break;
        startPage = data.nextStartPage;
      }
      const summaryParts = [
        `${book.title}: extraction complete — ${totalSaved} new draft question${totalSaved === 1 ? '' : 's'} saved`,
        `(${totalDuplicates} duplicate${totalDuplicates === 1 ? '' : 's'} skipped, ${totalNeedsReview} flagged for review)`,
      ];
      if (permanentFailures > 0) {
        summaryParts.push(`— ${permanentFailures} page${permanentFailures === 1 ? '' : 's'} still failed after retries: ${allFailures.slice(-5).join('; ')}${allFailures.length > 5 ? '…' : ''}`);
      } else if (allFailures.length > 0) {
        summaryParts.push(`(${allFailures.length} page failure${allFailures.length === 1 ? '' : 's'} recovered on retry)`);
      }
      summaryParts.push('Review new drafts in the Question Bank before approving.');
      setMessage({ kind: permanentFailures > 0 ? 'error' : 'success', text: summaryParts.join(' ') });
      await loadBooks();
    } catch (error) {
      setMessage({ kind: 'error', text: `${error instanceof Error ? error.message : 'Question extraction failed'} Completed pages were preserved; use Extract questions again to resume.` });
      await loadBooks();
    } finally {
      setExtractingBookId(null);
    }
  }

  async function benchmarkBook(book: CatalogBook, provider: 'GEMINI_VISION' | 'MATHPIX_OCR') {
    const run = book.ingestionRuns[0];
    if (!run?.processedPages) return;
    const key = `${book.id}:${provider}`;
    setBenchmarkingKey(key);
    setMessage(null);
    try {
      const summaryResponse = await fetch(`/api/admin/books/${book.id}/ingestions/${run.id}/layout-summary`);
      const summaryData = await summaryResponse.json();
      if (!summaryResponse.ok) throw new Error(summaryData.error || 'Could not load layout summary');
      const pageNumber = summaryData.summary.visionRequiredPages?.[0] || 1;
      const response = await fetch(`/api/admin/books/${book.id}/ingestions/${run.id}/benchmarks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, pageNumber }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Provider benchmark failed');
      const metrics = Object.entries(data.benchmark.metrics || {}).slice(0, 5).map(([name, value]) => `${name.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}: ${String(value)}`).join(' · ');
      setMessage({ kind: 'success', text: `${provider.replaceAll('_', ' ')} benchmark completed on page ${pageNumber} in ${data.benchmark.latencyMs} ms. ${metrics}` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Provider benchmark failed' });
    } finally {
      setBenchmarkingKey(null);
    }
  }

  const anyBusy = renderingBookId !== null || extractingBookId !== null || benchmarkingKey !== null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link href="/admin/question-bank" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600"><ArrowLeft className="h-4 w-4" /> Question Bank</Link>
            <h1 className="text-4xl font-black">Book Ingestion Library</h1>
            <p className="mt-2 text-slate-600">Register each exact edition before uploading its PDF. This preserves question, answer and source-page lineage.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-900">Pilot mode: no new paid subscription required yet.</div>
        </header>

        {message && <div className={`rounded-xl border px-4 py-3 font-semibold ${message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>{message.text}</div>}

        <section className="grid gap-7 lg:grid-cols-[380px_1fr]">
          <form onSubmit={registerBook} className="h-fit space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 text-xl font-black"><Plus className="h-5 w-5 text-indigo-600" /> Register a book</h2>
            <label className="block text-sm font-bold">Title *<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold">Class *<select value={form.className} onChange={e => setForm({ ...form, className: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"><option>Class 11</option><option>Class 12</option></select></label>
              <label className="block text-sm font-bold">Board<input value={form.board} onChange={e => setForm({ ...form, board: e.target.value })} placeholder="CBSE" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            </div>
            {(['author', 'publisher', 'edition', 'isbn'] as const).map(field => <label key={field} className="block text-sm font-bold capitalize">{field}<input value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>)}
            <label className="block text-sm font-bold">Publication year<input type="number" value={form.publicationYear} onChange={e => setForm({ ...form, publicationYear: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5" /></label>
            <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookOpen className="h-5 w-5" />} Register edition</button>
          </form>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 p-5">
              <Search className="h-5 w-5 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search title, author, publisher or ISBN" className="w-full outline-none" />
            </div>
            <div className="divide-y divide-slate-100">
              {loading && <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-indigo-600" /></div>}
              {!loading && books.length === 0 && <div className="p-12 text-center text-slate-500">No books registered yet.</div>}
              {!loading && books.map(book => (
                <article key={book.id} className="p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row">
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-700">{book.className}</span>{book.board && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{book.board}</span>}</div>
                      <h3 className="text-xl font-black">{book.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{[book.author, book.publisher, book.edition, book.publicationYear].filter(Boolean).join(' · ') || 'Edition details not supplied'}</p>
                      {book.isbn && <p className="mt-1 text-xs text-slate-500">ISBN {book.isbn}</p>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{book._count.chapters}</strong>chapters</div>
                      <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{book._count.questions}</strong>questions</div>
                      <div className="rounded-xl bg-slate-50 p-3"><strong className="block text-lg">{book._count.ingestionRuns}</strong>imports</div>
                    </div>
                  </div>
                  {book.ingestionRuns[0] && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Latest import: {book.ingestionRuns[0].stage.replaceAll('_', ' ')} ({book.ingestionRuns[0].progress}%)
                      {book.ingestionRuns[0].totalPages && <span>· {book.ingestionRuns[0].totalPages} pages</span>}
                      {book.ingestionRuns[0].extractedQuestions > 0 && <span>· {book.ingestionRuns[0].extractedQuestions} draft questions</span>}
                      {book.ingestionRuns[0].reviewRequired > 0 && <span className="text-amber-700">· {book.ingestionRuns[0].reviewRequired} need review</span>}
                      {book.ingestionRuns[0].providerConfig?.sourceProfile && <span>· {book.ingestionRuns[0].providerConfig.sourceProfile.replaceAll('_', ' ').toLowerCase()}</span>}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
                    <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white ${uploadingBookId ? 'pointer-events-none opacity-60' : ''}`}>
                      {uploadingBookId === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {uploadingBookId === book.id ? 'Storing PDF…' : 'Upload whole PDF'}
                      <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={event => { void uploadBookPdf(book.id, event.target.files?.[0] || null); event.currentTarget.value = ''; }} />
                    </label>
                    <span className="text-xs text-slate-500">Private storage · PDF only · maximum 250 MB</span>
                  </div>
                  {book.ingestionRuns[0]?.totalPages && book.ingestionRuns[0].processedPages < book.ingestionRuns[0].totalPages && <button onClick={() => void renderBookPages(book)} disabled={anyBusy} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-black text-indigo-700 disabled:opacity-60">{renderingBookId === book.id && <Loader2 className="h-4 w-4 animate-spin" />}{book.ingestionRuns[0].processedPages ? 'Resume page rendering' : 'Render and analyse pages'} · {book.ingestionRuns[0].processedPages}/{book.ingestionRuns[0].totalPages}</button>}
                  {book.ingestionRuns[0]?.processedPages > 0 && (
                    <button onClick={() => void extractBookQuestions(book)} disabled={anyBusy} className="mt-3 ml-0 inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-60 sm:ml-3">
                      {extractingBookId === book.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Extract questions
                    </button>
                  )}
                  {book.ingestionRuns[0]?.processedPages > 0 && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void benchmarkBook(book, 'GEMINI_VISION')} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-700 disabled:opacity-60">{benchmarkingKey === `${book.id}:GEMINI_VISION` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Benchmark Gemini</button><button onClick={() => void benchmarkBook(book, 'MATHPIX_OCR')} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-60">{benchmarkingKey === `${book.id}:MATHPIX_OCR` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Benchmark Mathpix</button><span className="self-center text-xs text-slate-500">One selected page only; credits are never spent automatically.</span></div>}
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
