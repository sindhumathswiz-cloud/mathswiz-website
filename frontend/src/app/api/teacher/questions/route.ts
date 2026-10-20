import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPremiumSubscription } from '@/lib/subscription';
import { resolveSourceClauses } from '@/lib/question-sources';

export const dynamic = 'force-dynamic';

const DEFAULT_QUESTION_LIMIT = 100;
const MAX_QUESTION_LIMIT = 500;

async function requirePremiumTeacherStrict(session: any) {
  if (!session || (session.user as any).role !== 'TEACHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: (session.user as any).id }, select: { subscription: true } });
  if (!isPremiumSubscription(user?.subscription)) {
    return NextResponse.json({ error: 'This feature requires a premium subscription.' }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = await requirePremiumTeacherStrict(session);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const topic = searchParams.get('topic');
    const difficulty = searchParams.get('difficulty');
    const type = searchParams.get('type');
    const scope = searchParams.get('scope'); // 'all', 'private', 'submitted'

    const userId = (session!.user as any).id;

    const where: any = {};

    // Scope filtering
    if (scope === 'private') {
      where.scope = 'TEACHER_PRIVATE';
      where.createdById = userId;
    } else if (scope === 'submitted') {
      where.status = 'PENDING_REVIEW';
      where.createdById = userId;
    } else {
      // Default: approved questions (public + teacher's own)
      where.OR = [
        { status: 'APPROVED', scope: 'PUBLIC' },
        { createdById: userId }
      ];
    }

    if (subject && subject !== 'All') where.subject = subject;
    if (topic && topic !== 'All') where.topic = topic;
    if (difficulty && difficulty !== 'All') where.difficulty = difficulty;
    if (type && type !== 'All') where.type = type;

    // Book -> chapter -> exercise selector. AND-ed, because the scope filter above
    // already uses OR.
    const sourceFilter = {
      bookId: searchParams.get('bookId'),
      bookChapterId: searchParams.get('bookChapterId'),
      bookExerciseId: searchParams.get('bookExerciseId'),
    };
    if (sourceFilter.bookId || sourceFilter.bookChapterId || sourceFilter.bookExerciseId) {
      where.AND = await resolveSourceClauses(sourceFilter);
    }

    // A bank of thousands cannot be listed in one response or one page: return a bounded page, newest first,
    // and say when it was cut so the picker can ask the teacher to narrow the filters.
    const requested = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_QUESTION_LIMIT) : DEFAULT_QUESTION_LIMIT;
    const rows = await prisma.question.findMany({
      where,
      include: {
        solution: { select: { content: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const questions = truncated ? rows.slice(0, limit) : rows;

    return NextResponse.json({ questions, truncated, limit });
  } catch (error) {
    console.error('[GET /api/teacher/questions]', error);
    return NextResponse.json(
      { error: 'Failed to fetch questions' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const denied = await requirePremiumTeacherStrict(session);
    if (denied) return denied;

    const userId = (session!.user as any).id;
    const body = await req.json();
    const questions = Array.isArray(body) ? body : [body];

    const mapType = (type: string) => {
      if (!type) return 'SINGLE_CHOICE';
      const t = type.toUpperCase().replace(/\s+/g, '_');
      if (t.includes('MULTIPLE')) return 'MULTIPLE_CHOICE';
      if (t.includes('SUBJECTIVE')) return 'SUBJECTIVE';
      if (t.includes('TRUE')) return 'TRUE_FALSE';
      if (t.includes('INTEGER')) return 'INTEGER';
      return 'SINGLE_CHOICE';
    };

    const mapDifficulty = (diff: string): "EASY" | "MEDIUM" | "HARD" => {
      if (!diff) return 'MEDIUM';
      const d = diff.toUpperCase();
      return (['EASY', 'MEDIUM', 'HARD'].includes(d) ? d : 'MEDIUM') as "EASY" | "MEDIUM" | "HARD";
    };

    const created = await prisma.$transaction(
      questions.map((q: any) => prisma.question.create({
        data: {
          content: q.content,
          options: q.options || [],
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || '',
          tags: Array.isArray(q.tags) ? q.tags : [],
          type: mapType(q.type),
          difficulty: mapDifficulty(q.difficulty),
          subject: q.subject || 'Mathematics',
          class: q.class || 'Class 12',
          topic: q.topic || null,
          subTopic: q.subTopic || null,
          scope: 'TEACHER_PRIVATE',
          status: 'DRAFT',
          createdById: userId
        }
      }))
    );

    return NextResponse.json({ success: true, count: created.length, scope: 'TEACHER_PRIVATE' });
  } catch (error: any) {
    console.error('Failed to create teacher question:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
