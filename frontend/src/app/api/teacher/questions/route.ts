import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'TEACHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const topic = searchParams.get('topic');
    const difficulty = searchParams.get('difficulty');
    const type = searchParams.get('type');
    const scope = searchParams.get('scope'); // 'all', 'private', 'submitted'

    const userId = (session.user as any).id;

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

    const questions = await prisma.question.findMany({
      where,
      include: {
        solution: { select: { content: true, isVerified: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ questions });
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
    if (!session || (session.user as any).role !== 'TEACHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
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
