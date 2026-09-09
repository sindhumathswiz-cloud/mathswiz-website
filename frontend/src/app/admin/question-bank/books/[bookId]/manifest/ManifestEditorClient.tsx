'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';

const SECTION_TYPES = [
  '', 'MCQ', 'ASSERTION_REASON', 'CASE_STUDY', 'VERY_SHORT_ANSWER', 'SHORT_ANSWER',
  'LONG_ANSWER', 'FILL_IN_BLANKS', 'TRUE_FALSE', 'OBJECTIVE', 'EXERCISE', 'SOLVED_EXAMPLES',
] as const;

type SectionRow = {
  id?: string;
  sectionType: string;
  title: string;
  startPage: string;
  endPage: string;
  inlineAnswers: boolean;
  noAnswers: boolean;
  answerKeyStartPage: string;
  answerKeyEndPage: string;
  solutionsStartPage: string;
  solutionsEndPage: string;
};

type ChapterRow = {
  id?: string;
  chapterNumber: string;
  name: string;
  topic: string;
  startPage: string;
  endPage: string;
  confirmed: boolean;
  sections: SectionRow[];
};

type ApiSection = Partial<Record<keyof SectionRow, unknown>> & { id?: string };
type ApiChapter = {
  id?: string;
  chapterNumber?: string | null;
  name?: string;
  topic?: string | null;
  startPage?: number | null;
  endPage?: number | null;
  confirmed?: boolean;
  sections?: ApiSection[];
};

const n = (value: unknown): string => (value == null || value === '' ? '' : String(value));
const toInt = (value: string): number | null => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

function toSectionRow(section: ApiSection): SectionRow {
  return {
    id: section.id,
    sectionType: n(section.sectionType),
    title: n(section.title),
    startPage: n(section.startPage),
    endPage: n(section.endPage),
    inlineAnswers: section.inlineAnswers === true,
    noAnswers: section.noAnswers === true,
    answerKeyStartPage: n(section.answerKeyStartPage),
    answerKeyEndPage: n(section.answerKeyEndPage),
    solutionsStartPage: n(section.solutionsStartPage),
    solutionsEndPage: n(section.solutionsEndPage),
  };
}

function toChapterRow(chapter: ApiChapter): ChapterRow {
  return {
    id: chapter.id,
    chapterNumber: n(chapter.chapterNumber),
    name: n(chapter.name),
    topic: n(chapter.topic),
    startPage: n(chapter.startPage),
    endPage: n(chapter.endPage),
    confirmed: chapter.confirmed === true,
    sections: (chapter.sections ?? []).map(toSectionRow),
  };
}

const blankSection = (): SectionRow => ({
  sectionType: '', title: '', startPage: '', endPage: '',
  inlineAnswers: false, noAnswers: false,
  answerKeyStartPage: '', answerKeyEndPage: '', solutionsStartPage: '', solutionsEndPage: '',
});

const blankChapter = (): ChapterRow => ({
  chapterNumber: '', name: '', topic: '', startPage: '', endPage: '', confirmed: false, sections: [],
});

export default function ManifestEditorClient({ bookId }: { bookId: string }) {
  const [book, setBook] = useState<{ title: string; className: string } | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [preview, setPreview] = useState<{ range: string; pages: Array<{ pageNumber: number; rawText: string | null }> } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/books/${bookId}/manifest`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load the manifest');
      setBook(data.book);
      setRunId(data.run?.id ?? null);
      setTotalPages(data.run?.totalPages ?? null);
      setChapters((data.chapters ?? []).map(toChapterRow));
      setProposed(false);
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Failed to load the manifest' });
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => { void load(); }, [load]);

  const autoDetect = async () => {
    setDetecting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/books/${bookId}/manifest/detect`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Auto-detect failed');
      setRunId(data.runId ?? runId);
      setTotalPages(data.totalPages ?? totalPages);
      setChapters((data.proposal?.chapters ?? []).map(toChapterRow));
      setProposed(true);
      setMessage({
        kind: 'info',
        text: `Proposed ${data.proposal?.chapters?.length ?? 0} chapters from ${data.pagesScanned} pages. Review every range, then Confirm — nothing is saved yet.`,
      });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Auto-detect failed' });
    } finally {
      setDetecting(false);
    }
  };

  const confirm = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        chapters: chapters.map((chapter) => ({
          id: chapter.id,
          chapterNumber: chapter.chapterNumber || null,
          name: chapter.name,
          topic: chapter.topic || null,
          startPage: toInt(chapter.startPage),
          endPage: toInt(chapter.endPage),
          sections: chapter.sections.map((section) => ({
            id: section.id,
            sectionType: section.sectionType || null,
            title: section.title || null,
            startPage: toInt(section.startPage),
            endPage: toInt(section.endPage),
            inlineAnswers: section.noAnswers ? false : section.inlineAnswers,
            noAnswers: section.noAnswers,
            answerKeyStartPage: section.noAnswers ? null : toInt(section.answerKeyStartPage),
            answerKeyEndPage: section.noAnswers ? null : toInt(section.answerKeyEndPage),
            solutionsStartPage: section.noAnswers ? null : toInt(section.solutionsStartPage),
            solutionsEndPage: section.noAnswers ? null : toInt(section.solutionsEndPage),
          })),
        })),
      };
      const response = await fetch(`/api/admin/books/${bookId}/manifest`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save the manifest');
      setMessage({ kind: 'success', text: `Manifest confirmed — ${data.chapterCount} chapters. Extraction and matching will now use these ranges.` });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not save the manifest' });
    } finally {
      setSaving(false);
    }
  };

  const viewPages = async (start: string, end: string) => {
    const s = toInt(start);
    const e = toInt(end) ?? s;
    if (!runId || s == null || e == null) return;
    setPreviewLoading(true);
    setPreview({ range: `${s}–${e}`, pages: [] });
    try {
      const response = await fetch(`/api/admin/books/${bookId}/ingestions/${runId}/pages?start=${s}&end=${e}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load pages');
      setPreview({ range: `${s}–${e}`, pages: data.pages ?? [] });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not load pages' });
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // ---- editing helpers ----
  const patchChapter = (index: number, patch: Partial<ChapterRow>) =>
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const patchSection = (ci: number, si: number, patch: Partial<SectionRow>) =>
    setChapters((prev) => prev.map((c, i) => (i === ci ? { ...c, sections: c.sections.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : c)));
  const addChapter = () => setChapters((prev) => [...prev, blankChapter()]);
  const removeChapter = (index: number) => setChapters((prev) => prev.filter((_, i) => i !== index));
  const addSection = (ci: number) => setChapters((prev) => prev.map((c, i) => (i === ci ? { ...c, sections: [...c.sections, blankSection()] } : c)));
  const removeSection = (ci: number, si: number) => setChapters((prev) => prev.map((c, i) => (i === ci ? { ...c, sections: c.sections.filter((_, j) => j !== si) } : c)));

  const confirmedCount = useMemo(() => chapters.filter((c) => c.confirmed).length, [chapters]);
  const busy = saving || detecting || loading;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-black text-slate-900">Chapter manifest</h1>
        <p className="mt-1 text-sm text-slate-500">
          {book ? <>{book.title} · {book.className}</> : 'Loading…'}
          {totalPages ? <> · {totalPages} pages</> : null}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-400">
          {chapters.length === 0
            ? 'No chapters yet — run Auto-detect or add one.'
            : `${confirmedCount} of ${chapters.length} chapters confirmed`}
          {proposed ? ' · unsaved proposal' : ''}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3">
        <button onClick={() => void autoDetect()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {detecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-detect
        </button>
        <button onClick={addChapter} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          <Plus className="h-4 w-4" /> Add chapter
        </button>
        <button onClick={() => void confirm()} disabled={busy || chapters.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm manifest
        </button>
      </div>

      {message && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800'
        }`}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading manifest…</div>
      ) : (
        <div className="space-y-5">
          {chapters.map((chapter, ci) => (
            <section key={ci} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Ch #" width="w-16">
                  <input value={chapter.chapterNumber} onChange={(e) => patchChapter(ci, { chapterNumber: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Chapter name" width="flex-1 min-w-52">
                  <input value={chapter.name} onChange={(e) => patchChapter(ci, { name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Topic (canonical)" width="w-52">
                  <input value={chapter.topic} onChange={(e) => patchChapter(ci, { topic: e.target.value })} placeholder="defaults to name" className={inputCls} />
                </Field>
                <PageRange
                  startValue={chapter.startPage} endValue={chapter.endPage}
                  onStart={(v) => patchChapter(ci, { startPage: v })} onEnd={(v) => patchChapter(ci, { endPage: v })}
                  onView={() => void viewPages(chapter.startPage, chapter.endPage)} label="Pages"
                />
                <button onClick={() => removeChapter(ci)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" aria-label="Remove chapter">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4">
                {chapter.sections.map((section, si) => (
                  <div key={si} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <Field label="Section type" width="w-44">
                        <select value={section.sectionType} onChange={(e) => patchSection(ci, si, { sectionType: e.target.value })} className={inputCls}>
                          {SECTION_TYPES.map((type) => <option key={type} value={type}>{type || '— none —'}</option>)}
                        </select>
                      </Field>
                      <Field label="Heading / title" width="flex-1 min-w-40">
                        <input value={section.title} onChange={(e) => patchSection(ci, si, { title: e.target.value })} className={inputCls} />
                      </Field>
                      <PageRange
                        startValue={section.startPage} endValue={section.endPage}
                        onStart={(v) => patchSection(ci, si, { startPage: v })} onEnd={(v) => patchSection(ci, si, { endPage: v })}
                        onView={() => void viewPages(section.startPage, section.endPage)} label="Question pages"
                      />
                      <button onClick={() => removeSection(ci, si)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" aria-label="Remove section">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-slate-600">
                      <label className="inline-flex items-center gap-1.5">
                        <input type="checkbox" checked={section.noAnswers} onChange={(e) => patchSection(ci, si, { noAnswers: e.target.checked })} />
                        No answers (practice exercise)
                      </label>
                      <label className={`inline-flex items-center gap-1.5 ${section.noAnswers ? 'opacity-40' : ''}`}>
                        <input type="checkbox" disabled={section.noAnswers} checked={section.inlineAnswers} onChange={(e) => patchSection(ci, si, { inlineAnswers: e.target.checked })} />
                        Answers inline with questions
                      </label>
                      <label className={`inline-flex items-center gap-1.5 ${section.noAnswers ? 'opacity-40' : ''}`}>
                        <input type="checkbox" disabled={section.noAnswers}
                          checked={Boolean(section.answerKeyStartPage)}
                          onChange={(e) => patchSection(ci, si, e.target.checked ? {} : { answerKeyStartPage: '', answerKeyEndPage: '' })} />
                        Separate answer key
                      </label>
                      {!section.noAnswers && Boolean(section.answerKeyStartPage || section.answerKeyEndPage) && (
                        <PageRange
                          startValue={section.answerKeyStartPage} endValue={section.answerKeyEndPage}
                          onStart={(v) => patchSection(ci, si, { answerKeyStartPage: v })} onEnd={(v) => patchSection(ci, si, { answerKeyEndPage: v })}
                          onView={() => void viewPages(section.answerKeyStartPage, section.answerKeyEndPage)} label="Key pages" compact
                        />
                      )}
                      <label className={`inline-flex items-center gap-1.5 ${section.noAnswers ? 'opacity-40' : ''}`}>
                        <input type="checkbox" disabled={section.noAnswers}
                          checked={Boolean(section.solutionsStartPage)}
                          onChange={(e) => patchSection(ci, si, e.target.checked ? {} : { solutionsStartPage: '', solutionsEndPage: '' })} />
                        Separate detailed solutions
                      </label>
                      {!section.noAnswers && Boolean(section.solutionsStartPage || section.solutionsEndPage) && (
                        <PageRange
                          startValue={section.solutionsStartPage} endValue={section.solutionsEndPage}
                          onStart={(v) => patchSection(ci, si, { solutionsStartPage: v })} onEnd={(v) => patchSection(ci, si, { solutionsEndPage: v })}
                          onView={() => void viewPages(section.solutionsStartPage, section.solutionsEndPage)} label="Solution pages" compact
                        />
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={() => addSection(ci)} className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600">
                  <Plus className="h-3.5 w-3.5" /> Add section
                </button>
              </div>
            </section>
          ))}
        </div>
      )}

      {preview && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">OCR text · pages {preview.range}</h2>
            <button onClick={() => setPreview(null)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700" aria-label="Close preview"><X className="h-5 w-5" /></button>
          </div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="space-y-4">
              {preview.pages.map((page) => (
                <div key={page.pageNumber}>
                  <div className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Page {page.pageNumber}</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{page.rawText || '(no text captured)'}</pre>
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

function PageRange({ startValue, endValue, onStart, onEnd, onView, label, compact }: {
  startValue: string; endValue: string;
  onStart: (v: string) => void; onEnd: (v: string) => void; onView: () => void;
  label: string; compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'block'}>
      {!compact && <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>}
      <div className="flex items-center gap-1">
        <input inputMode="numeric" value={startValue} onChange={(e) => onStart(e.target.value)} placeholder="from" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label={`${label} start`} />
        <span className="text-slate-400">–</span>
        <input inputMode="numeric" value={endValue} onChange={(e) => onEnd(e.target.value)} placeholder="to" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" aria-label={`${label} end`} />
        <button type="button" onClick={onView} disabled={!startValue} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-40" aria-label={`View ${label}`}>
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
