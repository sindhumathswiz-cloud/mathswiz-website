import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageExtractionBenchmark = { findMany: vi.fn() };
const bookIngestionRun = { findMany: vi.fn() };
const question = { groupBy: vi.fn() };
const queryRaw = vi.fn();

vi.mock('./prisma', () => ({ default: { pageExtractionBenchmark, bookIngestionRun, question, $queryRaw: queryRaw } }));

describe('readMeasurements', () => {
  it('reads what an admin recorded and ignores nonsense', async () => {
    const { readMeasurements } = await import('./provider-pilot-data');
    expect(readMeasurements(null)).toBeNull();
    expect(readMeasurements({ sourceProfile: 'IMAGE_BOOK' })).toBeNull();
    expect(readMeasurements({ pilot: { reviewMinutes: 90, reviewedQuestions: 100, spend: 250, currency: 'INR', notes: 'n', updatedAt: '2026-10-05' } })).toEqual({
      reviewMinutes: 90, reviewedQuestions: 100, spend: 250, currency: 'INR', notes: 'n', updatedAt: '2026-10-05',
    });
    expect(readMeasurements({ pilot: { reviewMinutes: -4, spend: 'lots', currency: 5 } })).toMatchObject({ reviewMinutes: null, spend: null, currency: null });
  });
});

describe('sumEconomics', () => {
  const run = (verified: number, measurements: Record<string, unknown> | null) => ({
    runId: 'r', bookId: 'b', bookTitle: 'T', className: 'Class 12', profile: null, extractedQuestions: 0, verifiedQuestions: verified, benchmarkedPages: 0,
    measurements: measurements ? { reviewMinutes: null, reviewedQuestions: null, spend: null, currency: null, notes: null, updatedAt: null, ...measurements } : null,
  });

  it('divides spend only by the verified questions of the runs whose spend was recorded', async () => {
    const { sumEconomics } = await import('./provider-pilot-data');
    const economics = sumEconomics([
      run(100, { spend: 200, currency: 'INR' }),
      run(900, null), // a big run with no recorded cost must not flatter the cost per question
    ]);
    expect(economics).toMatchObject({ spend: 200, verifiedQuestions: 100, currency: 'INR', runsMeasured: 1 });
  });

  it('counts review minutes only from runs that recorded both the minutes and the questions reviewed', async () => {
    const { sumEconomics } = await import('./provider-pilot-data');
    const economics = sumEconomics([
      run(0, { reviewMinutes: 60, reviewedQuestions: 40 }),
      run(0, { reviewMinutes: 500 }), // minutes with no question count cannot be turned into a rate
    ]);
    expect(economics).toMatchObject({ reviewMinutes: 60, reviewedQuestions: 40 });
  });
});

describe('loadProviderPilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRaw.mockResolvedValue([{ compared: null, agreed: null }]);
    bookIngestionRun.findMany.mockResolvedValue([]);
    question.groupBy.mockResolvedValue([]);
  });

  it('turns stored benchmarks into observations, taking an expected count only from born-digital pages', async () => {
    pageExtractionBenchmark.findMany.mockResolvedValue([
      { provider: 'GEMINI_VISION', status: 'COMPLETED', latencyMs: 12000, model: 'g', metrics: { detectedQuestions: 11 }, documentPage: { pageNumber: 5, layoutData: { regionCounts: { QUESTION_NUMBER_CANDIDATE: 12 } } }, ingestionRun: { id: 'r1', providerConfig: { sourceProfile: 'DIGITAL_MATH' }, book: { id: 'b1', className: 'Class 12' } } },
      { provider: 'MATHPIX_OCR', status: 'COMPLETED', latencyMs: 4000, model: null, metrics: { detectedQuestionMarkers: 9 }, documentPage: { pageNumber: 7, layoutData: { regionCounts: { QUESTION_NUMBER_CANDIDATE: 40 } } }, ingestionRun: { id: 'r2', providerConfig: { sourceProfile: 'IMAGE_BOOK' }, book: { id: 'b2', className: 'Class 11' } } },
    ]);
    const { loadProviderPilot } = await import('./provider-pilot-data');
    const report = await loadProviderPilot();
    expect(report.evidence.databaseObservations).toBe(2);
    expect(report.evidence.fileObservations).toBeGreaterThan(0);
    // Class coverage can only come from the database, where a book has a class.
    expect(report.coverage.classes.find(c => c.className === 'Class 12')?.pages).toBe(1);
    expect(report.coverage.classes.find(c => c.className === 'Class 11')?.pages).toBe(1);
    expect(report.gate.verdict).toBe('NOT_READY');
  });

  it('includes the earlier pilot evidence even when the database holds no benchmarks, and never claims readiness on it', async () => {
    pageExtractionBenchmark.findMany.mockResolvedValue([]);
    const { loadProviderPilot } = await import('./provider-pilot-data');
    const report = await loadProviderPilot();
    expect(report.summaries.map(s => s.provider)).toEqual(expect.arrayContaining(['GEMINI_VISION', 'MATHPIX_OCR']));
    expect(report.gate.verdict).toBe('NOT_READY');
    expect(report.gate.criteria.find(c => c.id === 'coverage-classes')?.status).toBe('NOT_MET');
    expect(report.formulaAgreement).toBeNull();
  });

  it('reads formula agreement from the reconciliation records when pages have been compared', async () => {
    pageExtractionBenchmark.findMany.mockResolvedValue([]);
    queryRaw.mockResolvedValue([{ compared: BigInt(40), agreed: BigInt(36) }]);
    const { loadProviderPilot } = await import('./provider-pilot-data');
    expect((await loadProviderPilot()).formulaAgreement).toEqual({ compared: 40, agreed: 36 });
  });
});
