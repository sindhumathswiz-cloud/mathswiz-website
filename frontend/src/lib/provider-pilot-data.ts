import prisma from './prisma';
import evidence from '@/data/phase-qb-pilot-evidence.json';
import {
  evaluateGate, foundQuestionsFromMetrics, GATE_THRESHOLDS, pilotCoverage, summarizeProviders,
  type Gate, type PilotEconomics, type PilotObservation, type ProviderSummary, type Coverage,
} from './provider-pilot';

/**
 * Assembles the provider purchase gate from everything measured so far:
 *  - benchmarks stored in the database (the explicit one-page Gemini / Mathpix
 *    runs), which know the book's class and the run's source profile;
 *  - the earlier pilot and shadow-sample runs, summarised into
 *    src/data/phase-qb-pilot-evidence.json by scripts/build-pilot-evidence.py;
 *  - the human measurements an admin records per run (review minutes, spend),
 *    kept in the run's providerConfig.pilot, because only a person can time a review.
 */

export interface PilotMeasurements {
  reviewMinutes: number | null;
  reviewedQuestions: number | null;
  spend: number | null;
  currency: string | null;
  notes: string | null;
  updatedAt: string | null;
}

export interface PilotRun {
  runId: string;
  bookId: string;
  bookTitle: string;
  className: string;
  profile: string | null;
  extractedQuestions: number;
  verifiedQuestions: number;
  benchmarkedPages: number;
  measurements: PilotMeasurements | null;
}

export interface ProviderPilotReport {
  thresholds: typeof GATE_THRESHOLDS;
  summaries: ProviderSummary[];
  coverage: Coverage;
  gate: Gate;
  economics: PilotEconomics;
  formulaAgreement: { compared: number; agreed: number } | null;
  runs: PilotRun[];
  evidence: { databaseObservations: number; fileObservations: number; sources: string[] };
}

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

export function readMeasurements(providerConfig: unknown): PilotMeasurements | null {
  const raw = asRecord(asRecord(providerConfig).pilot);
  if (Object.keys(raw).length === 0) return null;
  return {
    reviewMinutes: num(raw.reviewMinutes),
    reviewedQuestions: num(raw.reviewedQuestions),
    spend: num(raw.spend),
    currency: typeof raw.currency === 'string' ? raw.currency : null,
    notes: typeof raw.notes === 'string' ? raw.notes : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

export function sumEconomics(runs: PilotRun[]): PilotEconomics {
  const measured = runs.filter(run => run.measurements && (run.measurements.reviewMinutes !== null || run.measurements.spend !== null));
  const reviewed = measured.filter(run => run.measurements?.reviewMinutes != null && run.measurements?.reviewedQuestions != null);
  const spent = measured.filter(run => run.measurements?.spend != null);
  return {
    runsMeasured: measured.length,
    reviewMinutes: reviewed.reduce((sum, run) => sum + (run.measurements?.reviewMinutes ?? 0), 0),
    reviewedQuestions: reviewed.reduce((sum, run) => sum + (run.measurements?.reviewedQuestions ?? 0), 0),
    spend: spent.reduce((sum, run) => sum + (run.measurements?.spend ?? 0), 0),
    currency: spent.find(run => run.measurements?.currency)?.measurements?.currency ?? null,
    // Only the verified questions of the runs whose spend was recorded: cost must be divided by what it bought.
    verifiedQuestions: spent.reduce((sum, run) => sum + run.verifiedQuestions, 0),
  };
}

export async function loadProviderPilot(): Promise<ProviderPilotReport> {
  const benchmarks = await prisma.pageExtractionBenchmark.findMany({
    select: {
      provider: true, status: true, latencyMs: true, model: true, metrics: true,
      documentPage: { select: { pageNumber: true, layoutData: true } },
      ingestionRun: { select: { id: true, providerConfig: true, book: { select: { id: true, className: true } } } },
    },
  });

  const databaseObservations: PilotObservation[] = benchmarks.map(row => {
    const config = asRecord(row.ingestionRun.providerConfig);
    const profile = typeof config.sourceProfile === 'string' ? config.sourceProfile : null;
    // The PDF's own question markers are only a dependable expected count on born-digital pages.
    const regionCounts = asRecord(asRecord(row.documentPage.layoutData).regionCounts);
    const markers = typeof regionCounts.QUESTION_NUMBER_CANDIDATE === 'number' ? regionCounts.QUESTION_NUMBER_CANDIDATE : null;
    return {
      provider: row.provider,
      profile,
      className: row.ingestionRun.book.className,
      sample: `${row.ingestionRun.id}:${row.documentPage.pageNumber}`,
      status: row.status,
      latencyMs: row.latencyMs,
      model: row.model,
      expectedQuestions: profile === 'DIGITAL_MATH' ? markers : null,
      foundQuestions: foundQuestionsFromMetrics(row.provider, row.metrics),
      origin: 'DATABASE',
    };
  });

  const fileObservations: PilotObservation[] = evidence.observations.map(o => ({
    provider: o.provider, profile: o.profile ?? null, className: null, sample: `file:${o.sample}`, status: o.status,
    latencyMs: o.latencyMs ?? null, model: o.model ?? null, expectedQuestions: o.expectedQuestions ?? null,
    foundQuestions: o.foundQuestions ?? null, overDetection: o.overDetection ?? null, origin: 'PILOT_FILE',
  }));

  const observations = [...databaseObservations, ...fileObservations];

  // Formula agreement between the two providers, from the page reconciliation records.
  const agreementRows = await prisma.$queryRaw<Array<{ compared: bigint | null; agreed: bigint | null }>>`
    SELECT SUM(("layoutData"->'reconciliation'->>'comparedBlocks')::int) AS "compared",
           SUM(("layoutData"->'reconciliation'->>'agreementBlocks')::int) AS "agreed"
    FROM "DocumentPage" WHERE "layoutData"->'reconciliation' IS NOT NULL`;
  const compared = Number(agreementRows[0]?.compared ?? 0);
  const formulaAgreement = compared > 0 ? { compared, agreed: Number(agreementRows[0]?.agreed ?? 0) } : null;

  const runRows = await prisma.bookIngestionRun.findMany({
    where: { sourceDocumentId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, extractedQuestions: true, providerConfig: true, book: { select: { id: true, title: true, className: true } } },
  });
  const verified = await prisma.question.groupBy({
    by: ['bookId'],
    where: { bookId: { in: [...new Set(runRows.map(run => run.book.id))] }, verificationStatus: { in: ['MATHEMATICALLY_VERIFIED', 'VERIFIED'] } },
    _count: { _all: true },
  });
  const verifiedByBook = new Map(verified.map(row => [row.bookId, row._count._all]));
  const benchmarkedByRun = new Map<string, number>();
  for (const row of benchmarks) benchmarkedByRun.set(row.ingestionRun.id, (benchmarkedByRun.get(row.ingestionRun.id) ?? 0) + 1);

  const runs: PilotRun[] = runRows.map(run => ({
    runId: run.id,
    bookId: run.book.id,
    bookTitle: run.book.title,
    className: run.book.className,
    profile: typeof asRecord(run.providerConfig).sourceProfile === 'string' ? asRecord(run.providerConfig).sourceProfile as string : null,
    extractedQuestions: run.extractedQuestions,
    verifiedQuestions: verifiedByBook.get(run.book.id) ?? 0,
    benchmarkedPages: benchmarkedByRun.get(run.id) ?? 0,
    measurements: readMeasurements(run.providerConfig),
  }));

  const summaries = summarizeProviders(observations);
  const coverage = pilotCoverage(observations);
  const economics = sumEconomics(runs);
  return {
    thresholds: GATE_THRESHOLDS,
    summaries,
    coverage,
    economics,
    formulaAgreement,
    gate: evaluateGate({ summaries, coverage, economics, formulaAgreement }),
    runs,
    evidence: { databaseObservations: databaseObservations.length, fileObservations: fileObservations.length, sources: evidence.sources },
  };
}
