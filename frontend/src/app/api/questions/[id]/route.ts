import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { recordAuditLog, requestAuditContext } from "@/lib/audit-log";
import { provenanceApprovalError } from "@/lib/question-provenance";
import { structuralApprovalError } from "@/lib/question-qa";
import { figureApprovalError } from "@/lib/question-figures";

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
            select: {
                createdById: true, scope: true, provenance: true, bookId: true, sourcePageStart: true, sourcePageEnd: true, printedNumber: true,
                content: true, options: true, correctAnswer: true, explanation: true, type: true,
            }
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
            confidence, reviewNotes, taxonomyTagIds, provenance
        } = body;

        // The Question Bank acceptance gate: a BOOK_SOURCED question needs its
        // source page and printed number before it can be approved -- see
        // lib/question-provenance.ts. MANUALLY_AUTHORED (settable here, for a
        // question that genuinely has no book source) is exempt.
        if (status === 'APPROVED') {
            const provenanceReason = provenanceApprovalError({
                provenance: provenance ?? existing.provenance,
                bookId: existing.bookId,
                sourcePageStart: existing.sourcePageStart,
                sourcePageEnd: existing.sourcePageEnd,
                printedNumber: existing.printedNumber,
            });
            if (provenanceReason) return NextResponse.json({ error: provenanceReason }, { status: 400 });

            // The structural half of the same gate: no question with an
            // error-severity QA issue may reach APPROVED -- see
            // lib/question-qa.ts. Uses this same request's own edits where
            // present (a reviewer can fix a bad option and approve in one
            // PATCH), falling back to the stored row otherwise.
            const structuralReason = structuralApprovalError({
                content: content !== undefined ? content : existing.content,
                options: Array.isArray(options ?? existing.options) ? (options ?? existing.options) as string[] : undefined,
                correctAnswer: (correctAnswer !== undefined ? correctAnswer : existing.correctAnswer) ?? undefined,
                explanation: (explanation !== undefined ? explanation : existing.explanation) ?? undefined,
                type: type !== undefined ? type : existing.type,
            });
            if (structuralReason) return NextResponse.json({ error: structuralReason }, { status: 400 });

            // The figure half of the same gate: a question depending on a
            // diagram needs its retained asset AND completed human visual
            // review, and any unresolved unmatched figure on its source page
            // must be triaged first -- see lib/question-figures.ts.
            const figureReason = await figureApprovalError({
                id: questionId,
                bookId: existing.bookId,
                sourcePageStart: existing.sourcePageStart,
                sourcePageEnd: existing.sourcePageEnd,
                content: content !== undefined ? content : existing.content,
                explanation: explanation !== undefined ? explanation : existing.explanation,
            });
            if (figureReason) return NextResponse.json({ error: figureReason }, { status: 400 });
        }

        const updateData: any = {};
        if (status) updateData.status = status;
        if (provenance !== undefined) updateData.provenance = provenance;
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


        await recordAuditLog({
            actorId: userId,
            actorRole: role,
            action: "QUESTION_UPDATED",
            entityType: "Question",
            entityId: questionId,
            metadata: { changedFields: Object.keys(updateData), status: updateData.status },
            ...requestAuditContext(req),
        });

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

        const questionId = (await params).id;
        await prisma.question.delete({
            where: { id: questionId }
        });

        await recordAuditLog({
            actorId: (session.user as any).id,
            actorRole: (session.user as any).role,
            action: "QUESTION_DELETED",
            entityType: "Question",
            entityId: questionId,
            ...requestAuditContext(req),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete question:", error);
        return NextResponse.json({ error: "Failed to delete question" }, { status: 500 });
    }
}
