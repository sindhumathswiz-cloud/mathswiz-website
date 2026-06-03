import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * SECURED ADMIN QUESTION ENDPOINT
 * Used for real-time polling of DRAFT and PENDING_REVIEW questions in the Bulk Import Studio.
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || (session.user as any).role === 'STUDENT' || (session.user as any).role === 'PARENT') {
            return NextResponse.json({ error: "Unauthorized. Admin/Teacher only." }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') || 'DRAFT';
        const folderId = searchParams.get('folderId');
        const taxonomyIdsRaw = searchParams.get('taxonomyIds');
        const taxonomyIds: string[] = taxonomyIdsRaw ? JSON.parse(taxonomyIdsRaw) : [];

        const where: any = {
            status: status as any
        };

        if (folderId) {
            where.knowledgeFolderId = folderId;
        }

        if (taxonomyIds.length > 0) {
            where.questionTags = {
                some: { tagId: { in: taxonomyIds } }
            };
        }

        // Only fetch questions created by current teacher OR all if Admin
        if ((session.user as any).role === 'TEACHER') {
            where.createdById = (session.user as any).id;
        }

        // Admin can filter by scope
        const scope = searchParams.get('scope');
        if (scope && (session.user as any).role === 'ADMIN') {
            where.scope = scope;
        }

        const questions = await prisma.question.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 200, // Safety cap
            include: {
                createdBy: { select: { firstName: true, lastName: true, role: true } },
                solution: { select: { content: true, confidence: true, isVerified: true } },
            }
        });

        return NextResponse.json({ success: true, questions });
    } catch (err: any) {
        console.error("[ADMIN-QUESTIONS-API] Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
