'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Circle, Eye, Loader2, Play, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-react';

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
  /** This row's identity in the editor, kept while it has no id yet (a chapter not saved before). */
  key: string;
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
  /** Extraction progress as saved on the server, so it shows again after a reload; null for a chapter without a range. */
  extraction: Extraction | null;
  sections: SectionRow[];
};

type Extraction = { pages: number; done: number; failed: number; nextPage: number | null; drafts: number };

const s = (v: unknown): string => (v == null || v === '' ? '' : String(v));
const newKey = () => `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
    key: x.key ?? x.id ?? newKey(),
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
    extraction: x.extraction ?? null,
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
  key: newKey(), chapterNumber: '', name: '', topic: '', startPage: '', endPage: '',
  printedStartPage: '', printedEndPage: '', confirmed: false, questionsInRange: 0, extraction: null, sections: [],
});

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

// Edits are saved as they are made (autosave below). Until the server has them -- a dropped connection, a reload
// mid-save, or a row it cannot take yet (a new chapter with no name, a range still being typed) -- they are also
// kept in this browser, and put back when the manifest is opened again.
type Backup = { savedAt: string; chapters: ChapterRow[] };
const backupKey = (bookId: string) => `manifest-draft:${bookId}`;
function readBackup(bookId: string): Backup | null {
  try {
    const raw = window.localStorage.getItem(backupKey(bookId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.chapters) ? parsed : null;
  } catch { return null; }
}
function writeBackup(bookId: string, chapters: ChapterRow[]) {
  try { window.localStorage.setItem(backupKey(bookId), JSON.stringify({ savedAt: new Date().toISOString(), chapters })); } catch { /* storage unavailable */ }
}
function clearBackup(bookId: string) {
  try { window.localStorage.removeItem(backupKey(bookId)); } catch { /* storage unavailable */ }
}

/** Which chapters are minimised, remembered in this browser per book. */
const collapsedKey = (bookId: string) => `manifest-collapsed:${bookId}`;
const rowKey = (c: ChapterRow) => c.id ?? c.key;
const fullyExtracted = (c: ChapterRow) => !!c.extraction && c.extraction.done > 0 && c.extraction.nextPage == null;

type AutosaveState = { state: 'saved' | 'pending' | 'saving' | 'failed' | 'paused'; detail?: string };

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
  const [editVersion, setEditVersion] = useState(0);
  const [autosave, setAutosave] = useState<AutosaveState>({ state: 'saved' });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const chaptersRef = useRef(chapters);
  const editVersionRef = useRef(editVersion);
  const pausedRef = useRef(false);
  const savingRef = useRef(false);
  const againRef = useRef(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { chaptersRef.current = chapters; }, [chapters]);
  useEffect(() => { editVersionRef.current = editVersion; }, [editVersion]);

  /** Every change the admin makes goes through here, so it is saved. */
  const edit = (update: (prev: ChapterRow[]) => ChapterRow[]) => {
    setChapters(update);
    setEditVersion((v) => v + 1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load the manifest');
      setBook(data.book);
      setRunId(data.run?.id ?? null);
      setTotalPages(data.run?.totalPages ?? null);
      const serverRows: ChapterRow[] = (data.chapters ?? []).map(toChapterRow);
      const backup = readBackup(bookId);
      if (backup) {
        // Changes this browser had not got saved: put them back (with the server's latest counts) and save them now.
        const fresh = new Map(serverRows.filter((c) => c.id).map((c) => [c.id as string, c]));
        setChapters(backup.chapters.map((c) => {
          const f = c.id ? fresh.get(c.id) : undefined;
          // Already editor rows: kept as they are (not converted again from the server's format).
          return { ...c, key: c.key ?? c.id ?? newKey(), questionsInRange: f?.questionsInRange ?? 0, extraction: f?.extraction ?? null };
        }));
        setMessage({ kind: 'info', text: `Put back the changes made in this browser at ${new Date(backup.savedAt).toLocaleString()} that had not been saved yet. Saving them now.` });
        setEditVersion((v) => v + 1);
      } else {
        setChapters(serverRows);
      }
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Failed to load' });
    } finally {
      setLoading(false);
    }
  }, [bookId]);
  useEffect(() => { void load(); }, [load]);

  // Merge fresh per-chapter question counts and extraction progress without disturbing unsaved edits.
  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`);
      const data = await res.json();
      if (!res.ok) return;
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const byId = new Map<string, any>((data.chapters ?? []).map((c: any) => [c.id, c]));
      setChapters((prev) => prev.map((c) => {
        const fresh = c.id ? byId.get(c.id) : undefined;
        return fresh ? { ...c, questionsInRange: fresh.questionsInRange ?? 0, extraction: fresh.extraction ?? null } : c;
      }));
    } catch { /* best effort */ }
  }, [bookId]);

  // Saves the whole manifest a moment after each edit. One save at a time; an edit made during a save is saved
  // right after it. A new chapter is sent once it has a name (the server needs one) and kept in this browser until then.
  const autosaveNow = useCallback(async () => {
    if (pausedRef.current) return;
    if (savingRef.current) { againRef.current = true; return; }
    savingRef.current = true;
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    const version = editVersionRef.current;
    const rows = chaptersRef.current;
    const sendable = rows.filter((c) => c.id || c.name.trim());
    setAutosave({ state: 'saving' });
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(sendable)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      const ids: string[] = Array.isArray(data.chapterIds) ? data.chapterIds : [];
      const idByKey = new Map(sendable.map((c, i) => [c.key, ids[i]]));
      setChapters((prev) => prev.map((c) => (!c.id && idByKey.get(c.key) ? { ...c, id: idByKey.get(c.key) } : c)));
      const waiting = rows.length - sendable.length;
      if (waiting > 0) {
        setAutosave({ state: 'failed', detail: `${waiting} new chapter${waiting === 1 ? ' has' : 's have'} no name yet; kept in this browser until named` });
      } else {
        if (version === editVersionRef.current) clearBackup(bookId);
        setAutosave({ state: 'saved', detail: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      }
    } catch (e) {
      setAutosave({ state: 'failed', detail: e instanceof Error ? e.message : 'Could not save' });
      // Tried again on its own (a dropped connection usually comes back); an edit or reconnecting tries sooner.
      retryRef.current = setTimeout(() => void autosaveNow(), 10_000);
    } finally {
      savingRef.current = false;
      if (againRef.current) { againRef.current = false; void autosaveNow(); }
    }
  }, [bookId]);

  useEffect(() => {
    const onOnline = () => { if (readBackup(bookId)) void autosaveNow(); };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [bookId, autosaveNow]);

  useEffect(() => {
    if (editVersion === 0 || pausedRef.current) return;
    writeBackup(bookId, chaptersRef.current);
    setAutosave({ state: 'pending' });
    const timer = setTimeout(() => void autosaveNow(), 2000);
    return () => clearTimeout(timer);
  }, [editVersion, bookId, autosaveNow]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(collapsedKey(bookId));
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
    } catch { /* storage unavailable */ }
  }, [bookId]);
  const rememberCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    try { window.localStorage.setItem(collapsedKey(bookId), JSON.stringify([...next])); } catch { /* storage unavailable */ }
  };
  const toggleCollapsed = (c: ChapterRow) => {
    const next = new Set(collapsed);
    if (next.has(rowKey(c))) next.delete(rowKey(c)); else next.add(rowKey(c));
    rememberCollapsed(next);
  };

  const save = async (rows: ChapterRow[], successText: string) => {
    setBusy('save');
    while (savingRef.current) await new Promise((resolve) => setTimeout(resolve, 200));
    savingRef.current = true;
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/books/${bookId}/manifest`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(rows)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save');
      setMessage({ kind: 'success', text: successText });
      clearBackup(bookId);
      pausedRef.current = false;
      setAutosave({ state: 'saved', detail: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      savingRef.current = false;
      await load();
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save' });
      return false;
    } finally {
      savingRef.current = false;
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
      // A proposal replaces the whole manifest with unconfirmed chapters, so it is not saved on its own: autosave
      // waits until the admin saves it (Save draft) or reloads to discard it.
      pausedRef.current = true;
      setAutosave({ state: 'paused' });
      setChapters((data.proposal?.chapters ?? []).map((c: unknown) => ({ ...toChapterRow(c), confirmed: false })));
      setMessage({
        kind: 'info',
        text: data.tocFound
          ? `Proposed ${data.proposal.chapters.length} chapters from the table of contents (book→PDF offset +${data.pageOffset}). Check the offset and every range, then confirm chapters one at a time. Nothing is saved until you press Save draft; reload to discard it.`
          : `No table of contents found — proposed ${data.proposal.chapters.length} chapters from running headers. Review carefully. Nothing is saved until you press Save draft; reload to discard it.`,
      });
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Auto-detect failed' });
    } finally {
      setBusy(null);
    }
  };

  const reapplyOffset = () => {
    const off = toInt(pageOffset) ?? 0;
    edit((prev) => prev.map((c) => {
      const ps = toInt(c.printedStartPage);
      const pe = toInt(c.printedEndPage);
      return {
        ...c,
        startPage: ps != null ? String(ps + off) : c.startPage,
        endPage: pe != null ? String(pe + off) : c.endPage,
      };
    }));
    setMessage({ kind: 'info', text: `Re-applied offset +${off} to every chapter that has printed page numbers.` });
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

  // Runs right after extraction: for every freshly-saved DRAFT question that
  // already passed deterministic QA (STRUCTURALLY_VALID), independently
  // re-derives its answer and auto-approves it on a "verified" verdict --
  // the user's explicit call that extraction should validate and approve
  // correct questions automatically, not leave them sitting for manual
  // review. An "issue" verdict (or an LLM error) never approves; it's
  // flagged into the review queue exactly as a manual verify-mathematics
  // run would. Looped (bounded) since one call only processes up to 50
  // candidates and a large chapter can extract more than that; harmless to
  // call even when nothing new was saved -- it just processes 0 candidates.
  const autoVerifyAndApprove = async (): Promise<{ approved: number; flagged: number; errored: number }> => {
    let approved = 0, flagged = 0, errored = 0;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`/api/admin/books/${bookId}/verify-mathematics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true, limit: 50 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) break;
      approved += data.verified ?? 0;
      flagged += data.flagged ?? 0;
      errored += data.errored ?? 0;
      if ((data.candidatesProcessed ?? 0) === 0) break;
    }
    return { approved, flagged, errored };
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
        void refreshCounts();
        if (data.complete || data.nextStartPage == null) break;
        cursor = data.nextStartPage;
        if (cursor > end) break;
      }
      if (saved === 0 && failures === 0 && !force && alreadyExtracted > 0) {
        setExtractProgress((p) => ({ ...p, [index]: `${alreadyExtracted} pages already extracted · ${chapter.questionsInRange} questions` }));
        setMessage({ kind: 'info', text: `${chapter.name}: all ${alreadyExtracted} pages were already extracted earlier (${chapter.questionsInRange} questions in this range). Use "Re-extract" to reprocess them under the manifest, or "Re-file existing questions" to move them into this chapter.` });
      } else {
        const emptyList = [...emptySectionPages].sort((a, b) => a - b);
        let verifyText = '';
        if (saved > 0) {
          setExtractProgress((p) => ({ ...p, [index]: `extracted ${saved} — verifying…` }));
          const { approved, flagged, errored } = await autoVerifyAndApprove();
          verifyText = approved || flagged || errored
            ? ` ${approved} auto-approved (independently re-derived and confirmed correct), ${flagged} flagged for review${errored ? `, ${errored} pending retry (provider limit)` : ''}.`
            : '';
        }
        setExtractProgress((p) => ({ ...p, [index]: `done — ${saved} saved${failures ? `, ${failures} page failures` : ''}` }));
        setMessage({
          kind: emptyList.length ? 'info' : 'success',
          text: `${chapter.name}: extracted ${saved} question${saved === 1 ? '' : 's'}${failures ? ` (${failures} page failures)` : ''}.`
            + verifyText
            + (emptyList.length ? ` ${emptyList.length} page${emptyList.length === 1 ? '' : 's'} inside a question section produced no questions — check ${emptyList.slice(0, 12).join(', ')}${emptyList.length > 12 ? '…' : ''} (OCR gap, or the section range needs trimming).` : ''),
        });
      }
    } catch (e) {
      setExtractProgress((p) => ({ ...p, [index]: `stopped — ${saved} saved` }));
      setMessage({ kind: 'error', text: `${chapter.name}: ${e instanceof Error ? e.message : 'extraction failed'}. The questions from every page finished before the break are saved as drafts and stay listed here after a reload; use "Continue extraction" to carry on from the next page.` });
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
    edit((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const patchSection = (ci: number, si: number, patch: Partial<SectionRow>) =>
    edit((prev) => prev.map((c, idx) => (idx === ci ? { ...c, sections: c.sections.map((sec, j) => (j === si ? { ...sec, ...patch } : sec)) } : c)));
  const addChapter = () => edit((p) => [...p, blankChapter()]);
  const removeChapter = (i: number) => edit((p) => p.filter((_, idx) => idx !== i));
  const addSection = (ci: number) => edit((p) => p.map((c, idx) => (idx === ci ? { ...c, sections: [...c.sections, blankSection()] } : c)));
  const removeSection = (ci: number, si: number) => edit((p) => p.map((c, idx) => (idx === ci ? { ...c, sections: c.sections.filter((_, j) => j !== si) } : c)));

  const toggleChapterConfirm = async (i: number) => {
    const next = chapters.map((c, idx) => (idx === i ? { ...c, confirmed: !c.confirmed } : c));
    setChapters(next);
    await save(next, next[i].confirmed ? `Confirmed "${next[i].name}".` : `Unconfirmed "${next[i].name}".`);
  };

  const confirmedCount = useMemo(() => chapters.filter((c) => c.confirmed).length, [chapters]);
  const anyBusy = busy != null || loading;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/question-bank/books" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-brand">
        <ArrowLeft className="h-4 w-4" /> Book Ingestion Library
      </Link>

      <header className="mb-5">
        <h1 className="font-display text-2xl font-black text-slate-900 dark:text-white">Chapter manifest</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {book ? <>{book.title} · {book.className}</> : 'Loading…'}{totalPages ? <> · {totalPages} pages</> : null}
        </p>
        <p className="mt-1 text-xs font-bold text-slate-400 dark:text-slate-500">
          {chapters.length === 0 ? 'No chapters yet — run Auto-detect.' : `${confirmedCount} of ${chapters.length} chapters confirmed`}
        </p>
        <p data-testid="manifest-autosave" role="status" className={`mt-1 text-xs font-bold ${autosave.state === 'failed' ? 'text-rose-600 dark:text-rose-400' : autosave.state === 'paused' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
          {autosave.state === 'saving' ? 'Saving…'
            : autosave.state === 'pending' ? 'Unsaved changes — saving in a moment…'
            : autosave.state === 'failed' ? `Not saved yet: ${autosave.detail}. Your changes are kept in this browser and saved as soon as they can be.`
            : autosave.state === 'paused' ? 'Auto-detected chapters are not saved until you press Save draft.'
            : autosave.detail ? `All changes saved at ${autosave.detail}` : 'Changes are saved as you type.'}
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => void autoDetect()} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 dark:from-brand dark:to-brand-violet px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {busy === 'detect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Auto-detect
        </button>
        <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 dark:bg-surface dark:border-white/10 dark:text-slate-300">
          Book page → PDF offset
          <input inputMode="numeric" value={pageOffset} onChange={(e) => setPageOffset(e.target.value)} className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-white/10" />
          <button onClick={reapplyOffset} disabled={anyBusy} className="inline-flex items-center gap-1 text-xs font-black text-indigo-600 disabled:opacity-50 dark:text-brand"><RefreshCw className="h-3.5 w-3.5" /> Re-apply</button>
        </label>
        <button onClick={addChapter} disabled={anyBusy} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
          <Plus className="h-4 w-4" /> Add chapter
        </button>
        <button onClick={() => void save(chapters, 'Draft saved.')} disabled={anyBusy || chapters.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save draft
        </button>
        <button onClick={() => void save(chapters.map((c) => ({ ...c, confirmed: true })), 'All chapters confirmed.')} disabled={anyBusy || chapters.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-800 disabled:opacity-60 dark:bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4" /> Confirm all
        </button>
        <button onClick={() => void refile()} disabled={anyBusy || confirmedCount === 0} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
          {busy === 'refile' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Re-file existing questions
        </button>
        {chapters.some(fullyExtracted) && (
          <button onClick={() => rememberCollapsed(new Set([...collapsed, ...chapters.filter(fullyExtracted).map(rowKey)]))}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
            <ChevronRight className="h-4 w-4" /> Minimise extracted chapters
          </button>
        )}
        {collapsed.size > 0 && (
          <button onClick={() => rememberCollapsed(new Set())}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50 dark:bg-surface dark:border-white/10 dark:text-slate-300 hover:dark:bg-surface-muted">
            <ChevronDown className="h-4 w-4" /> Expand all
          </button>
        )}
      </div>

      {message && (
        <div className={`mb-5 rounded-xl border px-4 py-3 text-sm font-bold ${
          message.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400'
          : message.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-brand/20 dark:bg-brand/10 dark:text-brand'
        }`}>{message.text}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          {chapters.map((chapter, ci) => {
            const isCollapsed = collapsed.has(rowKey(chapter));
            return (
            <section key={chapter.key} data-testid={`manifest-chapter-${ci}`} className={`rounded-2xl border bg-white dark:bg-surface p-5 ${chapter.confirmed ? 'border-emerald-300 dark:border-emerald-500/30' : 'border-slate-200 dark:border-white/10'}`}>
              {isCollapsed ? (
                <button type="button" onClick={() => toggleCollapsed(chapter)} aria-expanded={false}
                  className="flex w-full items-center gap-2 text-left">
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-sm font-black text-slate-900 dark:text-white">{chapter.chapterNumber ? `${chapter.chapterNumber}. ` : ''}{chapter.name || 'Untitled chapter'}</span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    PDF pp. {chapter.startPage || '?'}–{chapter.endPage || '?'} · {chapter.sections.length} section{chapter.sections.length === 1 ? '' : 's'}
                  </span>
                </button>
              ) : (
              <div className="flex items-start gap-2">
              <button type="button" onClick={() => toggleCollapsed(chapter)} aria-expanded aria-label={`Minimise ${chapter.name || 'this chapter'}`} title="Minimise"
                className="mt-6 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-200">
                <ChevronDown className="h-4 w-4" />
              </button>
              <div className="flex flex-1 flex-wrap items-end gap-3">
                <Field label="Ch #" width="w-14"><input value={chapter.chapterNumber} onChange={(e) => patchChapter(ci, { chapterNumber: e.target.value })} className={inputCls} /></Field>
                <Field label="Chapter name" width="flex-1 min-w-48"><input value={chapter.name} onChange={(e) => patchChapter(ci, { name: e.target.value })} className={inputCls} /></Field>
                <Field label="Topic" width="w-44"><input value={chapter.topic} onChange={(e) => patchChapter(ci, { topic: e.target.value })} placeholder="= name" className={inputCls} /></Field>
                <Field label="Printed pp." width="w-24">
                  <div className="flex items-center gap-1">
                    <input inputMode="numeric" value={chapter.printedStartPage} onChange={(e) => patchChapter(ci, { printedStartPage: e.target.value })} className="w-11 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm dark:border-white/10" />
                    <span className="text-slate-400 dark:text-slate-500">–</span>
                    <input inputMode="numeric" value={chapter.printedEndPage} onChange={(e) => patchChapter(ci, { printedEndPage: e.target.value })} className="w-11 rounded-lg border border-slate-200 px-1.5 py-1.5 text-sm dark:border-white/10" />
                  </div>
                </Field>
                <PageRange label="PDF pages" startValue={chapter.startPage} endValue={chapter.endPage}
                  onStart={(v) => patchChapter(ci, { startPage: v })} onEnd={(v) => patchChapter(ci, { endPage: v })}
                  onView={() => void viewPages(chapter.startPage, chapter.endPage)} />
                <button onClick={() => removeChapter(ci)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600 dark:border-white/10 dark:text-slate-500 hover:dark:text-rose-400 hover:dark:border-rose-500/20" aria-label="Remove chapter"><Trash2 className="h-4 w-4" /></button>
              </div>
              </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button onClick={() => void toggleChapterConfirm(ci)} disabled={anyBusy}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black disabled:opacity-50 ${chapter.confirmed ? 'bg-emerald-600 text-white' : 'border border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                  {chapter.confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {chapter.confirmed ? 'Confirmed' : 'Confirm chapter'}
                </button>
                <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600 dark:bg-white/5 dark:text-slate-400" title="Questions currently in this chapter's PDF page range">
                  {chapter.questionsInRange} question{chapter.questionsInRange === 1 ? '' : 's'} in range
                </span>
                {chapter.extraction && (chapter.extraction.done > 0 || chapter.extraction.drafts > 0) && (
                  <span data-testid={`extraction-progress-${ci}`} className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-700 dark:bg-brand/10 dark:text-brand" title="Saved on the server: shown again after a reload">
                    {chapter.extraction.done} of {chapter.extraction.pages} pages extracted
                    {chapter.extraction.failed > 0 && ` · ${chapter.extraction.failed} failed`}
                    {` · ${chapter.extraction.drafts} draft${chapter.extraction.drafts === 1 ? '' : 's'} saved`}
                  </span>
                )}
                {chapter.confirmed && (
                  <>
                    <button onClick={() => void extractChapter(ci)} disabled={anyBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 disabled:opacity-50 dark:text-brand dark:bg-brand/10">
                      {busy === `extract-${ci}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      {chapter.extraction && chapter.extraction.done > 0 && chapter.extraction.nextPage != null
                        ? `Continue extraction from page ${chapter.extraction.nextPage} (${chapter.extraction.pages - chapter.extraction.done} left)`
                        : 'Extract this chapter'}
                    </button>
                    <button onClick={() => void extractChapter(ci, true)} disabled={anyBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:bg-surface dark:border-white/10 dark:text-slate-400 hover:dark:bg-surface-muted">
                      Re-extract (force)
                    </button>
                  </>
                )}
                {chapter.extraction && chapter.extraction.drafts > 0 && chapter.startPage && (
                  <Link href={`/admin/question-bank/books/${bookId}/read?page=${chapter.startPage}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-50 dark:text-brand dark:hover:bg-white/5">
                    <BookOpen className="h-3.5 w-3.5" /> Review the drafts beside the pages
                  </Link>
                )}
                {extractProgress[ci] && <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{extractProgress[ci]}</span>}
              </div>

              {!isCollapsed && (
              <div className="mt-4 space-y-3 border-l-2 border-slate-100 pl-4 dark:border-white/10">
                {chapter.sections.map((section, si) => (
                  <div key={si} className="rounded-xl bg-slate-50 p-3 dark:bg-surface-muted">
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
                      <button onClick={() => removeSection(ci, si)} className="mb-1 rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600 dark:border-white/10 dark:text-slate-500 hover:dark:text-rose-400 hover:dark:border-rose-500/20" aria-label="Remove section"><Trash2 className="h-4 w-4" /></button>
                    </div>

                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                        <input type="checkbox" checked={section.noAnswers} onChange={(e) => patchSection(ci, si, { noAnswers: e.target.checked })} />
                        Practice exercise — no answers anywhere
                      </label>
                      <div className={section.noAnswers ? 'pointer-events-none opacity-40' : ''}>
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.inlineAnswers} onChange={(e) => patchSection(ci, si, { inlineAnswers: e.target.checked })} />
                          Answers / solutions printed inline with the questions
                        </label>

                        <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.hasAnswerKey}
                            onChange={(e) => patchSection(ci, si, { hasAnswerKey: e.target.checked, ...(e.target.checked ? {} : { answerKeyStartPage: '', answerKeyEndPage: '' }) })} />
                          Separate answer key
                          {section.hasAnswerKey && (
                            <>
                              <RangeMini startV={section.answerKeyStartPage} endV={section.answerKeyEndPage}
                                onStart={(v) => patchSection(ci, si, { answerKeyStartPage: v })} onEnd={(v) => patchSection(ci, si, { answerKeyEndPage: v })}
                                onView={() => void viewPages(section.answerKeyStartPage, section.answerKeyEndPage)} />
                              <select value={section.answerKeyCoverage} onChange={(e) => patchSection(ci, si, { answerKeyCoverage: e.target.value })} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs dark:border-white/10">
                                <option value="ALL">covers all</option>
                                <option value="SELECTED">selected only</option>
                              </select>
                            </>
                          )}
                        </label>

                        <label className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                          <input type="checkbox" disabled={section.noAnswers} checked={section.hasSolutions}
                            onChange={(e) => patchSection(ci, si, { hasSolutions: e.target.checked, ...(e.target.checked ? {} : { solutionsStartPage: '', solutionsEndPage: '' }) })} />
                          Separate detailed solutions
                          {section.hasSolutions && (
                            <>
                              <RangeMini startV={section.solutionsStartPage} endV={section.solutionsEndPage}
                                onStart={(v) => patchSection(ci, si, { solutionsStartPage: v })} onEnd={(v) => patchSection(ci, si, { solutionsEndPage: v })}
                                onView={() => void viewPages(section.solutionsStartPage, section.solutionsEndPage)} />
                              <select value={section.solutionCoverage} onChange={(e) => patchSection(ci, si, { solutionCoverage: e.target.value })} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs dark:border-white/10">
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
                <button onClick={() => addSection(ci)} className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-brand"><Plus className="h-3.5 w-3.5" /> Add section</button>
              </div>
              )}
            </section>
            );
          })}
        </div>
      )}

      {preview && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl dark:bg-surface dark:border-white/10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-sm font-black text-slate-900 dark:text-white">OCR text · pages {preview.range}</h2>
            <button onClick={() => setPreview(null)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:text-slate-500 hover:dark:text-slate-300" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          {previewLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="space-y-4">
              {preview.pages.map((p) => (
                <div key={p.pageNumber}>
                  <div className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Page {p.pageNumber}</div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-surface-muted dark:text-slate-300">{p.rawText || '(no text captured)'}</pre>
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
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function PageRange({ startValue, endValue, onStart, onEnd, onView, label }: {
  startValue: string; endValue: string; onStart: (v: string) => void; onEnd: (v: string) => void; onView: () => void; label: string;
}) {
  return (
    <div className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{label}</span>
      <RangeMini startV={startValue} endV={endValue} onStart={onStart} onEnd={onEnd} onView={onView} />
    </div>
  );
}

function RangeMini({ startV, endV, onStart, onEnd, onView }: {
  startV: string; endV: string; onStart: (v: string) => void; onEnd: (v: string) => void; onView: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input inputMode="numeric" value={startV} onChange={(e) => onStart(e.target.value)} placeholder="from" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10" aria-label="page from" />
      <span className="text-slate-400 dark:text-slate-500">–</span>
      <input inputMode="numeric" value={endV} onChange={(e) => onEnd(e.target.value)} placeholder="to" className="w-14 rounded-lg border border-slate-200 px-2 py-1.5 text-sm dark:border-white/10" aria-label="page to" />
      <button type="button" onClick={onView} disabled={!startV} className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:text-indigo-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-500 hover:dark:text-brand" aria-label="View pages"><Eye className="h-3.5 w-3.5" /></button>
    </span>
  );
}
