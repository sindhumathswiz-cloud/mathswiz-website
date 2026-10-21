// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedUser = vi.fn();
const recordAuditLog = vi.fn();
const loadConfirmedChapters = vi.fn();
const bookIngestionRun = { findFirst: vi.fn() };
const documentPage = { findMany: vi.fn() };
const question = { findMany: vi.fn(), update: vi.fn() };

vi.mock('@/lib/auth-server', () => ({ getAuthenticatedUser }));
vi.mock('@/lib/prisma', () => ({ default: { bookIngestionRun, documentPage, question } }));
vi.mock('@/lib/audit-log', () => ({ recordAuditLog, requestAuditContext: () => ({}) }));
vi.mock('@/lib/book-manifest', () => ({ loadConfirmedChapters }));

const params = Promise.resolve({ id: 'book-1', runId: 'run-1' });
const post = (body: unknown) => new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });

const page40 = '4. Prove that$x ^ { 2 } \\geq 0$for every real$x$.\nSol. A square is never negative, so$x ^ { 2 } \\geq 0$.\n5. Show that$y = 2$.\nSol. Given.\nAlgebra 40';
const draft = { id: 'q4', content: 'Prove that $x^2 \\geq 0$ for every real $x$.', type: 'SUBJECTIVE', options: [], correctAnswer: null, tags: ['Questions without Solutions', 'Extracted via mistral fallback -- answer/explanation stripped, unverified'], reviewNotes: null, printedNumber: '4', sourcePageStart: 40 };

describe('POST match-inline-solutions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedUser.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    bookIngestionRun.findFirst.mockResolvedValue({ id: 'run-1', sourceDocumentId: 'doc-1' });
    loadConfirmedChapters.mockResolvedValue([{ id: 'ch1', startPage: 38, endPage: 44, exercises: [
      { sectionType: 'SHORT_ANSWER', startPage: 39, endPage: 41, inlineAnswers: true, noAnswers: false },
      { sectionType: 'EXERCISE', startPage: 42, endPage: 43, inlineAnswers: false, noAnswers: false },
    ] }]);
    documentPage.findMany.mockResolvedValue([{ pageNumber: 40, rawText: page40, rawMarkdown: null }, { pageNumber: 41, rawText: '6. Next', rawMarkdown: null }]);
    question.findMany.mockResolvedValue([draft]);
    question.update.mockResolvedValue({});
  });

  it('previews without writing, and only looks at drafts in inline-answer sections', async () => {
    const { POST } = await import('./route');
    const data = await (await POST(post({}), { params }) as Response).json();
    expect(data).toMatchObject({ apply: false, sections: 1, candidates: 1, matched: 1, updated: 0 });
    expect(data.details[0]).toMatchObject({ outcome: 'would_update', solutionPages: 'p.40' });
    expect(question.update).not.toHaveBeenCalled();
    const where = question.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'DRAFT', printedNumber: { not: null } });
    expect(where.AND[0].OR).toEqual([{ sourcePageStart: { gte: 39, lte: 41 } }]);
  });

  it('writes the printed solution with a note and tag, and drops "Questions without Solutions"', async () => {
    const { POST } = await import('./route');
    const data = await (await POST(post({ apply: true }), { params }) as Response).json();
    expect(data.updated).toBe(1);
    const write = question.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: 'q4' });
    expect(write.data.explanation).toBe('A square is never negative, so$x ^ { 2 } \\geq 0$.');
    expect(write.data.tags).toContain('Solution from page text');
    expect(write.data.tags).not.toContain('Questions without Solutions');
    expect(write.data.reviewNotes).toMatch(/copied from the printed page \(p\.40\).*question 4/);
    expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'BOOK_INLINE_SOLUTIONS_MATCHED' }));
  });

  it('with refresh, also re-copies solutions it wrote before, without adding the note again', async () => {
    question.findMany.mockResolvedValue([{ ...draft, tags: ['Solution from page text'], reviewNotes: 'Worked solution copied from the printed page (p.40)' }]);
    const { POST } = await import('./route');
    await POST(post({ apply: true, refresh: true }), { params });
    expect(question.findMany.mock.calls[0][0].where.OR).toContainEqual({ tags: { has: 'Solution from page text' } });
    const write = question.update.mock.calls[0][0];
    expect(write.data.explanation).toBe('A square is never negative, so$x ^ { 2 } \\geq 0$.');
    expect(write.data).not.toHaveProperty('reviewNotes');
  });

  it('gives a multiple-choice case-study part its own part of the solution and its printed answer', async () => {
    const casePage = String.raw`1. Read the following and answer any four questions from (i) to (v).
A hall has perimeter$P$.
(i) The relation between the length and breadth is
(a)$x = P$(b)$y = P$(c)$2 ( x + y ) = P$(d)$x y = P$(ii) The area as a function of$x$is
(a)$P$(b)$x$(c)$y$(d)$x y$Sol. (i) Perimeter$= 2 ( x + y )$. Option (c) is correct.
(ii) Area$= x y$. Option (d) is correct.
2. Next`;
    documentPage.findMany.mockResolvedValue([{ pageNumber: 40, rawText: casePage, rawMarkdown: null }]);
    question.findMany.mockResolvedValue([{ ...draft, id: 'q-ii', type: 'MULTIPLE_CHOICE', options: ['$P$', '$x$', '$y$', '$xy$'], printedNumber: '(ii)', content: 'The area as a function of $x$ is' }]);
    const { POST } = await import('./route');
    const data = await (await POST(post({ apply: true }), { params }) as Response).json();
    expect(data).toMatchObject({ updated: 1, answersFilled: 1 });
    const write = question.update.mock.calls[0][0];
    expect(write.data).toMatchObject({ explanation: 'Area$= x y$. Option (d) is correct.', correctAnswer: 'D' });
    expect(write.data.reviewNotes).toMatch(/Worked solution and answer \(D\) copied/);
  });

  it('on refresh, takes back a solution it copied before and can no longer place, and nothing else', async () => {
    question.findMany.mockResolvedValue([
      { ...draft, id: 'copied', content: 'Define a vector.', tags: ['Solution from page text'] },
      { ...draft, id: 'never-copied', content: 'Define a vector.', tags: [] },
    ]);
    const { POST } = await import('./route');
    const data = await (await POST(post({ apply: true, refresh: true }), { params }) as Response).json();
    expect(data.cleared).toBe(1);
    expect(question.update).toHaveBeenCalledTimes(1);
    const write = question.update.mock.calls[0][0];
    expect(write.where).toEqual({ id: 'copied' });
    expect(write.data).toMatchObject({ explanation: null, tags: ['Questions without Solutions'] });
    expect(write.data.reviewNotes).toMatch(/taken back on re-check/);
  });

  it('leaves a draft alone when its text is not at its number on the page', async () => {
    question.findMany.mockResolvedValue([{ ...draft, content: 'Define a vector. Give two examples.' }]);
    const { POST } = await import('./route');
    const data = await (await POST(post({ apply: true }), { params }) as Response).json();
    expect(data).toMatchObject({ matched: 0, updated: 0, reasons: { question_not_found: 1 } });
    expect(question.update).not.toHaveBeenCalled();
  });
});
