import { describe, expect, it } from 'vitest';
import { describeChanges } from './changes';
import type { Decision, Plan, Row, Snapshot } from './plan';

const snap = (tables: Record<string, Row[]>): Snapshot =>
  Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, new Map(rows.map((r) => [r.id as string, r]))]));
const plan = (decisions: Decision[]): Plan => ({ decisions, stagingHashes: new Map(), liveHashes: new Map() });

const question = (over: Row = {}): Row => ({
  id: 'q1', content: 'Find $x$ if $2x = 4$.', options: null, correctAnswer: '2', explanation: 'Divide by 2.', status: 'APPROVED', updatedAt: '2026-10-26', ...over,
});

describe('describeChanges', () => {
  it('names a question going live by its text and shows what a reader sees changing', () => {
    const staging = snap({ Question: [question({ explanation: 'Divide both sides by 2, so $x = 2$.', updatedAt: '2026-10-27' })] });
    const live = snap({ Question: [question()] });
    const [change] = describeChanges(plan([{ table: 'Question', id: 'q1', action: 'promote' }]), staging, live);
    expect(change).toMatchObject({ direction: 'up', kind: 'updated', label: 'Find $x$ if $2x = 4$.', questionId: 'q1', changedFields: ['explanation'] });
    expect(change.fields).toEqual([{ field: 'explanation', before: 'Divide by 2.', after: 'Divide both sides by 2, so $x = 2$.' }]);
  });

  it('shows every field a reader sees for a new question', () => {
    const [change] = describeChanges(plan([{ table: 'Question', id: 'q1', action: 'promote' }]), snap({ Question: [question()] }), snap({ Question: [] }));
    expect(change.kind).toBe('new');
    expect(change.fields?.map((f) => f.field)).toEqual(['content', 'correctAnswer', 'explanation', 'status']);
    expect(change.fields?.every((f) => f.before === null)).toBe(true);
  });

  it('ties a tag or figure to its question, and names books and chapters by title', () => {
    const staging = snap({
      QuestionTag: [{ id: 't1', questionId: 'q1', tagId: 'tag-1' }],
      BookChapter: [{ id: 'c1', chapterNumber: '3', name: 'Matrices', bookId: 'b1' }],
    });
    const changes = describeChanges(plan([
      { table: 'QuestionTag', id: 't1', action: 'promote' },
      { table: 'BookChapter', id: 'c1', action: 'promote' },
    ]), staging, snap({}));
    expect(changes[0]).toMatchObject({ table: 'QuestionTag', questionId: 'q1', kind: 'new' });
    expect(changes[1]).toMatchObject({ table: 'BookChapter', label: 'Chapter 3: Matrices', questionId: null });
  });

  it('describes rows copied down from live and rows deleted, and leaves out rows that are not written', () => {
    const live = snap({ Question: [question({ id: 'q2', content: 'A teacher question' })], QuestionTag: [{ id: 't9', questionId: 'q2', tagId: 'x' }] });
    const staging = snap({ QuestionTag: [{ id: 't8', questionId: 'q1', tagId: 'y' }] });
    const changes = describeChanges(plan([
      { table: 'Question', id: 'q2', action: 'replicate' },
      { table: 'QuestionTag', id: 't8', action: 'delete-staging' },
      { table: 'Question', id: 'q3', action: 'held', reason: 'not approved' },
      { table: 'Question', id: 'q4', action: 'in-sync' },
    ]), staging, live);
    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ direction: 'down', kind: 'new', label: 'A teacher question' });
    expect(changes[1]).toMatchObject({ direction: 'down', kind: 'deleted', questionId: 'q1' });
  });
});
