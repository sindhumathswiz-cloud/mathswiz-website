import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const classId = searchParams.get('classId');
        const subjectId = searchParams.get('subjectId');
        const topicId = searchParams.get('topicId');
        const board = searchParams.get('board');

        const where: any = { isApproved: true, isActive: true };
        if (board) where.boardType = board;

        const result: any = {
            classes: [],
            subjects: [],
            topics: [],
            subtopics: []
        };

        if (!classId && !subjectId && !topicId) {
            result.classes = await prisma.tagTaxonomy.findMany({
                where: { ...where, type: 'CLASS' },
                orderBy: [{ order: 'asc' }, { name: 'asc' }]
            });
        }

        if (classId && !subjectId) {
            result.subjects = await prisma.tagTaxonomy.findMany({
                where: { ...where, parentId: classId, type: 'SUBJECT' },
                orderBy: [{ order: 'asc' }, { name: 'asc' }]
            });
        }

        if (subjectId && !topicId) {
            result.topics = await prisma.tagTaxonomy.findMany({
                where: { ...where, parentId: subjectId, type: 'TOPIC' },
                orderBy: [{ order: 'asc' }, { name: 'asc' }],
                include: {
                    _count: { select: { questionTags: true } }
                }
            });
        }

        if (topicId) {
            result.subtopics = await prisma.tagTaxonomy.findMany({
                where: { ...where, parentId: topicId, type: 'SUBTOPIC' },
                orderBy: [{ order: 'asc' }, { name: 'asc' }],
                include: {
                    _count: { select: { questionTags: true } }
                }
            });
        }

        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}