import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await request.json();
    const { title, description, mode, duration, totalMarks, isPublished, sections } = body;

    // @ts-ignore: Prisma client type cache may not reflect recent db push
    const test = await prisma.test.create({
      data: {
        title,
        description,
        mode: mode || 'STRICT',
        duration: parseInt(duration) || 60,
        totalMarks: parseFloat(totalMarks) || 0,
        isPublished: isPublished || false,
        createdById: userId, 
        sections: {
          create: sections.map((sect: any) => ({
            title: sect.title,
            instructions: sect.instructions,
            marksPerQuestion: parseFloat(sect.marksPerQuestion) || 4.0,
            negativeMarks: parseFloat(sect.negativeMarks) || 1.0,
            questions: {
              create: sect.questions.map((q: any, index: number) => ({
                questionId: q.id, 
                orderIndex: index,
              })),
            },
          })),
        },
      },
      include: {
        sections: {
          include: {
            questions: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, test });
  } catch (error: any) {
    console.error('[POST /api/teacher/tests]', error);
    return NextResponse.json({ error: error.message || 'Failed to save test' }, { status: 500 });
  }
}

