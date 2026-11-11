/**
 * What a sync run will write, described for a person: one entry per row promoted to live or copied down to staging,
 * named by what it is (a question's text, a book's title) rather than by its id, with the columns that differ and,
 * for a question, the before and after of what a reader sees.
 */
import type { Plan, Row, Snapshot } from './plan';
import { tableByName } from './tables';

export interface ChangeField {
  field: string;
  before: string | null;
  after: string | null;
}

export interface Change {
  table: string;
  id: string;
  /** Up to the live site, or down to staging. */
  direction: 'up' | 'down';
  kind: 'new' | 'updated' | 'deleted';
  label: string;
  /** The question this row is, or belongs to (a tag, figure, solution or version of it). */
  questionId: string | null;
  /** That question's text, for grouping a tag or figure under it. */
  questionLabel: string | null;
  /** Columns whose value differs between the two sides (bookkeeping timestamps left out). */
  changedFields: string[];
  /** For a question: before and after of each field a reader sees that differs (all of them for a new one). */
  fields?: ChangeField[];
}

/** The question fields a reader sees, in the order they are shown, and how they are named to a person. */
export const QUESTION_FIELDS: Array<[column: string, name: string]> = [
  ['content', 'Question'],
  ['options', 'Options'],
  ['correctAnswer', 'Answer'],
  ['explanation', 'Solution'],
  ['status', 'Status'],
];

const TIMESTAMPS = new Set(['createdAt', 'updatedAt']);
const MAX_TEXT = 4000;

const short = (value: string | null | undefined, length = 140) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
};
const capped = (value: string | null) => (value != null && value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value);

/** A row named for a person: a question by its text, a book by its title; '' when the table has nothing to name it by. */
export function labelOf(table: string, row: Row): string {
  switch (table) {
    case 'Question': return short(row.content) || 'Untitled question';
    case 'Book': case 'SourceDocument': case 'SamplePaper': case 'RevisionItem': case 'KnowledgeDocument': return short(row.title) || table;
    case 'BookChapter': return short([row.chapterNumber && `Chapter ${row.chapterNumber}`, row.name].filter(Boolean).join(': ')) || 'Chapter';
    case 'BookExercise': return short([row.code, row.title].filter(Boolean).join(' ')) || 'Exercise';
    case 'TagTaxonomy': return short(row.name) || 'Tag';
    case 'User': return short([row.firstName, row.lastName].filter(Boolean).join(' ')) || 'Account';
    case 'Flashcard': return short(row.front) || 'Flashcard';
    case 'DocumentPage': case 'SamplePaperPage': return row.pageNumber ? `Page ${row.pageNumber}` : 'Page';
    default: return '';
  }
}

export function describeChanges(plan: Plan, staging: Snapshot, live: Snapshot): Change[] {
  const changes: Change[] = [];
  for (const d of plan.decisions) {
    if (d.action !== 'promote' && d.action !== 'replicate' && d.action !== 'delete-live' && d.action !== 'delete-staging') continue;
    const direction = d.action === 'promote' || d.action === 'delete-live' ? 'up' : 'down';
    const [source, target] = direction === 'up' ? [staging, live] : [live, staging];
    const deleted = d.action === 'delete-live' || d.action === 'delete-staging';
    const after = deleted ? null : source[d.table]?.get(d.id) ?? null;
    const before = target[d.table]?.get(d.id) ?? null;
    const row = (after ?? before) as Row;
    const kind = deleted ? 'deleted' : before ? 'updated' : 'new';

    const columns = new Set([...Object.keys(after ?? {}), ...Object.keys(before ?? {})]);
    const changedFields = kind === 'updated'
      ? [...columns].filter((c) => !TIMESTAMPS.has(c) && after![c] !== before![c]).sort()
      : [];

    const questionColumn = d.table === 'Question' ? 'id' : tableByName(d.table).questionColumn;
    const questionId = questionColumn ? row[questionColumn] ?? null : null;

    const questionRow = questionId ? source.Question?.get(questionId) ?? target.Question?.get(questionId) : undefined;
    const questionLabel = questionRow ? labelOf('Question', questionRow) : null;
    const change: Change = { table: d.table, id: d.id, direction, kind, label: labelOf(d.table, row), questionId, questionLabel, changedFields };
    if (d.table === 'Question') {
      change.fields = QUESTION_FIELDS
        .filter(([column]) => (kind === 'updated' ? changedFields.includes(column) : (after ?? before)?.[column]))
        .map(([column]) => ({ field: column, before: capped(before?.[column] ?? null), after: capped(after?.[column] ?? null) }));
    }
    changes.push(change);
  }
  return changes;
}
