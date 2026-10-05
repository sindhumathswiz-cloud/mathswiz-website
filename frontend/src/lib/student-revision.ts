import prisma from './prisma';
import { groupByKind, type RevisionKind } from './revision-content';

/**
 * What a student can revise from: APPROVED revision items of books written for
 * their own class. Used by the student pages directly (server-side), so nothing
 * is shipped in page props to a student who is not entitled to it -- callers
 * check Premium before calling anything here.
 */

export interface RevisionChapterSummary {
  chapterId: string;
  chapterNumber: string | null;
  name: string;
  bookTitle: string;
  total: number;
  byKind: Partial<Record<RevisionKind, number>>;
}

export async function loadRevisionChapters(studentClass: string | null | undefined): Promise<RevisionChapterSummary[]> {
  if (!studentClass) return [];
  const grouped = await prisma.revisionItem.groupBy({
    by: ['chapterId', 'kind'],
    where: { status: 'APPROVED', book: { className: studentClass } },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];
  const chapters = await prisma.bookChapter.findMany({
    where: { id: { in: [...new Set(grouped.map(row => row.chapterId))] } },
    select: { id: true, chapterNumber: true, name: true, startPage: true, book: { select: { title: true } } },
  });
  const summaries = chapters.map((chapter): RevisionChapterSummary & { startPage: number | null } => {
    const rows = grouped.filter(row => row.chapterId === chapter.id);
    return {
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      name: chapter.name,
      bookTitle: chapter.book.title,
      total: rows.reduce((sum, row) => sum + row._count._all, 0),
      byKind: Object.fromEntries(rows.map(row => [row.kind, row._count._all])),
      startPage: chapter.startPage,
    };
  });
  // Book order, not insertion order: chapter 1 before chapter 12.
  return summaries
    .sort((a, b) => a.bookTitle.localeCompare(b.bookTitle) || (a.startPage ?? 1e9) - (b.startPage ?? 1e9))
    .map(({ startPage: _startPage, ...summary }) => summary);
}

export interface RevisionSheetItem { id: string; kind: RevisionKind; title: string; body: string; sourcePage: number; inFlashcards: boolean }

export interface RevisionSheet {
  chapter: { id: string; name: string; chapterNumber: string | null; bookTitle: string };
  groups: Array<{ kind: RevisionKind; label: string; items: RevisionSheetItem[] }>;
  total: number;
  inFlashcards: number;
}

/** Null when the chapter has nothing approved, or belongs to a book for another class. */
export async function loadRevisionSheet(chapterId: string, studentId: string, studentClass: string | null | undefined): Promise<RevisionSheet | null> {
  if (!studentClass) return null;
  const chapter = await prisma.bookChapter.findFirst({
    where: { id: chapterId, book: { className: studentClass } },
    select: { id: true, name: true, chapterNumber: true, book: { select: { title: true } } },
  });
  if (!chapter) return null;
  const items = await prisma.revisionItem.findMany({
    where: { chapterId, status: 'APPROVED' },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, kind: true, title: true, body: true, sourcePage: true },
  });
  if (items.length === 0) return null;
  const saved = await prisma.studentFlashcard.findMany({
    where: { userId: studentId, revisionItemId: { in: items.map(item => item.id) } },
    select: { revisionItemId: true },
  });
  const savedIds = new Set(saved.map(card => card.revisionItemId));
  const withFlag: RevisionSheetItem[] = items.map(item => ({ ...item, inFlashcards: savedIds.has(item.id) }));
  return {
    chapter: { id: chapter.id, name: chapter.name, chapterNumber: chapter.chapterNumber, bookTitle: chapter.book.title },
    groups: groupByKind(withFlag),
    total: items.length,
    inFlashcards: savedIds.size,
  };
}

export interface TestRevisionLink { chapterId: string; name: string; items: number }

/**
 * For each test, the chapters its questions come from that have approved
 * revision content -- what a student should look over before attempting it.
 */
export async function revisionChaptersForTests(testIds: string[]): Promise<Map<string, TestRevisionLink[]>> {
  const result = new Map<string, TestRevisionLink[]>();
  if (testIds.length === 0) return result;
  const links = await prisma.testQuestion.findMany({
    where: { section: { testId: { in: testIds } }, question: { bookChapterId: { not: null } } },
    select: { section: { select: { testId: true } }, question: { select: { bookChapterId: true } } },
  });
  const chapterIds = [...new Set(links.map(link => link.question.bookChapterId).filter((id): id is string => Boolean(id)))];
  if (chapterIds.length === 0) return result;
  const [counts, chapters] = await Promise.all([
    prisma.revisionItem.groupBy({ by: ['chapterId'], where: { status: 'APPROVED', chapterId: { in: chapterIds } }, _count: { _all: true } }),
    prisma.bookChapter.findMany({ where: { id: { in: chapterIds } }, select: { id: true, name: true } }),
  ]);
  const itemCount = new Map(counts.map(row => [row.chapterId, row._count._all]));
  const chapterName = new Map(chapters.map(chapter => [chapter.id, chapter.name]));

  // How many of a test's questions come from each chapter decides the order: the heaviest chapter first.
  const weight = new Map<string, Map<string, number>>();
  for (const link of links) {
    const chapterId = link.question.bookChapterId;
    if (!chapterId || !itemCount.has(chapterId)) continue;
    const perTest = weight.get(link.section.testId) ?? new Map<string, number>();
    perTest.set(chapterId, (perTest.get(chapterId) ?? 0) + 1);
    weight.set(link.section.testId, perTest);
  }
  for (const [testId, perTest] of weight) {
    result.set(testId, [...perTest.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([chapterId]) => ({ chapterId, name: chapterName.get(chapterId) ?? 'Chapter', items: itemCount.get(chapterId) ?? 0 })));
  }
  return result;
}

/** Adds `revisionChapters` to each assigned test so the card can say what to revise first. */
export async function withRevisionLinks<T extends { test?: { id?: string | null } | null }>(assignments: T[]): Promise<Array<T & { revisionChapters: TestRevisionLink[] }>> {
  const testIds = [...new Set(assignments.map(assignment => assignment.test?.id).filter((id): id is string => Boolean(id)))];
  const links = await revisionChaptersForTests(testIds).catch(() => new Map<string, TestRevisionLink[]>());
  return assignments.map(assignment => ({ ...assignment, revisionChapters: (assignment.test?.id && links.get(assignment.test.id)) || [] }));
}
