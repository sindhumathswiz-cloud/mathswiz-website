'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, CheckCircle2, Columns2, Loader2, Rows3, Save } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import { analyzeQuestion } from '@/lib/question-qa';
import { editedFields, optionsOf, type QuestionDraft } from '@/lib/reader-edit';
import { NOT_ON_PAGE_TAG } from '@/lib/source-agreement';
import SourcePageViewer, { type InsertTarget } from '../../../SourcePageViewer';

interface PageQuestion {
  id: string; status: string; type: string; content: string; options: unknown; correctAnswer: string | null; explanation: string | null;
  printedNumber: string | null; sourcePageStart: number | null; sourcePageEnd: number | null; verificationStatus: string | null; reviewNotes: string | null; tags: string[];
}

const STATUS_STYLE: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700', DRAFT: 'bg-slate-100 text-slate-600', REPORTED: 'bg-red-50 text-red-700', PENDING_REVIEW: 'bg-amber-50 text-amber-700',
};

const draftOf = (q: PageQuestion): QuestionDraft => ({ content: q.content, options: optionsOf(q.options), correctAnswer: q.correctAnswer ?? '', explanation: q.explanation ?? '' });

export default function BookReaderClient({ bookId, initialPage, initialQuestionId }: { bookId: string; initialPage: number | null; initialQuestionId: string | null }) {
  const [layout, setLayout] = useState<'spread' | 'scroll'>('spread');
  const [coverAlone, setCoverAlone] = useState(true);
  const [visiblePage, setVisiblePage] = useState<number>(initialPage ?? 1);
  const [questions, setQuestions] = useState<PageQuestion[]>([]);
  const [pinned, setPinned] = useState<PageQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialQuestionId);
  const [drafts, setDrafts] = useState<Record<string, QuestionDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const loaded = useRef<string>('');

  // Pages in view: a spread shows two, a single column one.
  const from = visiblePage;
  const to = layout === 'spread' ? visiblePage + 1 : visiblePage;

  const load = useCallback(async (a: number, b: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/books/${bookId}/page-questions?from=${a}&to=${b}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load the questions');
      setQuestions(data.questions as PageQuestion[]);
      setListError(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Could not load the questions');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    const key = `${from}-${to}`;
    if (loaded.current === key) return;
    const timer = setTimeout(() => { loaded.current = key; void load(from, to); }, 250);
    return () => clearTimeout(timer);
  }, [from, to, load]);

  // A question opened by link may be on pages other than the first view: fetch it on its own so it is never missing.
  useEffect(() => {
    if (!initialQuestionId) return;
    void (async () => {
      const response = await fetch(`/api/admin/books/${bookId}/page-questions?questionId=${initialQuestionId}`);
      if (!response.ok) return;
      const data = await response.json();
      const found = (data.questions as PageQuestion[]).find((q) => q.id === initialQuestionId);
      if (found) setPinned(found);
    })();
  }, [bookId, initialQuestionId]);

  const list = useMemo(() => {
    const ids = new Set(questions.map((q) => q.id));
    return pinned && !ids.has(pinned.id) ? [pinned, ...questions] : questions;
  }, [questions, pinned]);

  const selected = list.find((q) => q.id === selectedId) ?? null;
  const draft = selected ? drafts[selected.id] ?? draftOf(selected) : null;

  const select = (q: PageQuestion) => {
    setSelectedId(q.id);
    setDrafts((d) => (d[q.id] ? d : { ...d, [q.id]: draftOf(q) }));
    setNotice(null);
  };
  useEffect(() => { if (selected && !drafts[selected.id]) setDrafts((d) => ({ ...d, [selected.id]: draftOf(selected) })); }, [selected, drafts]);

  const patchDraft = (changes: Partial<QuestionDraft>) => selected && setDrafts((d) => ({ ...d, [selected.id]: { ...(d[selected.id] ?? draftOf(selected)), ...changes } }));

  // Text selected on a page goes into the field of the question being edited.
  const insertTargets: InsertTarget[] | undefined = selected && draft
    ? [
      { id: 'content', label: 'Question' },
      ...draft.options.map((_, i) => ({ id: `option:${i}`, label: `Option ${String.fromCharCode(65 + i)}` })),
      { id: 'answer', label: 'Answer' },
      { id: 'explanation', label: 'Solution' },
    ]
    : undefined;
  const onInsert = (text: string, target: string) => {
    if (!selected || !draft) return;
    if (target === 'content') patchDraft({ content: draft.content ? `${draft.content}\n${text}` : text });
    else if (target === 'explanation') patchDraft({ explanation: draft.explanation ? `${draft.explanation}\n${text}` : text });
    else if (target === 'answer') patchDraft({ correctAnswer: text });
    else if (target.startsWith('option:')) patchDraft({ options: draft.options.map((o, i) => (i === Number(target.slice(7)) ? text : o)) });
  };

  const save = async () => {
    if (!selected || !draft) return;
    const changes = editedFields(draftOf(selected), draft);
    if (Object.keys(changes).length === 0) return;
    setSavingId(selected.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/questions/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not save the correction');
      const updated: PageQuestion = { ...selected, content: draft.content, options: draft.options, correctAnswer: draft.correctAnswer, explanation: draft.explanation };
      setQuestions((all) => all.map((q) => (q.id === updated.id ? updated : q)));
      setPinned((p) => (p && p.id === updated.id ? updated : p));
      setNotice({ kind: 'ok', text: 'Saved. The change is in the question\'s version history.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save the correction' });
    } finally {
      setSavingId(null);
    }
  };

  // Saves any correction and approves in one step, then opens the next question here that is not approved yet. The
  // approval gates (provenance, structure, figures) still apply: a refusal says why and nothing moves on.
  const approveAndNext = async () => {
    if (!selected || !draft) return;
    const changes = editedFields(draftOf(selected), draft);
    // Approving says the reviewer checked it against the page, so a "not found on page" flag goes with it.
    const tags = selected.tags.includes(NOT_ON_PAGE_TAG) ? selected.tags.filter((t) => t !== NOT_ON_PAGE_TAG) : undefined;
    setSavingId(selected.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/questions/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...changes, ...(tags ? { tags } : {}), status: 'APPROVED' }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not approve this question');
      const updated: PageQuestion = { ...selected, content: draft.content, options: draft.options, correctAnswer: draft.correctAnswer, explanation: draft.explanation, status: 'APPROVED', tags: tags ?? selected.tags };
      setQuestions((all) => all.map((q) => (q.id === updated.id ? updated : q)));
      setPinned((p) => (p && p.id === updated.id ? updated : p));
      const at = list.findIndex((q) => q.id === selected.id);
      const next = [...list.slice(at + 1), ...list.slice(0, at)].find((q) => q.status !== 'APPROVED' && q.status !== 'ARCHIVED');
      if (next) select(next);
      else setNotice({ kind: 'ok', text: 'Approved. Every question on these pages is approved; scroll on in the book for more.' });
    } catch (e) {
      setNotice({ kind: 'error', text: e instanceof Error ? e.message : 'Could not approve this question' });
    } finally {
      setSavingId(null);
    }
  };

  const highlight = selected && selected.sourcePageStart ? { page: selected.sourcePageStart, content: selected.content } : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 p-3 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href="/admin/question-bank/books" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400"><ArrowLeft className="h-4 w-4" /> Book Library</Link>
        <h1 className="font-display text-xl font-black text-slate-900 dark:text-white">Compare with the book</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Page layout" className="inline-flex overflow-hidden rounded-lg border border-slate-200 dark:border-white/10">
            <button type="button" onClick={() => setLayout('spread')} aria-pressed={layout === 'spread'} data-testid="layout-spread" className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${layout === 'spread' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Columns2 className="h-3.5 w-3.5" /> Two pages</button>
            <button type="button" onClick={() => setLayout('scroll')} aria-pressed={layout === 'scroll'} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${layout === 'scroll' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Rows3 className="h-3.5 w-3.5" /> One column</button>
          </div>
          {layout === 'spread' && (
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={coverAlone} onChange={(e) => setCoverAlone(e.target.checked)} /> First page alone
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <SourcePageViewer
          bookId={bookId}
          initialPage={initialPage}
          height="calc(100vh - 170px)"
          showHeaderLink={false}
          layout={layout}
          coverAlone={coverAlone}
          highlight={highlight}
          onVisiblePage={setVisiblePage}
          insertTargets={insertTargets}
          onInsert={onInsert}
        />

        <aside className="flex max-h-[calc(100vh-170px)] min-h-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface" aria-label="Questions on these pages">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
            <p className="text-sm font-black text-slate-900 dark:text-white">Questions on page{to > from ? `s ${from}–${to}` : ` ${from}`}</p>
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <span className="text-xs font-bold text-slate-400" data-testid="question-count">{list.length}</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {listError && <p className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{listError}</p>}
            {!listError && !loading && list.length === 0 && (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5"><BookOpen className="mr-2 inline h-4 w-4" />No questions have been extracted from these pages yet. Scroll the book, or extract this chapter from the Book Library.</p>
            )}
            {list.map((q) => {
              const isSelected = q.id === selectedId;
              const options = optionsOf(q.options);
              const issues = analyzeQuestion({ content: q.content, options, correctAnswer: q.correctAnswer ?? '', explanation: q.explanation ?? '', type: q.type });
              return (
                <article key={q.id} data-testid={`reader-question-${q.id}`} className={`rounded-xl border p-3 transition ${isSelected ? 'border-indigo-400 bg-indigo-50/40 ring-1 ring-indigo-300 dark:bg-brand/5' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'}`}>
                  <button type="button" onClick={() => select(q)} className="block w-full text-left" aria-expanded={isSelected}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                      <span className="text-slate-500">{q.printedNumber ? `Q ${q.printedNumber}` : 'Question'}</span>
                      <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[q.status] ?? 'bg-slate-100 text-slate-600'}`}>{q.status.replace('_', ' ').toLowerCase()}</span>
                      <span className="text-slate-400">p.{q.sourcePageStart}{q.sourcePageEnd && q.sourcePageEnd !== q.sourcePageStart ? `–${q.sourcePageEnd}` : ''}</span>
                      {issues.length > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{issues.map((i) => i.code.toLowerCase().replaceAll('_', ' ')).join(', ')}</span>}
                      {q.tags.includes(NOT_ON_PAGE_TAG) && <span data-testid="not-on-page" className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><AlertTriangle className="h-3 w-3" />not found on page</span>}
                    </div>
                    {!isSelected && <div className="line-clamp-3 text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={q.content} /></div>}
                  </button>

                  {isSelected && draft && (
                    <div className="mt-2 space-y-3">
                      {q.reviewNotes && <p data-testid="review-notes" className="whitespace-pre-line rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{q.reviewNotes}</p>}
                      <Field label="Question" id={`q-${q.id}-content`}>
                        <textarea id={`q-${q.id}-content`} data-testid="edit-content" value={draft.content} onChange={(e) => patchDraft({ content: e.target.value })} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs dark:border-white/10 dark:bg-white/5" />
                        <div className="mt-1 rounded-lg bg-white p-2 text-sm text-slate-800 dark:bg-white/5 dark:text-slate-200"><MathRenderer content={draft.content} /></div>
                      </Field>
                      {draft.options.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Options</p>
                          {draft.options.map((option, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="mt-2 w-5 text-xs font-black text-slate-500">{String.fromCharCode(65 + i)}</span>
                              <input aria-label={`Option ${String.fromCharCode(65 + i)}`} value={option} onChange={(e) => patchDraft({ options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 font-mono text-xs dark:border-white/10 dark:bg-white/5" />
                            </div>
                          ))}
                        </div>
                      )}
                      <Field label="Answer" id={`q-${q.id}-answer`}>
                        <input id={`q-${q.id}-answer`} data-testid="edit-answer" value={draft.correctAnswer} onChange={(e) => patchDraft({ correctAnswer: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs dark:border-white/10 dark:bg-white/5" />
                      </Field>
                      <Field label="Solution" id={`q-${q.id}-explanation`}>
                        <textarea id={`q-${q.id}-explanation`} data-testid="edit-explanation" value={draft.explanation} onChange={(e) => patchDraft({ explanation: e.target.value })} rows={4} className="w-full rounded-lg border border-slate-200 p-2 font-mono text-xs dark:border-white/10 dark:bg-white/5" />
                      </Field>
                      <p className="text-[11px] text-slate-400">Select text on a page, then use the green buttons above the book to send it into a field.</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => void save()} disabled={savingId === q.id || Object.keys(editedFields(draftOf(q), draft)).length === 0} data-testid="save-question" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                          {savingId === q.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save correction
                        </button>
                        {q.status !== 'APPROVED' && (
                          <button type="button" onClick={() => void approveAndNext()} disabled={savingId === q.id} data-testid="approve-next" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-40">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve and next
                          </button>
                        )}
                        {notice && <span role="status" className={`inline-flex items-center gap-1 text-xs font-semibold ${notice.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{notice.kind === 'ok' && <CheckCircle2 className="h-3.5 w-3.5" />}{notice.text}</span>}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return <div><label htmlFor={id} className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>{children}</div>;
}
