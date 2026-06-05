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
                },
                questionTags: {
                    include: {
                        tag: {
                            select: { name: true, type: true }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Merge taxonomy tag names into each question's tags array
        // Also populate topic/subTopic/class/subject from taxonomy types if empty
        const enriched = questions.map(q => {
            const taxonomyNames = q.questionTags
                .map(qt => qt.tag.name)
                .filter(Boolean);
            const taxonomyTagIds = q.questionTags.map(qt => qt.tagId);
            const mergedTags = taxonomyNames.length > 0
                ? [...new Set([...(q.tags || []), ...taxonomyNames])]
                : q.tags;

            // Populate topic/subTopic/class/subject from taxonomy types
            const classTax = q.questionTags.find(qt => qt.tag.type === 'CLASS');
            const subjectTax = q.questionTags.find(qt => qt.tag.type === 'SUBJECT');
            const topicTax = q.questionTags.find(qt => qt.tag.type === 'TOPIC');
            const subTopicTax = q.questionTags.find(qt => qt.tag.type === 'SUBTOPIC');

            const { questionTags, ...rest } = q;
            return {
                ...rest,
                tags: mergedTags,
                taxonomyTagIds,
                class: rest.class || classTax?.tag.name || '',
                subject: rest.subject || subjectTax?.tag.name || '',
                topic: rest.topic || topicTax?.tag.name || '',
                subTopic: rest.subTopic || subTopicTax?.tag.name || '',
            };
        });

        return NextResponse.json({ questions: enriched });
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

        const mapType = (type: string): "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "INTEGER" | "TRUE_FALSE" | "SUBJECTIVE" | "FILL_IN_BLANKS" | "ASSERTION_REASONING" | "CASE_STUDY" | "VERY_SHORT_ANSWER" | "SHORT_ANSWER" | "LONG_ANSWER" => {
            if (!type) return "SINGLE_CHOICE";
            const t = type.toUpperCase().replace(/\s+/g, '_');
            if (t.includes("MULTIPLE")) return "MULTIPLE_CHOICE";
            if (t.includes("SUBJECTIVE")) return "SUBJECTIVE";
            if (t.includes("TRUE")) return "TRUE_FALSE";
            if (t.includes("INTEGER")) return "INTEGER";
            if (t.includes("FILL")) return "FILL_IN_BLANKS";
            if (t.includes("ASSERTION")) return "ASSERTION_REASONING";
            if (t.includes("CASE")) return "CASE_STUDY";
            if (t.includes("VERY_SHORT")) return "VERY_SHORT_ANSWER";
            if (t.includes("SHORT")) return "SHORT_ANSWER";
            if (t.includes("LONG")) return "LONG_ANSWER";
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
                        content: q.content || '',
                        options: q.options || [],
                        correctAnswer: q.correctAnswer || '',
                        explanation: q.explanation || '',
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
                const tagIds: string[] = [];
                if (Array.isArray(q.taxonomyTagIds)) {
                    tagIds.push(...q.taxonomyTagIds);
                } else if (q.tagTaxonomyId) {
                    tagIds.push(q.tagTaxonomyId);
                }
                for (const tid of tagIds) {
                    await tx.questionTag.create({
                        data: { questionId: question.id, tagId: tid }
                    });
                }
                // Merge taxonomy names into tags if we have tagIds
                if (tagIds.length > 0) {
                    const taxonomies = await tx.tagTaxonomy.findMany({
                        where: { id: { in: tagIds } },
                        select: { name: true, type: true }
                    });
                    const taxonomyNames = taxonomies.map(t => t.name).filter(Boolean);
                    const existingTags: string[] = Array.isArray(q.tags) ? q.tags : [];
                    const mergedTags = [...new Set([...existingTags, ...taxonomyNames])];
                    const questionUpdateData: any = {};
                    if (mergedTags.length > existingTags.length) {
                        questionUpdateData.tags = mergedTags;
                    }
                    // Set topic/subTopic/class/subject from taxonomy if not already set
                    const classTax = taxonomies.find(t => t.type === 'CLASS');
                    const subjectTax = taxonomies.find(t => t.type === 'SUBJECT');
                    const topicTax = taxonomies.find(t => t.type === 'TOPIC');
                    const subTopicTax = taxonomies.find(t => t.type === 'SUBTOPIC');
                    if (!q.class && classTax) questionUpdateData.class = classTax.name;
                    if (!q.subject && subjectTax) questionUpdateData.subject = subjectTax.name;
                    if (topicTax) questionUpdateData.topic = topicTax.name;
                    if (subTopicTax) questionUpdateData.subTopic = subTopicTax.name;
                    if (Object.keys(questionUpdateData).length > 0) {
                        await tx.question.update({
                            where: { id: question.id },
                            data: questionUpdateData
                        });
                    }
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

