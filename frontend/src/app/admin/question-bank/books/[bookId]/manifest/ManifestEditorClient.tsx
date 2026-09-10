'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Eye, Loader2, Play, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';

const SECTION_TYPES = [
  '', 'THEORY', 'SOLVED_EXAMPLES', 'NCERT_SELECTED', 'MCQ', 'ASSERTION_REASON', 'CASE_STUDY',
  'SELF_ASSESSMENT', 'VERY_SHORT_ANSWER', 'SHORT_ANSWER', 'LONG_ANSWER', 'FILL_IN_BLANKS',
  'TRUE_FALSE', 'OBJECTIVE', 'EXERCISE',
] as const;

type SectionRow = {
  sectionType: string;
  title: string;
  startPage: string;
  endPage: string;
  inlineAnswers: boolean;
  noAnswers: boolean;
  hasAnswerKey: boolean;
  answerKeyStartPage: string;
  answerKeyEndPage: string;
  answerKeyCoverage: string;
  hasSolutions: boolean;
  solutionsStartPage: string;
  solutionsEndPage: string;
  solutionCoverage: string;
};

type ChapterRow = {
  id?: string;
  chapterNumber: string;
  name: string;
  topic: string;
  startPage: string;
  endPage: string;
  printedStartPage: string;
  printedEndPage: string;
  confirmed: boolean;
  questionsInRange: number;
  sections: SectionRow[];
};

const s = (v: unknown): string => (v == null || v === '' ? '' : String(v));
const toInt = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) ? n : null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function toSectionRow(x: any): SectionRow {
  return {
    sectionType: s(x.sectionType),
    title: s(x.title),
    startPage: s(x.startPage),
    endPage: s(x.endPage),
    inlineAnswers: x.inlineAnswers === true,
    noAnswers: x.noAnswers === true,
    hasAnswerKey: x.answerKeyStartPage != null,
    answerKeyStartPage: s(x.answerKeyStartPage),
    answerKeyEndPage: s(x.answerKeyEndPage),
    answerKeyCoverage: s(x.answerKeyCoverage) || 'ALL',
    hasSolutions: x.solutionsStartPage != null,
    solutionsStartPage: s(x.solutionsStartPage),
    solutionsEndPage: s(x.solutionsEndPage),
    solutionCoverage: s(x.solutionCoverage) || 'ALL',
  };
}
function toChapterRow(x: any): ChapterRow {
  return {
    id: x.id,
    chapterNumber: s(x.chapterNumber),
    name: s(x.name),
    topic: s(x.topic),
    startPage: s(x.startPage),
    endPage: s(x.endPage),
    printedStartPage: s(x.printedStartPage),
    printedEndPage: s(x.printedEndPage),
    confirmed: x.confirmed === true,
    questionsInRange: typeof x.questionsInRange === 'number' ? x.questionsInRange : 0,
    sections: (x.sections ?? []).map(toSectionRow),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const blankSection = (): SectionRow => ({
  sectionType: '', title: '', startPage: '', endPage: '',
  inlineAnswers: false, noAnswers: false,
  hasAnswerKey: false, answerKeyStartPage: '', answerKeyEndPage: '', answerKeyCoverage: 'ALL',
  hasSolutions: false, solutionsStartPage: '', solutionsEndPage: '', solutionCoverage: 'ALL',
});
const blankChapter = (): ChapterRow => ({
  chapterNumber: '', name: '', topic: '', startPage: '', endPage: '',
  printedStartPage: '', printedEndPage: '', confirmed: false, questionsInRange: 0, sections: [],
});

export default function ManifestEditorClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [pageOffset, setPageOffset] = useState('0');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ range: string; pages: Array<{ pageNumber: number; rawText: string | null }> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [extractProgress, setExtractProgress] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load the manifest');
      setBook(data.book);
      setRunId(data.run?.id ?? null);
      setTotalPages(data.run?.totalPages ?? null);
      setChapters((data.chapters ?? []).map(toChapterRow));
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [bookId]);
  useEffect(() => { void load(); }, [load]);

  // Merge fresh per-chapter question counts without disturbing unsaved edits.
  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`);
      const data = await res.json();
      if (!res.ok) return;
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const byId = new Map((data.chapters ?? []).map((c: any) => [c.id, c.questionsInRange ?? 0]));
      setChapters((prev) => prev.map((c) => (c.id && byId.has(c.id) ? { ...c, questionsInRange: byId.get(c.id) as number } : c)));
    } catch { /* best effort */ }
  }, [bookId]);

  const buildPayload = (rows: ChapterRow[]) => ({
    chapters: rows.map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber || null,
      name: c.name,
      topic: c.topic || null,
      startPage: toInt(c.startPage),
      endPage: toInt(c.endPage),
      printedStartPage: toInt(c.printedStartPage),
      printedEndPage: toInt(c.printedEndPage),
      confirmed: c.confirmed,
      sections: c.sections.map((sec) => ({
        sectionType: sec.sectionType || null,
        title: sec.title || null,
        startPage: toInt(sec.startPage),
        endPage: toInt(sec.endPage),
        inlineAnswers: sec.noAnswers ? false : sec.inlineAnswers,
        noAnswers: sec.noAnswers,
        answerKeyStartPage: !sec.noAnswers && sec.hasAnswerKey ? toInt(sec.answerKeyStartPage) : null,
        answerKeyEndPage: !sec.noAnswers && sec.hasAnswerKey ? toInt(sec.answerKeyEndPage) : null,
        answerKeyCoverage: sec.answerKeyCoverage,
        solutionsStartPage: !sec.noAnswers && sec.hasSolutions ? toInt(sec.solutionsStartPage) : null,
        solutionsEndPage: !sec.noAnswers && sec.hasSolutions ? toInt(sec.solutionsEndPage) : null,
        solutionCoverage: sec.solutionCoverage,
      })),
    })),
  });

  const save = async (rows: ChapterRow[], successText: string) => {
    setBusy('save');
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(rows)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setMessage({ kind: 'success', text: successText });
      await load();
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save' });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const autoDetect = async () => {
    setBusy('detect');
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest/detect`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-detect failed');
      setRunId(data.runId ?? runId);
      setTotalPages(data.totalPages ?? totalPages);
      setPageOffset(String(data.pageOffset ?? 0));
      setChapters((data.proposal?.chapters ?? []).map((c: unknown) => ({ ...toChapterRow(c), confirmed: false })));
      setMessage({
        kind: 'info',
        text: data.tocFound
          ? `Proposed ${data.proposal.chapters.length} chapters from the table of contents (book→PDF offset +${data.pageOffset}). Check the offset and every range, then confirm chapters one at a time. Nothing is saved yet.`
          : `No table of contents found — proposed ${data.proposal.chapters.length} chapters from running headers. Review carefully. Nothing is saved yet.`,
      });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Auto-detect failed' });
    } finally {
      setBusy(null);
    }
  };

  const reapplyOffset = () => {
    const off = toInt(pageOffset) ?? 0;
    setChapters((prev) => prev.map((c) => {
      const ps = toInt(c.printedStartPage);
      const pe = toInt(c.printedEndPage);
      return {
        ...c,
        startPage: ps != null ? String(ps + off) : c.startPage,
        endPage: pe != null ? String(pe + off) : c.endPage,
      };
    }));
    setMessage({ kind: 'info', text: `Re-applied offset +${off} to every chapter that has printed page numbers. Save to persist.` });
  };

  const refile = async () => {
    if (!confirm('Re-file every DRAFT question of this book under the confirmed chapter that contains its source page?')) return;
    setBusy('refile');
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest/refile`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Re-file failed');
      setMessage({ kind: 'success', text: `Re-filed ${data.total} questions: ${data.results.map((r: { chapter: string; refiled: number }) => `${r.chapter} ${r.refiled}`).join(', ')}` });
      await refreshCounts();
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Re-file failed' });
    } finally {
      setBusy(null);
    }
  };

  const extractChapter = async (index: number, force = false) => {
    const chapter = chapters[index];
    const start = toInt(chapter.startPage);
    const end = toInt(chapter.endPage);
    if (!runId || start == null || end == null) return;
    if (force && !confirm(`Re-run OCR + extraction on every page of "${chapter.name}" (${start}–${end})? Already-extracted pages are reprocessed; duplicate questions are skipped.`)) return;
    setBusy(`extract-${index}`);
    setMessage(null);
    let cursor = start;
    let saved = 0;
    let failures = 0;
    let alreadyExtracted = 0;
    const emptySectionPages = new Set<number>();
    try {
      for (;;) {
        setExtractProgress((p) => ({ ...p, [index]: `pages ${cursor}–${end}… ${saved} saved` }));
        const res = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/extract-questions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startPage: cursor, endPage: end, batchSize: 5, force }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Extraction failed');
        saved += data.batch?.saved ?? 0;
        failures += data.batch?.failures?.length ?? 0;
        for (const p of data.batch?.emptySectionPages ?? []) emptySectionPages.add(p);
        alreadyExtracted = data.alreadyExtracted ?? alreadyExtracted;
        if (data.complete || data.nextStartPage == null) break;
        cursor = data.nextStartPage;
        if (cursor > end) break;
      }
      if (saved === 0 && failures === 0 && !force && alreadyExtracted > 0) {
        setExtractProgress((p) => ({ ...p, [index]: `${alreadyExtracted} pages already extracted · ${chapter.questionsInRange} questions` }));
        setMessage({ kind: 'info', text: `${chapter.name}: all ${alreadyExtracted} pages were already extracted earlier (${chapter.questionsInRange} questions in this range). Use "Re-extract" to reprocess them under the manifest, or "Re-file existing questions" to move them into this chapter.` });
      } else {
        const emptyList = [...emptySectionPages].sort((a, b) => a - b);
        setExtractProgress((p) => ({ ...p, [index]: `done — ${saved} saved${failures ? `, ${failures} page failures` : ''}` }));
        setMessage({
          kind: emptyList.length ? 'info' : 'success',
          text: `${chapter.name}: extracted ${saved} question${saved === 1 ? '' : 's'}${failures ? ` (${failures} page failures)` : ''}.`
            + (emptyList.length ? ` ${emptyList.length} page${emptyList.length === 1 ? '' : 's'} inside a question section produced no questions — check ${emptyList.slice(0, 12).join(', ')}${emptyList.length > 12 ? '…' : ''} (OCR gap, or the section range needs trimming).` : ''),
        });
      }
    } catch (e) {
      setExtractProgress((p) => ({ ...p, [index]: `stopped — ${saved} saved` }));
      setMessage({ kind: 'error', text: `${chapter.name}: ${e instanceof Error ? e.message : 'extraction failed'}. Completed pages were kept.` });
    } finally {
      setBusy(null);
      await refreshCounts();
    }
  };

  const viewPages = async (start: string, end: string) => {
    const a = toInt(start);
    const b = toInt(end) ?? a;
    if (!runId || a == null || b == null) return;
    setPreviewLoading(true);
    setPreview({ range: `${a}–${b}`, pages: [] });
    try {
      const res = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/pages?start=${a}&end=${b}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load pages');
      setPreview({ range: `${a}–${b}`, pages: data.pages ?? [] });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load pages' });
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const patchChapter = (i: number, patch: Partial<ChapterRow>) =>
    setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const patchSection = (ci: number, si: number, patch: Partial<SectionRow>) =>
    setChapters((prev) => prev.map((c, idx) => (idx === ci ? { ...c, sections: c.sections.map((sec, j) => (j === si ? { ...sec, ...patch } : sec)) } : c)));
  const addChapter = () => setChapters((p) => [...p, blankChapter()]);
  const removeChapter = (i: number) => setChapters((p) => p.filter((_, idx) => idx !== i));
  const addSection = (ci: number) => setChapters((p) => p.map((c, idx) => (idx === ci ? { ...c, sections: [...c.sections, blankSection()] } : c)));
  const removeSection = (ci: number, si: number) => setChapters((p) => p.map((c, idx) => (idx === ci ? { ...c, sections: c.sections.filter((_, j) => j !== si) } : c)));

  const toggleChapterConfirm = async (i: number) => {
    const next = chapters.map((c, idx) => (idx === i ? { ...c, confirmed: !c.confirmed } : c));
    setChapters(next);
    await save(next, next[i].confirmed ? `Confirmed "${next[i].name}".` : `Unconfirmed "${next[i].name}".`);
  };

  const confirmedCount = useMemo(() => chapters.filter((c) => c.confirmed).length, [chapters]);
  const anyBusy = busy != null || loading;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-black text-slate-900">Chapter manifest</h1>
        <p className="mt-1 text-sm text-slate-500">
          {book ? <>{book.title} · {book.className}</> : 'Loading…'}{totalPages ? <> · {totalPages} pages</> : null}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-400">
          {chapters.length === 0 ? 'No chapters yet — run Auto-detect.' : `${confirmedCount} of ${chapters.length} chapters confirmed`}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => void autoDetect()} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {busy === 'detect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-detect
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
          Book page → PDF offset
          <input inputMode="numeric" value={pageOffset} onChange={(e) => setPageOffset(e.target.value)} className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          <button onClick={reapplyOffset} disabled={anyBusy} className="inline-flex items-center gap-1 text-xs font-black text-indigo-600 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" /> Re-apply</button>
        </label>
        <button onClick={addChapter} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <Plus className="h-4 w-4" /> Add chapter
        </button>
        <button onClick={() => void save(chapters, 'Draft saved.')} disabled={anyBusy || chapters.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft
        </button>
        <button onClick={() => void save(chapters.map((c) => ({ ...c, confirmed: true })), 'All chapters confirmed.')} disabled={anyBusy || chapters.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-60">
          <CheckCircle2 className="h-4 w-4" /> Confirm all
        </button>
        <button onClick={() => void refile()} disabled={anyBusy || confirmedCount === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {busy === 'refile' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Re-file existing questions
        </button>
      </div>

      {message && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800'
        }`}>{message.text}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          {chapters.map((chapter, ci) => (
            <section key={ci} className={`rounded-2xl border bg-white p-5 ${chapter.confirmed ? 'border-emerald-300' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Ch #" width="w-14"><input value={chapter.chapterNumber} onChange={(e) => patchChapter(ci, { chapterNumber: e.target.value })} className={inputCls} /></Field>
                <Field label="Chapter name" width="flex-1 min-w-48"><input value={chapter.name} onChange={(e) => patchChapter(ci, { name: e.target.value })} className={inputCls} /></Field>
                <Field label="Topic" width="w-44"><input value={chapter.topic} onChange={(e) => patchChapter(ci, { topic: e.target.value })} placeholder="= name" className={inputCls} /></Field>
                <Field label="Printed pp." width="w-24">
                  <div className="flex items-center gap-1">
                    <input inputMode="numeric" value={chapter.printedStartPage} onChange={(e) => patchChapter(ci, { printedStartPage: e.target.value })} className="w-11 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm" />
                    <span className="text-slate-400">–</span>
                    <input inputMode="numeric" value={chapter.printedEndPage} onChange={(e) => patchChapter(ci, { printedEndPage: e.target.value })} className="w-11 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm" />
                  </div>
                </Field>
                <PageRange label="PDF pages" startValue={chapter.startPage} endValue={chapter.endPage}
                  onStart={(v) => patchChapter(ci, { startPage: v })} onEnd={(v) => patchChapter(ci, { endPage: v })}
                  onView={() => void viewPages(chapter.startPage, chapter.endPage)} />
                <button onClick={() => removeChapter(ci)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" aria-label="Remove chapter"><Trash2 className="h-4 w-4" /></button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => void toggleChapterConfirm(ci)} disabled={anyBusy}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black disabled:opacity-50 ${chapter.confirmed ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {chapter.confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {chapter.confirmed ? 'Confirmed' : 'Confirm chapter'}
                </button>
                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600" title="Questions currently in this chapter's PDF page range">
                  {chapter.questionsInRange} question{chapter.questionsInRange === 1 ? '' : 's'} in range
                </span>
                {chapter.confirmed && (
                  <>
                    <button onClick={() => void extractChapter(ci)} disabled={anyBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 disabled:opacity-50">
                      {busy === `extract-${ci}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Extract this chapter
                    </button>
                    <button onClick={() => void extractChapter(ci, true)} disabled={anyBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      Re-extract (force)
                    </button>
                  </>
                )}
                {extractProgress[ci] && <span className="text-xs font-bold text-slate-500">{extractProgress[ci]}</span>}
              </div>

              <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
                {chapter.sections.map((section, si) => (
                  <div key={si} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label="Section type" width="w-44">
                        <select value={section.sectionType} onChange={(e) => patchSection(ci, si, { sectionType: e.target.value })} className={inputCls}>
                          {SECTION_TYPES.map((t) => <option key={t} value={t}>{t || '— none —'}</option>)}
                        </select>
                      </Field>
                      <Field label="Heading / title" width="flex-1 min-w-40"><input value={section.title} onChange={(e) => patchSection(ci, si, { title: e.target.value })} className={inputCls} /></Field>
                      <PageRange label="Question pages" startValue={section.startPage} endValue={section.endPage}
                        onStart={(v) => patchSection(ci, si, { startPage: v })} onEnd={(v) => patchSection(ci, si, { endPage: v })}
                        onView={() => void viewPages(section.startPage, section.endPage)} />
                      <button onClick={() => removeSection(ci, si)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" aria-label="Remove section"><Trash2 className="h-4 w-4" /></button>
                    </div>

                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <input type="checkbox" checked={section.noAnswers} onChange={(e) => patchSection(ci, si, { noAnswers: e.target.checked })} />
                        Practice exercise — no answers anywhere
                      </label>
                      <div className={section.noAnswers ? 'pointer-events-none opacity-40' : ''}>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.inlineAnswers} onChange={(e) => patchSection(ci, si, { inlineAnswers: e.target.checked })} />
                          Answers / solutions printed inline with the questions
                        </label>

                        <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.hasAnswerKey}
                            onChange={(e) => patchSection(ci, si, { hasAnswerKey: e.target.checked, ...(e.target.checked ? {} : { answerKeyStartPage: '', answerKeyEndPage: '' }) })} />
                          Separate answer key
                          {section.hasAnswerKey && (
                            <>
                              <RangeMini startV={section.answerKeyStartPage} endV={section.answerKeyEndPage}
                                onStart={(v) => patchSection(ci, si, { answerKeyStartPage: v })} onEnd={(v) => patchSection(ci, si, { answerKeyEndPage: v })}
                                onView={() => void viewPages(section.answerKeyStartPage, section.answerKeyEndPage)} />
                              <select value={section.answerKeyCoverage} onChange={(e) => patchSection(ci, si, { answerKeyCoverage: e.target.value })} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs">
                                <option value="ALL">covers all</option>
                                <option value="SELECTED">selected only</option>
                              </select>
                            </>
                          )}
                        </label>

                        <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.hasSolutions}
                            onChange={(e) => patchSection(ci, si, { hasSolutions: e.target.checked, ...(e.target.checked ? {} : { solutionsStartPage: '', solutionsEndPage: '' }) })} />
                          Separate detailed solutions
                          {section.hasSolutions && (
                            <>
                              <RangeMini startV={section.solutionsStartPage} endV={section.solutionsEndPage}
                                onStart={(v) => patchSection(ci, si, { solutionsStartPage: v })} onEnd={(v) => patchSection(ci, si, { solutionsEndPage: v })}
                                onView={() => void viewPages(section.solutionsStartPage, section.solutionsEndPage)} />
                              <select value={section.solutionCoverage} onChange={(e) => patchSection(ci, si, { solutionCoverage: e.target.value })} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs">
                                <option value="ALL">all solutions</option>
                                <option value="SELECTED">selected only</option>
                                <option value="HINTS">hints only</option>
                              </select>
                            </>
                          )}
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => addSection(ci)} className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600"><Plus className="h-3.5 w-3.5" /> Add section</button>
              </div>
            </section>
          ))}
        </div>
      )}

      {preview && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">OCR text · pages {preview.range}</h2>
            <button onClick={() => setPreview(null)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="space-y-4">
              {preview.pages.map((p) => (
                <div key={p.pageNumber}>
                  <div className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Page {p.pageNumber}</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{p.rawText || '(no text captured)'}</pre>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
    </main>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm';

function Field({ label, width, children }: { label: string; width: string; children: React.ReactNode }) {
  return (
    <label className={`${width} block`}>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function PageRange({ startValue, endValue, onStart, onEnd, onView, label }: {
  startValue: string; endValue: string; onStart: (v: string) => void; onEnd: (v: string) => void; onView: () => void; label: string;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <RangeMini startV={startValue} endV={endValue} onStart={onStart} onEnd={onEnd} onView={onView} />
    </div>
  );
}

function RangeMini({ startV, endV, onStart, onEnd, onView }: {
  startV: string; endV: string; onStart: (v: string) => void; onEnd: (v: string) => void; onView: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input inputMode="numeric" value={startV} onChange={(e) => onStart(e.target.value)} placeholder="from" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label="page from" />
      <span className="text-slate-400">–</span>
      <input inputMode="numeric" value={endV} onChange={(e) => onEnd(e.target.value)} placeholder="to" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label="page to" />
      <button type="button" onClick={onView} disabled={!startV} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-40" aria-label="View pages"><Eye className="h-3.5 w-3.5" /></button>
    </span>
  );
}
