import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // @ts-ignore: Prisma client types not yet refreshed for new relations
    const tests = await prisma.test.findMany({
      where: session.user.role === "ADMIN" ? {} : { createdById: session.user.id },
      orderBy: { createdAt: 'desc' },
      // @ts-ignore
      include: {
        sections: {
          include: {
            _count: { select: { questions: true } },
          },
        },
        _count: { select: { sections: true } },
      },
    });

    const formatted = tests.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      mode: t.mode,
      duration: t.duration,
      totalMarks: t.totalMarks,
      isPublished: t.isPublished,
      createdAt: t.createdAt,
      sectionCount: t._count.sections,
      questionCount: t.sections.reduce((sum: number, s: any) => sum + s._count.questions, 0),
    }));

    return NextResponse.json({ tests: formatted });
  } catch (error: any) {
    console.error('[GET /api/teacher/tests/list]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

