// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ledgerKey, parentsFirst, planSync, rowHash, type Row, type Snapshot } from './plan';

const exclusions = { userMobiles: ['9990000001'], idPrefix: 'e2e-', questionTag: 'E2E-Reader', bookTitlePrefix: 'E2E ' };

const admin: Row = { id: 'u-admin', role: 'ADMIN', mobileNumber: '9000000001', name: 'Admin' };
const teacher: Row = { id: 'u-teach', role: 'TEACHER', mobileNumber: '9000000002', name: 'Teacher' };
const student: Row = { id: 'u-stud', role: 'STUDENT', mobileNumber: '9000000003', name: 'Student' };
const e2eUser: Row = { id: 'u-e2e', role: 'TEACHER', mobileNumber: '9990000001', name: 'E2E' };

const book = (id: string, over: Row = {}): Row => ({ id, title: 'NCERT Class 12', createdById: 'u-admin', ...over });
const question = (id: string, over: Row = {}): Row => ({
  id, content: `Q ${id}`, status: 'APPROVED', tags: '{}', createdById: 'u-admin',
  bookId: null, bookChapterId: null, bookExerciseId: null, sourceDocumentId: null, samplePaperId: null, knowledgeFolderId: null, ...over,
});

function snap(tables: Record<string, Row[]>): Snapshot {
  const out: Snapshot = {};
  for (const [name, rows] of Object.entries(tables)) out[name] = new Map(rows.map((r) => [r.id as string, r]));
  return out;
}
/** A ledger as if everything in `rows` was synced as it is. */
function ledgerOf(tables: Record<string, Row[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, rows] of Object.entries(tables)) for (const r of rows) out.set(ledgerKey(name, r.id as string), rowHash(r));
  return out;
}
const run = (staging: Record<string, Row[]>, live: Record<string, Row[]>, ledger = new Map<string, string>()) => {
  const plan = planSync({ staging: snap(staging), live: snap(live), ledger, exclusions });
  const of = (table: string, id: string) => plan.decisions.find((d) => d.table === table && d.id === id);
  return { plan, of };
};

describe('rowHash', () => {
  it('ignores column order and sees every value', () => {
    expect(rowHash({ a: '1', b: null })).toBe(rowHash({ b: null, a: '1' }));
    expect(rowHash({ a: '1', b: null })).not.toBe(rowHash({ a: '1', b: '' }));
  });
});

describe('planSync: which side changed', () => {
  const base = { User: [admin], Question: [question('q1')] };

  it('leaves identical rows alone', () => {
    const { of } = run(base, base, ledgerOf(base));
    expect(of('Question', 'q1')?.action).toBe('in-sync');
  });

  it('promotes an approved question changed in staging', () => {
    const edited = { User: [admin], Question: [question('q1', { content: 'fixed' })] };
    expect(run(edited, base, ledgerOf(base)).of('Question', 'q1')?.action).toBe('promote');
  });

  it('holds a staging change until it is approved, and keeps the live copy', () => {
    const reworked = { User: [admin], Question: [question('q1', { content: 'draft fix', status: 'DRAFT' })] };
    const d = run(reworked, base, ledgerOf(base)).of('Question', 'q1');
    expect(d?.action).toBe('held');
    expect(d?.reason).toMatch(/awaiting approval/);
  });

  it('replicates a change made on the live site (a student report) down to staging', () => {
    const reported = { User: [admin], Question: [question('q1', { status: 'REPORTED' })] };
    expect(run(base, reported, ledgerOf(base)).of('Question', 'q1')?.action).toBe('replicate');
  });

  it('reports a conflict when both sides changed, and writes neither', () => {
    const s = { User: [admin], Question: [question('q1', { content: 'staging edit' })] };
    const l = { User: [admin], Question: [question('q1', { status: 'REPORTED' })] };
    const d = run(s, l, ledgerOf(base)).of('Question', 'q1');
    expect(d?.action).toBe('conflict');
    expect(d?.reason).toMatch(/both sides/);
  });

  it('treats rows that differ and were never synced as a conflict', () => {
    const s = { User: [admin], Question: [question('q1', { content: 'a' })] };
    const l = { User: [admin], Question: [question('q1', { content: 'b' })] };
    expect(run(s, l).of('Question', 'q1')?.action).toBe('conflict');
  });

  it('replicates new live content (a teacher\'s own question) down, with its author', () => {
    const l = { User: [admin, teacher], Question: [question('q9', { createdById: 'u-teach', status: 'DRAFT' })] };
    const { of } = run({ User: [admin] }, l, ledgerOf({ User: [admin] }));
    expect(of('Question', 'q9')?.action).toBe('replicate');
    expect(of('User', 'u-teach')?.action).toBe('replicate');
  });
});

describe('planSync: approval and what travels with a question', () => {
  it('promotes a new approved question with the book and chapter it belongs to', () => {
    const s = {
      User: [admin],
      Book: [book('b1')],
      BookChapter: [{ id: 'c1', bookId: 'b1', title: 'Relations' }],
      Question: [question('q1', { bookId: 'b1', bookChapterId: 'c1' })],
    };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('Question', 'q1')?.action).toBe('promote');
    expect(of('Book', 'b1')).toMatchObject({ action: 'promote', reason: 'needed by Question q1' });
    expect(of('BookChapter', 'c1')?.action).toBe('promote');
  });

  it('does not publish a new book until something approved needs it', () => {
    const s = { User: [admin], Book: [book('b1')], Question: [question('q1', { bookId: 'b1', status: 'DRAFT' })] };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('Question', 'q1')?.action).toBe('held');
    expect(of('Book', 'b1')).toMatchObject({ action: 'held', reason: 'nothing approved needs it yet' });
  });

  it('takes the pages of a source document that goes live', () => {
    const s = {
      User: [admin],
      SourceDocument: [{ id: 'd1', ingestedBy: 'u-admin', bookId: null }],
      DocumentPage: [{ id: 'p1', documentId: 'd1', pageNumber: '1' }, { id: 'p2', documentId: 'd1', pageNumber: '2' }],
      Question: [question('q1', { sourceDocumentId: 'd1' })],
    };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('SourceDocument', 'd1')?.action).toBe('promote');
    expect(of('DocumentPage', 'p1')?.action).toBe('promote');
    expect(of('DocumentPage', 'p2')?.action).toBe('promote');
  });

  it('sends a solution or tag up only with an approved question', () => {
    const s = {
      User: [admin],
      TagTaxonomy: [{ id: 't1', name: 'Relations', parentId: null }],
      Question: [question('q1'), question('q2', { status: 'DRAFT' })],
      Solution: [{ id: 's1', questionId: 'q1', content: 'x' }, { id: 's2', questionId: 'q2', content: 'y' }],
      QuestionTag: [{ id: 'qt1', questionId: 'q1', tagId: 't1' }],
    };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('Solution', 's1')?.action).toBe('promote');
    expect(of('Solution', 's2')).toMatchObject({ action: 'held', reason: 'its question is not approved' });
    expect(of('QuestionTag', 'qt1')?.action).toBe('promote');
    expect(of('TagTaxonomy', 't1')?.action).toBe('promote');
  });

  it('blocks a question whose author is not on the live site, and what depends on it', () => {
    const newcomer: Row = { id: 'u-new', role: 'ADMIN', mobileNumber: '9000000009' };
    const s = { User: [admin, newcomer], Book: [book('b1', { createdById: 'u-new' })], Question: [question('q1', { bookId: 'b1' })], Solution: [{ id: 's1', questionId: 'q1' }] };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('Book', 'b1')?.action).not.toBe('promote');
    expect(of('Question', 'q1')?.action).toBe('blocked');
    expect(of('Solution', 's1')?.action).toBe('blocked');
  });

  it('does not take a book up for a question that ends up blocked', () => {
    const newcomer: Row = { id: 'u-new', role: 'ADMIN', mobileNumber: '9000000009' };
    const s = { User: [admin, newcomer], Book: [book('b1')], Question: [question('q1', { bookId: 'b1', createdById: 'u-new' })] };
    const { of } = run(s, { User: [admin] }, ledgerOf({ User: [admin] }));
    expect(of('Question', 'q1')?.action).toBe('blocked');
    expect(of('Book', 'b1')?.action).toBe('held');
  });

  it('promotes an archive decision for a live question but not for one that never went live', () => {
    const live = { User: [admin], Question: [question('q1')] };
    const s = { User: [admin], Question: [question('q1', { status: 'ARCHIVED' }), question('q2', { status: 'ARCHIVED' })] };
    const { of } = run(s, live, ledgerOf(live));
    expect(of('Question', 'q1')?.action).toBe('promote');
    expect(of('Question', 'q2')).toMatchObject({ action: 'held', reason: 'archived before it went live' });
  });
});

describe('planSync: deletions', () => {
  it('never deletes a question from the live site, but does remove a dropped tag link', () => {
    const synced = { User: [admin], TagTaxonomy: [{ id: 't1', parentId: null }], Question: [question('q1')], QuestionTag: [{ id: 'qt1', questionId: 'q1', tagId: 't1' }] };
    const s = { User: [admin], TagTaxonomy: [{ id: 't1', parentId: null }] };
    const { of } = run(s, synced, ledgerOf(synced));
    expect(of('Question', 'q1')?.action).toBe('kept');
    expect(of('QuestionTag', 'qt1')?.action).toBe('delete-live');
  });

  it('forgets ledger rows gone from both sides', () => {
    const ledger = ledgerOf({ Question: [question('gone')] });
    expect(run({ User: [admin] }, { User: [admin] }, ledger).of('Question', 'gone')?.action).toBe('forget');
  });
});

describe('planSync: accounts and e2e data', () => {
  it('copies staff accounts down, but a student only if content needs them', () => {
    const { of } = run({}, { User: [admin, teacher, student] });
    expect(of('User', 'u-admin')?.action).toBe('replicate');
    expect(of('User', 'u-teach')?.action).toBe('replicate');
    expect(of('User', 'u-stud')?.action).toBe('kept');
  });

  it('never promotes account changes made in staging; the live site is authoritative', () => {
    const changed = { User: [{ ...admin, name: 'Renamed in staging' }] };
    expect(run(changed, { User: [admin] }, ledgerOf({ User: [admin] })).of('User', 'u-admin')?.action).toBe('replicate');
  });

  it('never syncs e2e accounts, fixtures, tagged questions or e2e books, or anything under them, either way', () => {
    const s = {
      User: [admin, e2eUser],
      Book: [book('b-e2e', { title: 'E2E Page Image Book' })],
      BookChapter: [{ id: 'c-e2e', bookId: 'b-e2e' }],
      Question: [
        question('e2e-mb-q1'),
        question('q-by-e2e', { createdById: 'u-e2e' }),
        question('q-tagged', { tags: '{E2E-Reader}' }),
        question('q-in-e2e-book', { bookId: 'b-e2e' }),
      ],
      Solution: [{ id: 's1', questionId: 'e2e-mb-q1' }],
    };
    const { plan } = run(s, { User: [admin, e2eUser], Question: [question('e2e-hm-q1', { createdById: 'u-e2e' })] }, ledgerOf({ User: [admin] }));
    const moved = plan.decisions.filter((d) => d.action === 'promote' || d.action === 'replicate');
    expect(moved).toEqual([]);
    for (const id of ['e2e-mb-q1', 'q-by-e2e', 'q-tagged', 'q-in-e2e-book', 'e2e-hm-q1']) {
      expect(plan.decisions.find((d) => d.id === id)?.action).toBe('excluded');
    }
  });
});

describe('parentsFirst', () => {
  it('orders a tag tree so parents come before children', () => {
    const rows = [{ id: 'c', parentId: 'b' }, { id: 'a', parentId: null }, { id: 'b', parentId: 'a' }];
    expect(parentsFirst(rows, 'parentId').map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('copes with a cycle without looping', () => {
    const rows = [{ id: 'x', parentId: 'y' }, { id: 'y', parentId: 'x' }];
    expect(parentsFirst(rows, 'parentId')).toHaveLength(2);
  });
});
