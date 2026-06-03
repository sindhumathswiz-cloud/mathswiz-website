import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const totalApproved = await prisma.question.count({ where: { status: 'APPROVED' } });
        const totalPending = await prisma.question.count({ where: { status: 'PENDING_REVIEW' } });
        const bySubject = await prisma.question.groupBy({ by: ['subject'], _count: { subject: true }, where: { status: 'APPROVED', subject: { not: null } } });
        const byClass = await prisma.question.groupBy({ by: ['class'], _count: { class: true }, where: { status: 'APPROVED', class: { not: null } } });
        const byType = await prisma.question.groupBy({ by: ['type'], _count: { type: true }, where: { status: 'APPROVED' } });
        // @ts-ignore: test model added in recent db push
        const totalTests = await prisma.test.count();
        // @ts-ignore
        const publishedTests = await prisma.test.count({ where: { isPublished: true } });
        return NextResponse.json({ totalApproved, totalPending, subjects: bySubject, classes: byClass, formats: byType, totalTests, publishedTests });
    } catch (error: any) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}

