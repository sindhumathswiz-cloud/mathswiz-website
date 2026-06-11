import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { board, classIds } = await req.json();
        if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
            return NextResponse.json({ error: "classIds required" }, { status: 400 });
        }

        // Get all SUBJECTs under the given classIds
        const subjects = await prisma.tagTaxonomy.findMany({
            where: { type: "SUBJECT", parentId: { in: classIds }, isActive: true },
            select: { id: true, name: true, parentId: true },
        });
        const subjectIds = subjects.map(s => s.id);

        if (subjectIds.length === 0) {
            return NextResponse.json({ topics: [] });
        }

        // Get all TOPICs under those subjects
        const topics = await prisma.tagTaxonomy.findMany({
            where: { type: "TOPIC", parentId: { in: subjectIds }, isActive: true },
            orderBy: { order: "asc" },
            include: { parent: { select: { name: true, parentId: true } } },
        });

        // Get class names for the className field
        const classMap = new Map<string, string>();
        const classEntries = await prisma.tagTaxonomy.findMany({
            where: { id: { in: classIds } },
            select: { id: true, name: true },
        });
        for (const c of classEntries) classMap.set(c.id, c.name);

        const result = [];
        for (const topic of topics) {
            const approvedCount = await prisma.questionTag.count({
                where: { tagId: topic.id, question: { status: "APPROVED" } },
            });
            // Determine which class this topic belongs to via subject -> class chain
            const subject = subjects.find(s => s.id === topic.parentId);
            const className = subject ? (classMap.get(subject.parentId || "") || "") : "";
            result.push({
                topicId: topic.id,
                topicName: topic.name,
                className,
                questionCount: approvedCount,
            });
        }

        return NextResponse.json({ topics: result });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
