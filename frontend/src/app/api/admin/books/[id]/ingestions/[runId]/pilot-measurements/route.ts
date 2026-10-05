import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { recordAuditLog, requestAuditContext } from '@/lib/audit-log';
import { readMeasurements } from '@/lib/provider-pilot-data';

export const runtime = 'nodejs';

/**
 * Records the measurements only a person can supply for a pilot run: how long
 * reviewing its questions took, how many were reviewed, and what the run cost.
 * They feed review-minutes-per-100 and cost-per-verified-question in the
 * provider purchase gate. Stored under providerConfig.pilot, merged into the
 * run's existing config (which also carries extraction state) rather than
 * replacing it.
 *
 * Body: { reviewMinutes?, reviewedQuestions?, spend?, currency?, notes? }.
 * A field sent as null clears it; a field left out is kept.
 */

const MAX_REASONABLE = 1_000_000;

const asNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_REASONABLE ? value : undefined;
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const auth = await getAuthenticatedUser(['ADMIN']);
  if ('error' in auth) return auth.error;
  const { id, runId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });

  for (const key of ['reviewMinutes', 'reviewedQuestions', 'spend'] as const) {
    if (body[key] !== undefined && body[key] !== null && asNumber(body[key]) === undefined) {
      return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
    }
  }
  if (body.reviewedQuestions != null && !Number.isInteger(body.reviewedQuestions)) {
    return NextResponse.json({ error: 'reviewedQuestions must be a whole number' }, { status: 400 });
  }
  if (body.currency != null && !(typeof body.currency === 'string' && /^[A-Za-z]{3}$/.test(body.currency))) {
    return NextResponse.json({ error: 'currency must be a 3-letter code such as INR' }, { status: 400 });
  }

  const run = await prisma.bookIngestionRun.findFirst({ where: { id: runId, bookId: id }, select: { id: true, providerConfig: true } });
  if (!run) return NextResponse.json({ error: 'Book ingestion run not found' }, { status: 404 });

  const config = run.providerConfig && typeof run.providerConfig === 'object' && !Array.isArray(run.providerConfig) ? run.providerConfig as Record<string, unknown> : {};
  const previous = readMeasurements(run.providerConfig);
  const merged = {
    reviewMinutes: body.reviewMinutes !== undefined ? asNumber(body.reviewMinutes) ?? null : previous?.reviewMinutes ?? null,
    reviewedQuestions: body.reviewedQuestions !== undefined ? asNumber(body.reviewedQuestions) ?? null : previous?.reviewedQuestions ?? null,
    spend: body.spend !== undefined ? asNumber(body.spend) ?? null : previous?.spend ?? null,
    currency: body.currency !== undefined ? (body.currency ? String(body.currency).toUpperCase() : null) : previous?.currency ?? null,
    notes: body.notes !== undefined ? (typeof body.notes === 'string' ? body.notes.trim().slice(0, 1000) || null : null) : previous?.notes ?? null,
    updatedAt: new Date().toISOString(),
    updatedById: auth.user.id,
  };

  await prisma.bookIngestionRun.update({ where: { id: run.id }, data: { providerConfig: { ...config, pilot: merged } as Prisma.InputJsonValue } });
  await recordAuditLog({
    actorId: auth.user.id, actorRole: 'ADMIN', action: 'BOOK_PILOT_MEASUREMENTS_RECORDED', entityType: 'BookIngestionRun', entityId: run.id,
    metadata: { bookId: id, ...merged }, ...requestAuditContext(request),
  });
  return NextResponse.json({ measurements: merged });
}
