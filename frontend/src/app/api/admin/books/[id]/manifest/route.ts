import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { matchSections } from '@/lib/manifest-sections';
import { exerciseForPage } from '@/lib/exercise-link';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The chapter manifest for a book: each chapter's PDF + printed page range
 * plus, per question-type section, where its answers live (a separate
 * letter-key block, a separate detailed-solutions block, inline with the
 * questions, or nowhere -- a practice exercise) and how much of the section a
 * separate block covers. extract-questions / match-answer-keys /
 * match-detailed-solutions prefer a confirmed manifest over their heuristics.
 *
 *  - GET  returns the stored manifest (managed chapters only).
 *  - PUT  upserts an edited manifest; confirmation is PER CHAPTER.
 *  - POST .../manifest/detect proposes one from the OCR'd page text + the TOC.
 *  - POST .../manifest/refile re-files existing questions by the confirmed ranges.
 */

// orderIndex >= UNMANAGED_ORDER_BASE is a chapter parked out of the manifest
// (e.g. a stale LLM topic-guess chapter that still owns questions). GET hides
// them; they keep their question links until "Re-file" empties them.
const UNMANAGED_ORDER_BASE = 900;

const SECTION_SELECT = {
  id: true,
  code: true,
  title: true,
  sectionType: true,
  orderIndex: true,
  startPage: true,
  endPage: true,
  inlineAnswers: true,
  noAnswers: true,
  answerKeyStartPage: true,
  answerKeyEndPage: true,
  answerKeyCoverage: true,
  solutionsStartPage: true,
  solutionsEndPage: true,
  solutionCoverage: true,
} as const;

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      className: true,
      chapters: {
        where: { orderIndex: { lt: UNMANAGED_ORDER_BASE } },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          chapterNumber: true,
          name: true,
          orderIndex: true,
          topic: true,
          startPage: true,
          endPage: true,
          printedStartPage: true,
          printedEndPage: true,
          manifestConfirmedAt: true,
          exercises: { orderBy: { orderIndex: 'asc' }, select: SECTION_SELECT },
        },
      },
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, totalPages: true } },
    },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  // How many of this book's questions currently sit in each chapter's PDF
  // page range -- so the editor can show extraction progress per chapter.
  const ranged = book.chapters.filter((c) => c.startPage != null && c.endPage != null);
  const counts = await Promise.all(ranged.map((c) =>
    prisma.question.count({ where: { bookId: id, sourcePageStart: { gte: c.startPage as number, lte: c.endPage as number } } }),
  ));
  const countByChapter = new Map(ranged.map((c, i) => [c.id, counts[i]]));

  return NextResponse.json({
    book: { id: book.id, title: book.title, className: book.className },
    run: book.ingestionRuns[0] ?? null,
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      sections: chapter.exercises,
      exercises: undefined,
      confirmed: chapter.manifestConfirmedAt != null,
      questionsInRange: countByChapter.get(chapter.id) ?? 0,
    })),
  });
}

// ---------------------------------------------------------------------------
// PUT — validate + upsert an edited manifest, per-chapter confirm
// ---------------------------------------------------------------------------

interface IncomingSection {
  sectionType?: string | null;
  code?: string | null;
  title?: string | null;
  startPage?: number | null;
  endPage?: number | null;
  inlineAnswers?: boolean;
  noAnswers?: boolean;
  answerKeyStartPage?: number | null;
  answerKeyEndPage?: number | null;
  answerKeyCoverage?: string | null;
  solutionsStartPage?: number | null;
  solutionsEndPage?: number | null;
  solutionCoverage?: string | null;
}
interface IncomingChapter {
  id?: string;
  chapterNumber?: string | null;
  name?: string;
  startPage?: number | null;
  endPage?: number | null;
  printedStartPage?: number | null;
  printedEndPage?: number | null;
  topic?: string | null;
  confirmed?: boolean;
  sections?: IncomingSection[];
}

const intOrNull = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);
const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const ANSWER_KEY_COVERAGE = new Set(['ALL', 'SELECTED']);
const SOLUTION_COVERAGE = new Set(['ALL', 'SELECTED', 'HINTS']);
const coverage = (value: unknown, allowed: Set<string>): string | null => {
  const v = typeof value === 'string' ? value.toUpperCase() : '';
  return allowed.has(v) ? v : null;
};

function validate(chapters: IncomingChapter[], totalPages: number | null): string | null {
  const cap = totalPages && totalPages > 0 ? totalPages : Number.MAX_SAFE_INTEGER;
  const inBook = (p: number | null) => p == null || (p >= 1 && p <= cap);
  const ordered: Array<{ start: number; end: number; name: string }> = [];

  for (const chapter of chapters) {
    if (!str(chapter.name, 200)) return 'Every chapter needs a name.';
    const cs = intOrNull(chapter.startPage);
    const ce = intOrNull(chapter.endPage);
    if (!inBook(cs) || !inBook(ce)) return `Chapter "${chapter.name}" has a page outside 1..${cap}.`;
    if (cs != null && ce != null && cs > ce) return `Chapter "${chapter.name}" ends before it starts.`;
    const ps = intOrNull(chapter.printedStartPage);
    const pe = intOrNull(chapter.printedEndPage);
    if (ps != null && pe != null && ps > pe) return `Chapter "${chapter.name}" printed pages end before they start.`;
    if (cs != null && ce != null) ordered.push({ start: cs, end: ce, name: chapter.name || '' });

    for (const section of chapter.sections ?? []) {
      const ss = intOrNull(section.startPage);
      const se = intOrNull(section.endPage);
      const ranges: Array<[number | null, number | null, string]> = [
        [ss, se, 'question'],
        [intOrNull(section.answerKeyStartPage), intOrNull(section.answerKeyEndPage), 'answer-key'],
        [intOrNull(section.solutionsStartPage), intOrNull(section.solutionsEndPage), 'solutions'],
      ];
      for (const [a, b, label] of ranges) {
        if (!inBook(a) || !inBook(b)) return `A ${label} range in "${chapter.name}" is outside 1..${cap}.`;
        if (a != null && b != null && a > b) return `A ${label} range in "${chapter.name}" ends before it starts.`;
        if (cs != null && ce != null && a != null && (a < cs || (b ?? a) > ce)) {
          return `A ${label} range in "${chapter.name}" falls outside the chapter's pages.`;
        }
      }
      if (section.noAnswers && (section.inlineAnswers || intOrNull(section.answerKeyStartPage) != null || intOrNull(section.solutionsStartPage) != null)) {
        return `A section in "${chapter.name}" is marked "no answers" but also has an answer range.`;
      }
      if (section.answerKeyCoverage && !ANSWER_KEY_COVERAGE.has(String(section.answerKeyCoverage).toUpperCase())) {
        return `A section in "${chapter.name}" has an invalid answer-key coverage.`;
      }
      if (section.solutionCoverage && !SOLUTION_COVERAGE.has(String(section.solutionCoverage).toUpperCase())) {
        return `A section in "${chapter.name}" has an invalid solution coverage.`;
      }
    }
  }

  ordered.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start <= ordered[i - 1].end) {
      return `Chapters "${ordered[i - 1].name}" and "${ordered[i].name}" overlap.`;
    }
  }
  return null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.chapters)) {
    return NextResponse.json({ error: 'A chapters array is required.' }, { status: 400 });
  }
  const incoming: IncomingChapter[] = body.chapters.slice(0, 100);

  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true,
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalPages: true } },
    },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const totalPages = book.ingestionRuns[0]?.totalPages ?? null;
  const problem = validate(incoming, totalPages);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const now = new Date();
  let confirmedCount = 0;
  let relinkedCount = 0;

  const existing = await prisma.bookChapter.findMany({
    where: { bookId: id },
    orderBy: { orderIndex: 'asc' },
    select: { id: true, name: true, orderIndex: true, manifestConfirmedAt: true, manifestConfirmedById: true, _count: { select: { questions: true } } },
  });
  const byId = new Map(existing.map((c) => [c.id, c]));
  const byName = new Map(existing.map((c) => [normalize(c.name), c]));

  // Resolve each incoming chapter to an existing row (reuse its id so linked
  // questions stay linked): explicit id first, then name match.
  const resolved = incoming.map((chapter) => {
    const target = (chapter.id && byId.get(chapter.id)) || byName.get(normalize(chapter.name || ''));
    return { chapter, targetId: target?.id ?? null };
  });
  const keptTargetIds = new Set(resolved.map((r) => r.targetId).filter(Boolean) as string[]);
  const prunableIds = existing
    .filter((c) => !keptTargetIds.has(c.id) && c._count.questions === 0 && c.manifestConfirmedAt == null)
    .map((c) => c.id);
  const leftoverIds = existing
    .filter((c) => !keptTargetIds.has(c.id) && !prunableIds.includes(c.id))
    .map((c) => c.id);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Park every surviving existing chapter at a unique negative orderIndex in
    // ONE statement so the rewrite below can't collide on @@unique([bookId,
    // orderIndex]); the whole PUT stays a handful of round-trips.
    await tx.$executeRaw`UPDATE "BookChapter" SET "orderIndex" = -1 - "orderIndex" WHERE "bookId" = ${id} AND "orderIndex" >= 0`;
    if (prunableIds.length) await tx.bookChapter.deleteMany({ where: { id: { in: prunableIds } } });

    for (let index = 0; index < resolved.length; index++) {
      const { chapter, targetId } = resolved[index];
      const isConfirmed = chapter.confirmed === true;
      if (isConfirmed) confirmedCount++;
      // Saving a chapter that was already confirmed keeps when and by whom it was confirmed.
      const earlier = targetId ? byId.get(targetId) : undefined;
      const keepConfirmation = isConfirmed && earlier?.manifestConfirmedAt != null;
      const data = {
        chapterNumber: str(chapter.chapterNumber, 30),
        name: str(chapter.name, 200)!,
        topic: str(chapter.topic, 200),
        startPage: intOrNull(chapter.startPage),
        endPage: intOrNull(chapter.endPage),
        printedStartPage: intOrNull(chapter.printedStartPage),
        printedEndPage: intOrNull(chapter.printedEndPage),
        manifestConfirmedAt: keepConfirmation ? earlier!.manifestConfirmedAt : isConfirmed ? now : null,
        manifestConfirmedById: keepConfirmation ? earlier!.manifestConfirmedById : isConfirmed ? auth.user.id : null,
      };
      const chapterId = targetId
        ? (await tx.bookChapter.update({ where: { id: targetId }, data: { orderIndex: index, ...data } })).id
        : (await tx.bookChapter.create({ data: { bookId: id, orderIndex: index, ...data } })).id;

      // Sections: update in place where one already exists (lib/manifest-sections), so questions filed under it and
      // Smartbook links keep its id; create the new ones; delete only the ones no longer there. Survivors are parked
      // at negative positions first so the rewrite can't collide on @@unique([chapterId, orderIndex]).
      const sections = chapter.sections ?? [];
      const existingSections = await tx.bookExercise.findMany({ where: { chapterId }, select: { id: true, sectionType: true, startPage: true } });
      const { ids: sectionIds, removed } = matchSections(existingSections, sections.map((s) => ({ sectionType: str(s.sectionType, 40), startPage: intOrNull(s.startPage) })));
      if (removed.length) await tx.bookExercise.deleteMany({ where: { id: { in: removed } } });
      await tx.$executeRaw`UPDATE "BookExercise" SET "orderIndex" = -1 - "orderIndex" WHERE "chapterId" = ${chapterId} AND "orderIndex" >= 0`;
      const saved: Array<{ id: string; sectionType: string | null; startPage: number | null; endPage: number | null }> = [];
      for (let sIndex = 0; sIndex < sections.length; sIndex++) {
        const section = sections[sIndex];
        const hasKey = intOrNull(section.answerKeyStartPage) != null;
        const hasSol = intOrNull(section.solutionsStartPage) != null;
        const sectionData = {
          orderIndex: sIndex,
          code: str(section.code, 30),
          title: str(section.title, 200),
          sectionType: str(section.sectionType, 40),
          startPage: intOrNull(section.startPage),
          endPage: intOrNull(section.endPage),
          inlineAnswers: section.inlineAnswers === true,
          noAnswers: section.noAnswers === true,
          answerKeyStartPage: intOrNull(section.answerKeyStartPage),
          answerKeyEndPage: intOrNull(section.answerKeyEndPage),
          answerKeyCoverage: hasKey ? (coverage(section.answerKeyCoverage, ANSWER_KEY_COVERAGE) ?? 'ALL') : null,
          solutionsStartPage: intOrNull(section.solutionsStartPage),
          solutionsEndPage: intOrNull(section.solutionsEndPage),
          solutionCoverage: hasSol ? (coverage(section.solutionCoverage, SOLUTION_COVERAGE) ?? 'ALL') : null,
        };
        const sectionId = sectionIds[sIndex]
          ? (await tx.bookExercise.update({ where: { id: sectionIds[sIndex]! }, data: sectionData })).id
          : (await tx.bookExercise.create({ data: { chapterId, ...sectionData } })).id;
        saved.push({ id: sectionId, sectionType: sectionData.sectionType, startPage: sectionData.startPage, endPage: sectionData.endPage });
      }

      // A confirmed chapter's questions are filed under the one section their first page falls in (lib/exercise-link),
      // as extraction does for new ones.
      if (isConfirmed) {
        const filed = await tx.question.findMany({ where: { bookChapterId: chapterId }, select: { id: true, sourcePageStart: true, bookExerciseId: true } });
        const moves = new Map<string | null, string[]>();
        for (const question of filed) {
          const target = exerciseForPage(saved, question.sourcePageStart);
          if (target === question.bookExerciseId) continue;
          moves.set(target, [...(moves.get(target) ?? []), question.id]);
        }
        for (const [target, questionIds] of moves) {
          await tx.question.updateMany({ where: { id: { in: questionIds } }, data: { bookExerciseId: target } });
          relinkedCount += questionIds.length;
        }
      }
    }

    // Leftover chapters that own questions: shift them out of the managed
    // range in one statement rather than deleting.
    if (leftoverIds.length) {
      await tx.$executeRaw`UPDATE "BookChapter" SET "orderIndex" = ${UNMANAGED_ORDER_BASE} - "orderIndex" WHERE "bookId" = ${id} AND "orderIndex" < 0`;
    }
  }, { timeout: 90000, maxWait: 10000 });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_MANIFEST_SAVED',
    entityType: 'Book',
    entityId: id,
    metadata: { bookId: id, chapterCount: incoming.length, confirmedCount, relinkedCount, sectionCount: incoming.reduce((sum, c) => sum + (c.sections?.length ?? 0), 0) },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ success: true, chapterCount: incoming.length, confirmedCount, relinkedCount });
}
