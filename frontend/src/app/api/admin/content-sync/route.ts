import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { contentRole } from '@/lib/content-role';
import { syncConnection } from '@/lib/content-sync/config';
import { E2E_EXCLUSIONS } from '@/lib/content-sync/exclusions';
import { runContentSync } from '@/lib/content-sync/run';

export const dynamic = 'force-dynamic';
// A full comparison reads every content row on both sides.
export const maxDuration = 300;

const MAX_ISSUES = 500;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'ADMIN') return null;
  return session.user.id;
}

/** The site's role, whether publishing is set up here, and the recent sync runs. */
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const connection = syncConnection();
  const runs = contentRole() === 'staging'
    ? await prisma.contentSyncRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 15,
        select: { id: true, startedAt: true, finishedAt: true, mode: true, triggeredBy: true, status: true, summary: true, error: true },
      })
    : [];
  return NextResponse.json({ role: contentRole(), ready: connection.ready, reason: connection.ready ? null : connection.reason, runs });
}

/** Preview ({ apply: false }) or publish ({ apply: true }) the differences between staging and live. */
export async function POST(request: Request) {
  const adminId = await requireAdmin();
  if (!adminId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const connection = syncConnection();
  if (!connection.ready) return NextResponse.json({ error: connection.reason }, { status: 409 });

  const body = await request.json().catch(() => ({}));
  const apply = body?.apply === true;
  try {
    const report = await runContentSync({
      stagingUrl: connection.stagingUrl,
      liveUrl: connection.liveUrl,
      apply,
      triggeredBy: `admin:${adminId}`,
      exclusions: E2E_EXCLUSIONS,
    });
    const totals: Record<string, number> = {};
    for (const counts of Object.values(report.summary)) for (const [action, n] of Object.entries(counts)) totals[action] = (totals[action] ?? 0) + (n ?? 0);
    return NextResponse.json({
      runId: report.runId,
      applied: report.applied,
      totals,
      tables: report.summary,
      written: report.written,
      issues: report.issues.slice(0, MAX_ISSUES),
      issuesTruncated: report.issues.length > MAX_ISSUES,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
