'use client';

import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, ChevronDown, ChevronRight, Search } from 'lucide-react';
import MathRenderer from '@/components/MathRenderer';
import type { Change, ChangeField } from '@/lib/content-sync/changes';

/** What each synced table is, to a person; rows that belong to a question are counted under it. */
const THING: Record<string, [one: string, many: string]> = {
  Question: ['question', 'questions'],
  Solution: ['solution', 'solutions'],
  QuestionVersion: ['edit-history entry', 'edit-history entries'],
  QuestionImage: ['image', 'images'],
  QuestionTag: ['tag', 'tags'],
  QuestionEmbedding: ['search entry', 'search entries'],
  PageFigure: ['figure', 'figures'],
  Book: ['Book', 'Books'],
  BookChapter: ['Chapter', 'Chapters'],
  BookExercise: ['Exercise', 'Exercises'],
  SourceDocument: ['Source PDF', 'Source PDFs'],
  DocumentPage: ['Book page', 'Book pages'],
  SamplePaper: ['Sample paper', 'Sample papers'],
  SamplePaperPage: ['Sample paper page', 'Sample paper pages'],
  TagTaxonomy: ['Tag', 'Tags'],
  User: ['Account', 'Accounts'],
  KnowledgeFolder: ['Knowledge folder', 'Knowledge folders'],
  KnowledgeDocument: ['Knowledge document', 'Knowledge documents'],
  Flashcard: ['Flashcard', 'Flashcards'],
  DocumentChunk: ['Knowledge passage', 'Knowledge passages'],
  RevisionItem: ['Revision item', 'Revision items'],
};
const thing = (table: string, count = 1) => (THING[table] ?? [table, table])[count === 1 ? 0 : 1];
const FIELD_NAME: Record<string, string> = { content: 'Question', options: 'Options', correctAnswer: 'Answer', explanation: 'Solution', status: 'Status' };
const words = (column: string) => FIELD_NAME[column] ?? column.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

interface QuestionGroup {
  questionId: string;
  label: string;
  question: Change | null;
  parts: Change[];
}

const PAGE = 40;

export default function SyncChanges({ changes, applied, truncated }: { changes: Change[]; applied: boolean; truncated: boolean }) {
  const up = changes.filter((c) => c.direction === 'up');
  const down = changes.filter((c) => c.direction === 'down');
  const [direction, setDirection] = useState<'up' | 'down'>(up.length || !down.length ? 'up' : 'down');
  const [view, setView] = useState<'questions' | 'other'>('questions');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const list = direction === 'up' ? up : down;
  const { groups, other } = useMemo(() => {
    const byQuestion = new Map<string, QuestionGroup>();
    const rest: Change[] = [];
    for (const c of list) {
      if (!c.questionId) { rest.push(c); continue; }
      const g = byQuestion.get(c.questionId) ?? { questionId: c.questionId, label: c.questionLabel ?? '', question: null, parts: [] };
      if (c.table === 'Question') { g.question = c; g.label = c.label; } else g.parts.push(c);
      byQuestion.set(c.questionId, g);
    }
    return { groups: [...byQuestion.values()], other: rest };
  }, [list]);

  const q = query.trim().toLowerCase();
  const visibleGroups = q ? groups.filter((g) => g.label.toLowerCase().includes(q) || g.questionId.includes(q)) : groups;
  const visibleOther = q ? other.filter((c) => c.label.toLowerCase().includes(q) || thing(c.table).toLowerCase().includes(q) || c.id.includes(q)) : other;

  const toggle = (id: string) => setOpen((s) => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const switchTo = (next: Partial<{ direction: 'up' | 'down'; view: 'questions' | 'other' }>) => {
    if (next.direction) setDirection(next.direction);
    if (next.view) setView(next.view);
    setShown(PAGE);
  };

  const beforeName = direction === 'up' ? 'Live now' : 'Staging now';
  const afterName = applied ? (direction === 'up' ? 'Published' : 'Copied down') : (direction === 'up' ? 'After publishing' : 'After copying down');

  return (
    <section data-testid="sync-changes" className="rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-white/10">
        <div>
          <h2 className="font-display text-lg font-black text-slate-900 dark:text-white">{applied ? 'What was changed' : 'What will change'}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Open a question to compare it before and after.</p>
        </div>
        <div role="tablist" aria-label="Direction" className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {([['up', `${applied ? 'Sent' : 'Going'} to live`, up.length, ArrowUpFromLine], ['down', 'Coming down from live', down.length, ArrowDownToLine]] as const).map(([value, label, count, Icon]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={direction === value}
              onClick={() => switchTo({ direction: value })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold ${direction === value ? 'bg-white text-slate-900 shadow-sm dark:bg-white/15 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              <Icon className="h-3.5 w-3.5" /> {label} <span className="tabular-nums opacity-70">{count.toLocaleString('en-IN')}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        {([['questions', 'Questions', groups.length], ['other', 'Books, pages and other content', other.length]] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => switchTo({ view: value })}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold ${view === value ? 'bg-slate-900 text-white dark:bg-white/15' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'}`}
          >
            {label} <span className="tabular-nums opacity-70">{count.toLocaleString('en-IN')}</span>
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Search the changes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="sync-changes-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
            placeholder="Search text or id"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-white/5"
          />
        </label>
      </div>

      <div className="p-4">
        {view === 'questions' ? (
          visibleGroups.length === 0 ? <p className="py-4 text-sm text-slate-500 dark:text-slate-400">No questions {q ? 'match' : direction === 'up' ? 'go to live' : 'come down'} in this run.</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {visibleGroups.slice(0, shown).map((g) => (
                <QuestionRow key={g.questionId} group={g} open={open.has(g.questionId)} onToggle={() => toggle(g.questionId)} beforeName={beforeName} afterName={afterName} />
              ))}
            </ul>
          )
        ) : (
          visibleOther.length === 0 ? <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Nothing else {q ? 'matches' : 'changes'} in this direction.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th scope="col" className="py-2 pr-4">What</th>
                    <th scope="col" className="py-2 pr-4">Name</th>
                    <th scope="col" className="py-2">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {visibleOther.slice(0, shown).map((c) => (
                    <tr key={`${c.table}:${c.id}`}>
                      <td className="whitespace-nowrap py-2 pr-4 font-bold text-slate-900 dark:text-white">{thing(c.table)}</td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{c.label || <span className="font-mono text-xs text-slate-500">{c.id}</span>}</td>
                      <td className="py-2 text-slate-600 dark:text-slate-400"><KindBadge kind={c.kind} />{c.changedFields.length > 0 && <span className="ml-2">{c.changedFields.map(words).join(', ')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        {(view === 'questions' ? visibleGroups.length : visibleOther.length) > shown && (
          <button type="button" onClick={() => setShown((s) => s + PAGE * 2)} className="mt-3 rounded-lg px-3 py-1.5 text-sm font-bold text-indigo-700 hover:bg-indigo-50 dark:text-brand dark:hover:bg-white/5">
            Show more ({((view === 'questions' ? visibleGroups.length : visibleOther.length) - shown).toLocaleString('en-IN')} left)
          </button>
        )}
        {truncated && <p className="mt-3 text-xs text-slate-500">This run changes more rows than can be listed here; the first 3,000 are shown.</p>}
      </div>
    </section>
  );
}

function KindBadge({ kind }: { kind: Change['kind'] }) {
  const style = kind === 'new' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
    : kind === 'deleted' ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
    : 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300';
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${style}`}>{kind === 'new' ? 'New' : kind === 'deleted' ? 'Removed' : 'Updated'}</span>;
}

function QuestionRow({ group, open, onToggle, beforeName, afterName }: { group: QuestionGroup; open: boolean; onToggle: () => void; beforeName: string; afterName: string }) {
  const counts = new Map<string, number>();
  for (const p of group.parts) counts.set(p.table, (counts.get(p.table) ?? 0) + 1);
  const partsText = [...counts].map(([table, n]) => `${n} ${thing(table, n)}`).join(', ');
  const fields = group.question?.fields ?? [];
  const status = fields.find((f) => f.field === 'status');
  const changed = group.question?.kind === 'updated' ? fields.map((f) => FIELD_NAME[f.field] ?? f.field) : [];

  return (
    <li className="py-3">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-2 text-left">
        {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-center gap-2">
            {group.question ? <KindBadge kind={group.question.kind} /> : <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Linked items only</span>}
            {status?.after && status.after !== status.before && <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{status.before ? `${status.before.toLowerCase()} → ` : ''}{status.after.toLowerCase()}</span>}
          </span>
          <span className="block text-sm text-slate-900 dark:text-white">{group.label || <span className="font-mono text-xs text-slate-500">{group.questionId}</span>}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {[changed.length ? `Changed: ${changed.join(', ')}` : '', partsText ? `with ${partsText}` : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-4 pl-6">
          {fields.filter((f) => f.field !== 'status').map((f) => <FieldCompare key={f.field} field={f} beforeName={beforeName} afterName={afterName} />)}
          {fields.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">The question itself is unchanged; only its {partsText || 'linked items'} {group.parts.length === 1 ? 'is' : 'are'} written.</p>}
          {group.parts.some((p) => p.kind === 'updated' && p.changedFields.length) && (
            <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
              {group.parts.filter((p) => p.kind === 'updated' && p.changedFields.length).map((p) => (
                <li key={`${p.table}:${p.id}`}>{thing(p.table)} updated: {p.changedFields.map(words).join(', ')}</li>
              ))}
            </ul>
          )}
          <p className="font-mono text-[11px] text-slate-400">{group.questionId}</p>
        </div>
      )}
    </li>
  );
}

function FieldValue({ field, value }: { field: string; value: string | null }) {
  if (value == null || value === '') return <p className="text-sm italic text-slate-400">Empty</p>;
  if (field === 'options') {
    let options: unknown;
    try { options = JSON.parse(value); } catch { options = null; }
    if (Array.isArray(options)) {
      return (
        <ol className="list-[upper-alpha] space-y-1 pl-5 text-sm">
          {options.map((o, i) => <li key={i}><MathRenderer content={String(o)} /></li>)}
        </ol>
      );
    }
  }
  return <div className="text-sm text-slate-800 dark:text-slate-200"><MathRenderer content={value} /></div>;
}

function FieldCompare({ field, beforeName, afterName }: { field: ChangeField; beforeName: string; afterName: string }) {
  const name = FIELD_NAME[field.field] ?? field.field;
  const isNew = field.before == null;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{name}</p>
      <div className={`grid gap-3 ${isNew ? '' : 'md:grid-cols-2'}`}>
        {!isNew && (
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{beforeName}</p>
            <FieldValue field={field.field} value={field.before} />
          </div>
        )}
        <div className="min-w-0 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 dark:border-brand/30 dark:bg-brand/5">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-brand">{afterName}</p>
          <FieldValue field={field.field} value={field.after} />
        </div>
      </div>
    </div>
  );
}
