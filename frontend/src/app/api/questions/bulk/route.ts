import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role !== 'ADMIN') {
            return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 403 });
        }

        const body = await req.json();
        const { questionIds, tags, action = 'ADD', examType, type, difficulty, subject, class: classLevel } = body;

        if (!Array.isArray(questionIds) || questionIds.length === 0) {
            return NextResponse.json({ error: "questionIds array is required" }, { status: 400 });
        }

        const cleanTags = tags && Array.isArray(tags)
            ? tags.map((t: string) => t.trim()).filter(Boolean) as string[]
            : [];

        const staticUpdate: any = {};
        if (cleanTags.length > 0 && action !== 'ADD') staticUpdate.tags = cleanTags;
        if (examType !== undefined) staticUpdate.examType = examType;
        if (type !== undefined) staticUpdate.type = type;
        if (difficulty !== undefined) staticUpdate.difficulty = difficulty;
        if (subject !== undefined) staticUpdate.subject = subject;
        if (classLevel !== undefined) staticUpdate.class = classLevel;

        if (action === 'ADD' && cleanTags.length > 0) {
            // ADD tags: per-question merge (use Promise.all to avoid transaction timeout)
            const questions = await prisma.question.findMany({
                where: { id: { in: questionIds } },
                select: { id: true, tags: true }
            });

            const updates = questions
                .map(q => {
                    const merged = [...new Set([...q.tags, ...cleanTags])];
                    const hasTagChange = merged.length !== q.tags.length ||
                        merged.some((t, i) => t !== q.tags[i]);
                    if (!hasTagChange && Object.keys(staticUpdate).length === 0) return null;
                    const data = { ...staticUpdate };
                    if (hasTagChange) { (data as any).tags = merged; }
                    return prisma.question.update({ where: { id: q.id }, data });
                })
                .filter((u): u is NonNullable<typeof u> => u !== null);

            if (updates.length > 0) {
                await Promise.all(updates);
            }
        } else if (Object.keys(staticUpdate).length > 0) {
            // Simple bulk update: same data for all (use Promise.all to avoid transaction timeout)
            await Promise.all(
                questionIds.map((id: string) =>
                    prisma.question.update({ where: { id }, data: staticUpdate })
                )
            );
        } else {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        return NextResponse.json({ success: true, updated: questionIds.length });
    } catch (error) {
        console.error("Bulk update failed:", error);
        return NextResponse.json({ error: "Bulk update failed" }, { status: 500 });
    }
}
