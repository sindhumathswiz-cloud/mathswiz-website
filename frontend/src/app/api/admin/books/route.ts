import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';

function optionalText(value: unknown, max = 200): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export async function GET(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const query = optionalText(params.get('query'), 100);
  const className = optionalText(params.get('className'), 50);
  const books = await prisma.book.findMany({
    where: {
      isActive: true,
      ...(className ? { className } : {}),
      ...(query ? {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { author: { contains: query, mode: 'insensitive' } },
          { publisher: { contains: query, mode: 'insensitive' } },
          { isbn: { contains: query, mode: 'insensitive' } },
        ],
      } : {}),
    },
    include: {
      _count: { select: { chapters: true, questions: true, ingestionRuns: true } },
      ingestionRuns: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, stage: true, progress: true, totalPages: true, processedPages: true, extractedQuestions: true, reviewRequired: true, providerConfig: true, updatedAt: true } },
    },
    orderBy: [{ className: 'asc' }, { title: 'asc' }, { edition: 'asc' }],
  });
  return NextResponse.json({ books });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const title = optionalText(body.title);
  const className = optionalText(body.className, 50);
  if (!title || !className || !['Class 11', 'Class 12'].includes(className)) {
    return NextResponse.json({ error: 'Title and Class 11 or Class 12 are required' }, { status: 400 });
  }
  const edition = optionalText(body.edition, 100);
  const publisher = optionalText(body.publisher);
  const existing = await prisma.book.findFirst({
    where: { title: { equals: title, mode: 'insensitive' }, className, edition, publisher },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: 'This book edition is already registered', bookId: existing.id }, { status: 409 });

  const publicationYear = body.publicationYear == null || body.publicationYear === '' ? null : Number(body.publicationYear);
  if (publicationYear !== null && (!Number.isInteger(publicationYear) || publicationYear < 1900 || publicationYear > new Date().getFullYear() + 1)) {
    return NextResponse.json({ error: 'Invalid publication year' }, { status: 400 });
  }
  const book = await prisma.book.create({
    data: {
      title,
      className,
      subject: optionalText(body.subject, 100) || 'Mathematics',
      author: optionalText(body.author),
      publisher,
      edition,
      publicationYear,
      isbn: optionalText(body.isbn, 30),
      board: optionalText(body.board, 100),
      language: optionalText(body.language, 50) || 'English',
      description: optionalText(body.description, 5000),
      createdById: auth.user.id,
    },
  });
  await recordAuditLog({
    actorId: auth.user.id,
    actorRole: 'ADMIN',
    action: 'BOOK_REGISTERED',
    entityType: 'Book',
    entityId: book.id,
    metadata: { title, className, edition, publisher },
    ...requestAuditContext(request),
  });
  return NextResponse.json({ book }, { status: 201 });
}
