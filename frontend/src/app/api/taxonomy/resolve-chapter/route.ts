import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { snapToChapter } from '@/lib/chapter-classifier';

export const dynamic = 'force-dynamic';

/**
 * Resolve a free-text chapter name (e.g. from a PDF filename) to a canonical
 * TagTaxonomy TOPIC id, so uploads can auto-tag the chapter.
 *
 * GET /api/taxonomy/resolve-chapter?name=Limits&class=Class 12&subject=Mathematics&board=CBSE
 * -> { canonical, topicId, topicName } | { canonical, topicId: null }
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const name = searchParams.get('name') || '';
        const className = searchParams.get('class') || 'Class 12';
        const subject = searchParams.get('subject') || 'Mathematics';
        const board = searchParams.get('board') || 'CBSE';

        const canonical = snapToChapter(name, className);
        if (!canonical) {
            return NextResponse.json({ canonical: null, topicId: null });
        }

        // Walk the hierarchy: CLASS -> SUBJECT -> TOPIC for the most precise match.
        const cls = await prisma.tagTaxonomy.findFirst({
            where: { type: 'CLASS', name: { equals: className, mode: 'insensitive' }, ...(board ? { boardType: board as any } : {}) },
        });
        const subj = cls
            ? await prisma.tagTaxonomy.findFirst({
                where: { type: 'SUBJECT', parentId: cls.id, name: { equals: subject, mode: 'insensitive' } },
            })
            : null;

        let topic = subj
            ? await prisma.tagTaxonomy.findFirst({
                where: { type: 'TOPIC', parentId: subj.id, name: { equals: canonical, mode: 'insensitive' } },
            })
            : null;

        // Fallback: any TOPIC tag with the canonical name (handles a flat/loose taxonomy).
        if (!topic) {
            topic = await prisma.tagTaxonomy.findFirst({
                where: { type: 'TOPIC', name: { equals: canonical, mode: 'insensitive' } },
            });
        }

        return NextResponse.json({
            canonical,
            topicId: topic?.id ?? null,
            topicName: topic?.name ?? null,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
