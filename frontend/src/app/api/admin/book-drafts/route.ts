import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { DRAFT_RETENTION_DAYS, daysUntilExpiry } from '@/lib/draft-retention';

export const runtime = 'nodejs';

/**
 * Every book's extracted-page draft, with the name of the book and how long it
 * has left. Drafts that have passed their expiry but not yet been swept are
 * flagged `expired` so the admin can see them before they are purged.
 */
export async function GET() {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const runs = await prisma.bookIngestionRun.findMany({
    where: { sourceDocumentId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, bookId: true, fileName: true, totalPages: true, processedPages: true, status: true,
      draftExpiresAt: true, draftPurgedAt: true, createdAt: true,
      book: { select: { title: true, className: true } },
    },
  });

  // Questions still waiting on a human are the reason to look at the source
  // pages again, so the list shows how many would lose their page images.
  const awaitingReview = await prisma.question.groupBy({
    by: ['bookId'],
    where: { bookId: { in: [...new Set(runs.map(run => run.bookId))] }, status: { in: ['DRAFT', 'PENDING_REVIEW', 'REPORTED'] } },
    _count: { _all: true },
  });
  const awaitingByBook = new Map(awaitingReview.map(row => [row.bookId, row._count._all]));

  const now = new Date();
  return NextResponse.json({
    retentionDays: DRAFT_RETENTION_DAYS,
    drafts: runs.map(run => {
      const purged = Boolean(run.draftPurgedAt);
      const expired = !purged && Boolean(run.draftExpiresAt && run.draftExpiresAt <= now);
      return {
        runId: run.id,
        bookId: run.bookId,
        bookTitle: run.book.title,
        className: run.book.className,
        fileName: run.fileName,
        pdfPages: run.totalPages,
        pagesExtracted: run.processedPages,
        status: run.status,
        createdAt: run.createdAt,
        expiresAt: run.draftExpiresAt,
        purgedAt: run.draftPurgedAt,
        expired,
        daysRemaining: run.draftExpiresAt && !purged ? daysUntilExpiry(run.draftExpiresAt, now) : null,
        questionsAwaitingReview: run.bookId ? awaitingByBook.get(run.bookId) ?? 0 : 0,
      };
    }),
  });
}
