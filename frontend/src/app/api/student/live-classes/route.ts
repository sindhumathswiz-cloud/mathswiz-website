import { NextResponse } from 'next/server';
import prisma from "@/lib/prisma";
import { getServerSession } from 'next-auth';
import { authOptions } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const studentId = (session.user as any).id;

    const enrollments = await (prisma as any).batchEnrollment.findMany({
      where: { studentId, status: 'APPROVED' },
      select: { batchId: true },
    });

    const batchIds = enrollments.map((e: any) => e.batchId);

    if (batchIds.length === 0) {
      return NextResponse.json({ success: true, classes: [] });
    }

    const liveClasses = await (prisma as any).liveClass.findMany({
      where: { batchId: { in: batchIds } },
      include: { batch: { select: { name: true, teacher: { select: { firstName: true, lastName: true } } } } },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();
    const upcoming = liveClasses.filter((c: any) => new Date(c.startTime) >= now);
    const past = liveClasses.filter((c: any) => new Date(c.startTime) < now);

    return NextResponse.json({
      success: true,
      classes: liveClasses,
      upcoming,
      past: past.filter((c: any) => c.recordingUrl),
    });
  } catch (error: any) {
    console.error('Error fetching student live classes:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
