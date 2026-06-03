import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const subject = searchParams.get("subject");
        const classLevel = searchParams.get("class");
        const topic = searchParams.get("topic");
        const subTopic = searchParams.get("subTopic");
        const examType = searchParams.get("examType");
        const difficulty = searchParams.get("difficulty");
        const type = searchParams.get("type");
        const scope = searchParams.get("scope");

        const session = await getServerSession(authOptions);

        const filter: any = {};
        if (status) filter.status = status;
        if (subject) filter.subject = subject;
        if (classLevel) filter.class = classLevel;
        if (topic) filter.topic = topic;
        if (subTopic) filter.subTopic = subTopic;
        if (examType) filter.examType = examType;
        if (difficulty) filter.difficulty = difficulty;
        if (type) filter.type = type;

        // Scope filtering: teachers see their private questions + public, admin sees all
        if (session?.user) {
            const role = (session.user as any).role;
            const userId = (session.user as any).id;
            if (role === 'ADMIN') {
                // Admin sees all
            } else if (role === 'TEACHER') {
                // Teachers see PUBLIC + their own TEACHER_PRIVATE
                filter.OR = [
                    { scope: 'PUBLIC' },
                    { scope: 'TEACHER_PRIVATE', createdById: userId }
                ];
            } else {
                // Students only see APPROVED public questions
                filter.status = 'APPROVED';
                filter.scope = 'PUBLIC';
            }
        } else {
            // Unauthenticated users only see APPROVED public questions
            filter.status = 'APPROVED';
            filter.scope = 'PUBLIC';
        }

        const questions = await prisma.question.findMany({
            where: filter,
            include: {
                createdBy: {
                    select: {
                        firstName: true,
                        lastName: true,
                        role: true,
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        return NextResponse.json({ questions });
    } catch (error) {
        console.error("Failed to fetch questions:", error);
        return NextResponse.json({ error: "Failed to fetch questions" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        const userId = (session.user as any).id;

        // Only ADMIN can populate the main question bank
        // Teachers can add questions but they go to TEACHER_PRIVATE scope
        if (role !== 'ADMIN' && role !== 'TEACHER') {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const questions = Array.isArray(body) ? body : [body];

        const mapType = (type: string): "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "INTEGER" | "TRUE_FALSE" | "SUBJECTIVE" => {
            if (!type) return "SINGLE_CHOICE";
            const t = type.toUpperCase().replace(/\s+/g, '_');
            if (t.includes("MULTIPLE")) return "MULTIPLE_CHOICE";
            if (t.includes("SUBJECTIVE")) return "SUBJECTIVE";
            if (t.includes("TRUE")) return "TRUE_FALSE";
            if (t.includes("INTEGER")) return "INTEGER";
            return "SINGLE_CHOICE";
        };

        const mapDifficulty = (diff: string): "EASY" | "MEDIUM" | "HARD" => {
            if (!diff) return "MEDIUM";
            const d = diff.toUpperCase();
            return ["EASY", "MEDIUM", "HARD"].includes(d) ? d as "EASY" | "MEDIUM" | "HARD" : "MEDIUM";
        };

        const scope = role === 'ADMIN' ? 'PUBLIC' : 'TEACHER_PRIVATE';

        const created = await prisma.$transaction(async (tx) => {
            const results: any[] = [];
            for (const q of questions) {
                const question = await tx.question.create({
                    data: {
                        content: q.content,
                        options: q.options || [],
                        correctAnswer: q.correctAnswer || "",
                        explanation: q.explanation || "",
                        tags: Array.isArray(q.tags) ? q.tags : [],
                        type: mapType(q.type),
                        difficulty: mapDifficulty(q.difficulty),
                        subject: q.subject || "Mathematics",
                        class: q.class || "Class 12",
                        scope,
                        status: role === 'ADMIN' ? (q.status || "APPROVED") : "PENDING_REVIEW",
                        createdById: userId
                    }
                });
                if (q.tagTaxonomyId) {
                    await tx.questionTag.create({
                        data: { questionId: question.id, tagId: q.tagTaxonomyId }
                    });
                }
                results.push(question);
            }
            return results;
        });

        return NextResponse.json({ success: true, count: created.length, scope });
    } catch (error: any) {
        console.error("Database Insert Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

