import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requirePremiumTeacher } from "@/lib/teacher-api-guard";
import { findExamPattern } from "@/lib/exam-patterns";
import { sanitizeChoiceGroups, slotCountOf } from "@/lib/choice-groups";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const guard = await requirePremiumTeacher(session);
    if (!guard.ok) return guard.response;
    const userId = guard.userId;
    const body = await request.json();
    const { title, description, mode, duration, totalMarks, isPublished, sections, templateType, examPattern } = body;
    const allowedTemplateTypes = ['WORKSHEET', 'REVISION_PACK', 'MOCK_EXAM', 'HOMEWORK_TEMPLATE'];

    // @ts-ignore: Prisma client type cache may not reflect recent db push
    const test = await prisma.test.create({
      data: {
        title,
        description,
        mode: mode || 'STRICT',
        duration: parseInt(duration) || 60,
        totalMarks: parseFloat(totalMarks) || 0,
        isPublished: isPublished || false,
        templateType: allowedTemplateTypes.includes(templateType) ? templateType : null,
        // Only a pattern we know: the id is shown to students and must mean something.
        examPattern: findExamPattern(examPattern) ? examPattern : null,
        createdById: userId,
        sections: {
          create: sections.map((sect: any) => {
            // Internal choice: alternatives share a label; only well-formed runs of two or more survive.
            const questions = sanitizeChoiceGroups<{ id: string; choiceGroup?: string | null }>(
              (sect.questions ?? []).map((q: any) => ({ id: q.id, choiceGroup: q.choiceGroup })),
            );
            return {
              title: sect.title,
              instructions: sect.instructions,
              marksPerQuestion: parseFloat(sect.marksPerQuestion) || 4.0,
              // 0 is a real choice (no negative marking), so only a missing value falls back to 1.
              negativeMarks: Number.isFinite(parseFloat(sect.negativeMarks)) ? Math.max(0, parseFloat(sect.negativeMarks)) : 1.0,
              // "Attempt any N": a positive whole number, never more than the section's question slots.
              attemptLimit: Number.isInteger(sect.attemptLimit) && sect.attemptLimit > 0 && sect.attemptLimit <= slotCountOf(questions) ? sect.attemptLimit : null,
              questions: {
                create: questions.map((q, index) => ({
                  questionId: q.id,
                  orderIndex: index,
                  choiceGroup: q.choiceGroup ?? null,
                })),
              },
            };
          }),
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

