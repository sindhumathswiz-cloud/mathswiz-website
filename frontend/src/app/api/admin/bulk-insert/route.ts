import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        const userId = (session.user as any).id;

        if (role !== 'ADMIN' && role !== 'TEACHER') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();

        if (!Array.isArray(body)) {
            return NextResponse.json({ error: "Expected a JSON array of questions" }, { status: 400 });
        }

        const scope = role === 'TEACHER' ? 'TEACHER_PRIVATE' : 'PUBLIC';

        const result = await prisma.question.createMany({
            data: body.map(q => ({
                content: q.content,
                options: q.options || null,
                correctAnswer: q.correctAnswer || null,
                explanation: q.explanation || null,
                type: q.type || 'SINGLE_CHOICE',
                difficulty: q.difficulty || 'MEDIUM',
                subject: q.subject || null,
                class: q.class || null,
                examType: q.examType || null,
                topic: q.topic || null,
                subTopic: q.subTopic || null,
                tags: Array.isArray(q.tags) ? q.tags : [],
                createdById: userId,
                scope,
                status: role === 'TEACHER' ? 'DRAFT' : 'PENDING_REVIEW'
            })),
            skipDuplicates: true
        });

        return NextResponse.json({ success: true, count: result.count, scope });
    } catch (error: any) {
        console.error("[bulk-insert] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
