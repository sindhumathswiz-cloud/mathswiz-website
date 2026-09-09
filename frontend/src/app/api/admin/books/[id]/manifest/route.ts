import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * The confirmed chapter manifest for a book: each chapter's page range plus,
 * per question-type section, where its answers live (a separate letter-key
 * block, a separate detailed-solutions block, inline with the questions, or
 * nowhere -- a practice exercise). extract-questions / match-answer-keys /
 * match-detailed-solutions prefer a confirmed manifest over their heuristics;
 * see lib/book-manifest.ts.
 *
 *  - GET  returns the stored manifest (whether or not it's confirmed).
 *  - PUT  upserts an edited manifest and marks every chapter confirmed.
 *  - POST .../manifest/detect proposes one from the OCR'd page text.
 */

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
  solutionsStartPage: true,
  solutionsEndPage: true,
} as const;

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
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          chapterNumber: true,
          name: true,
          orderIndex: true,
          topic: true,
          startPage: true,
          endPage: true,
          manifestConfirmedAt: true,
          manifestConfirmedById: true,
          exercises: { orderBy: { orderIndex: 'asc' }, select: SECTION_SELECT },
        },
      },
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, totalPages: true } },
    },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  return NextResponse.json({
    book: { id: book.id, title: book.title, className: book.className },
    run: book.ingestionRuns[0] ?? null,
    chapters: book.chapters.map((chapter) => ({
      ...chapter,
      sections: chapter.exercises,
      exercises: undefined,
      confirmed: chapter.manifestConfirmedAt != null,
    })),
  });
}

// ---------------------------------------------------------------------------
// PUT — validate + upsert an edited manifest
// ---------------------------------------------------------------------------

interface IncomingSection {
  id?: string;
  sectionType?: string | null;
  code?: string | null;
  title?: string | null;
  startPage?: number | null;
  endPage?: number | null;
  inlineAnswers?: boolean;
  noAnswers?: boolean;
  answerKeyStartPage?: number | null;
  answerKeyEndPage?: number | null;
  solutionsStartPage?: number | null;
  solutionsEndPage?: number | null;
}
interface IncomingChapter {
  id?: string;
  chapterNumber?: string | null;
  name?: string;
  startPage?: number | null;
  endPage?: number | null;
  topic?: string | null;
  sections?: IncomingSection[];
}

const intOrNull = (value: unknown): number | null => (Number.isInteger(value) ? (value as number) : null);
const str = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

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
        // Every sub-range must sit inside the chapter's bounds when both are set.
        if (cs != null && ce != null && a != null && (a < cs || (b ?? a) > ce)) {
          return `A ${label} range in "${chapter.name}" falls outside the chapter's pages.`;
        }
      }
      if (section.noAnswers && (section.inlineAnswers || intOrNull(section.answerKeyStartPage) != null || intOrNull(section.solutionsStartPage) != null)) {
        return `A section in "${chapter.name}" is marked "no answers" but also has an answer range.`;
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
    select: { id: true, ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { totalPages: true } } },
  });
  if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

  const totalPages = book.ingestionRuns[0]?.totalPages ?? null;
  const problem = validate(incoming, totalPages);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const now = new Date();
  const keptChapterIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < incoming.length; index++) {
      const chapter = incoming[index];
      const data = {
        chapterNumber: str(chapter.chapterNumber, 30),
        name: str(chapter.name, 200)!,
        topic: str(chapter.topic, 200),
        startPage: intOrNull(chapter.startPage),
        endPage: intOrNull(chapter.endPage),
        manifestConfirmedAt: now,
        manifestConfirmedById: auth.user.id,
      };
      const saved = await tx.bookChapter.upsert({
        where: { bookId_orderIndex: { bookId: id, orderIndex: index } },
        create: { bookId: id, orderIndex: index, ...data },
        update: data,
      });
      keptChapterIds.push(saved.id);

      const sections = chapter.sections ?? [];
      const keptSectionIds: string[] = [];
      for (let sIndex = 0; sIndex < sections.length; sIndex++) {
        const section = sections[sIndex];
        const sData = {
          code: str(section.code, 30),
          title: str(section.title, 200),
          sectionType: str(section.sectionType, 40),
          startPage: intOrNull(section.startPage),
          endPage: intOrNull(section.endPage),
          inlineAnswers: section.inlineAnswers === true,
          noAnswers: section.noAnswers === true,
          answerKeyStartPage: intOrNull(section.answerKeyStartPage),
          answerKeyEndPage: intOrNull(section.answerKeyEndPage),
          solutionsStartPage: intOrNull(section.solutionsStartPage),
          solutionsEndPage: intOrNull(section.solutionsEndPage),
        };
        const savedSection = await tx.bookExercise.upsert({
          where: { chapterId_orderIndex: { chapterId: saved.id, orderIndex: sIndex } },
          create: { chapterId: saved.id, orderIndex: sIndex, ...sData },
          update: sData,
        });
        keptSectionIds.push(savedSection.id);
      }
      await tx.bookExercise.deleteMany({ where: { chapterId: saved.id, id: { notIn: keptSectionIds.length ? keptSectionIds : ['__none__'] } } });
    }
    await tx.bookChapter.deleteMany({ where: { bookId: id, id: { notIn: keptChapterIds.length ? keptChapterIds : ['__none__'] } } });
  });

  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_MANIFEST_CONFIRMED',
    entityType: 'Book',
    entityId: id,
    metadata: { bookId: id, chapterCount: incoming.length, sectionCount: incoming.reduce((sum, c) => sum + (c.sections?.length ?? 0), 0) },
    ...requestAuditContext(request),
  });

  return NextResponse.json({ success: true, chapterCount: keptChapterIds.length });
}
