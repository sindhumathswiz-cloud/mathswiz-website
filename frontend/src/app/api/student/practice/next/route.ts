import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic');
    const difficulty = searchParams.get('difficulty');

    // Fetch a question appropriately
    const where: any = { status: 'APPROVED' };
    if (topic) where.topic = topic;
    if (difficulty) where.difficulty = difficulty;

    const count = await prisma.question.count({ where });
    if (count === 0) return NextResponse.json({ error: 'No questions found' }, { status: 404 });

    const randomOffset = Math.floor(Math.random() * count);
    const question = await prisma.question.findFirst({
      where,
      skip: randomOffset,
      include: { createdBy: { select: { firstName: true, lastName: true } } }
    });

    return NextResponse.json({ question });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

