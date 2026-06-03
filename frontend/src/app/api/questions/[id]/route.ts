import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role;
        const userId = (session.user as any).id;
        const questionId = (await params).id;

        // Check ownership/permission
        const existing = await prisma.question.findUnique({
            where: { id: questionId },
            select: { createdById: true, scope: true }
        });

        if (!existing) {
            return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        // Admin can edit any question, teachers can only edit their own private questions
        if (role !== 'ADMIN' && !(role === 'TEACHER' && existing.scope === 'TEACHER_PRIVATE' && existing.createdById === userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const {
            status, reportedIssues,
            content, options, correctAnswer, explanation,
            type, difficulty, subject, class: classLevel, examType, tags,
            confidence, reviewNotes, taxonomyTagIds
        } = body;

        const updateData: any = {};
        if (status) updateData.status = status;
        if (reportedIssues !== undefined) updateData.reportedIssues = reportedIssues;
        if (content !== undefined) updateData.content = content;
        if (options !== undefined) updateData.options = options;
        if (correctAnswer !== undefined) updateData.correctAnswer = correctAnswer;
        if (explanation !== undefined) updateData.explanation = explanation;
        if (type !== undefined) updateData.type = type;
        if (difficulty !== undefined) updateData.difficulty = difficulty;
        if (subject !== undefined) updateData.subject = subject;
        if (classLevel !== undefined) updateData.class = classLevel;
        if (examType !== undefined) updateData.examType = examType;
        if (tags !== undefined) updateData.tags = tags;
        if (confidence !== undefined) updateData.confidence = confidence;
        if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;

        const question = await prisma.question.update({
            where: { id: questionId },
            data: updateData
        });

        // Handle taxonomy tags: create QuestionTag records + add taxonomy names to tags
        if (taxonomyTagIds && Array.isArray(taxonomyTagIds) && taxonomyTagIds.length > 0) {
            // Delete existing QuestionTag records for this question (re-sync)
            await prisma.questionTag.deleteMany({ where: { questionId } });

            // Fetch taxonomy names with types
            const taxonomies = await prisma.tagTaxonomy.findMany({
                where: { id: { in: taxonomyTagIds } },
                select: { id: true, name: true, type: true }
            });

            // Create new QuestionTag records
            for (const tax of taxonomies) {
                await prisma.questionTag.create({
                    data: { questionId, tagId: tax.id }
                });
            }

            // Merge taxonomy names into tags array (deduplicated)
            const taxonomyNames = taxonomies.map(t => t.name).filter(Boolean);
            const mergedTags = [...new Set([...(updateData.tags || []), ...taxonomyNames])];
            if (mergedTags.length > (updateData.tags || []).length) {
                await prisma.question.update({
                    where: { id: questionId },
                    data: { tags: mergedTags }
                });
            }

            // Set topic/subTopic from taxonomy if not already set in updateData
            const classTax = taxonomies.find(t => t.type === 'CLASS');
            const subjectTax = taxonomies.find(t => t.type === 'SUBJECT');
            const topicTax = taxonomies.find(t => t.type === 'TOPIC');
            const subTopicTax = taxonomies.find(t => t.type === 'SUBTOPIC');
            const taxonomyMetaUpdate: any = {};
            if (!updateData.class && classTax) taxonomyMetaUpdate.class = classTax.name;
            if (!updateData.subject && subjectTax) taxonomyMetaUpdate.subject = subjectTax.name;
            if (topicTax) taxonomyMetaUpdate.topic = topicTax.name;
            if (subTopicTax) taxonomyMetaUpdate.subTopic = subTopicTax.name;
            if (Object.keys(taxonomyMetaUpdate).length > 0) {
                await prisma.question.update({
                    where: { id: questionId },
                    data: taxonomyMetaUpdate
                });
            }
        } else if (status === 'APPROVED') {
            // Even if no new tags provided, ensure existing QuestionTag names are in the tags array
            const existingTags = await prisma.questionTag.findMany({
                where: { questionId },
                include: { tag: { select: { name: true } } }
            });
            if (existingTags.length > 0) {
                const q = await prisma.question.findUnique({
                    where: { id: questionId },
                    select: { tags: true }
                });
                const taxonomyNames = existingTags.map(qt => qt.tag.name).filter(Boolean);
                const merged = [...new Set([...(q?.tags || []), ...taxonomyNames])];
                if (merged.length > (q?.tags || []).length) {
                    await prisma.question.update({
                        where: { id: questionId },
                        data: { tags: merged }
                    });
                }
            }
        }

        return NextResponse.json({ success: true, question });
    } catch (error) {
        console.error("Failed to patch question:", error);
        return NextResponse.json({ error: "Failed to patch question" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
        }

        await prisma.question.delete({
            where: { id: (await params).id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete question:", error);
        return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
    }
}
