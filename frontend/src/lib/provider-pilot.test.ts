import { describe, expect, it } from 'vitest';
import { evaluateGate, foundQuestionsFromMetrics, GATE_THRESHOLDS, percentile, pilotCoverage, provisionalLead, summarizeProviders, type PilotEconomics, type PilotObservation } from './provider-pilot';

let n = 0;
const obs = (overrides: Partial<PilotObservation> = {}): PilotObservation => ({
  provider: 'GEMINI_VISION', profile: 'DIGITAL_MATH', className: null, sample: `s${n++}`, status: 'COMPLETED', latencyMs: 10000,
  expectedQuestions: 10, foundQuestions: 10, origin: 'PILOT_FILE', ...overrides,
});
const noEconomics: PilotEconomics = { runsMeasured: 0, reviewMinutes: 0, reviewedQuestions: 0, spend: 0, currency: null, verifiedQuestions: 0 };

describe('percentile', () => {
  it('is the nearest-rank value and null for nothing', () => {
    expect(percentile([], 50)).toBeNull();
    expect(percentile([5, 1, 9, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([7], 90)).toBe(7);
  });
});

describe('summarizeProviders', () => {
  it('separates an unreachable provider from a failing one when judging reliability', () => {
    const [gemini] = summarizeProviders([
      obs(), obs(), obs(), obs({ status: 'FAILED' }),
      obs({ status: 'PROVIDER_UNAVAILABLE' }), obs({ status: 'PROVIDER_UNAVAILABLE' }),
    ]);
    expect(gemini).toMatchObject({ attempted: 6, completed: 3, failed: 1, unavailable: 2 });
    // 3 of the 4 pages it could actually be asked for, not 3 of 6.
    expect(gemini.completionRate).toBeCloseTo(0.75);
  });

  it('caps recall per page so extra detections on one page cannot hide a miss on another', () => {
    const [s] = summarizeProviders([
      obs({ expectedQuestions: 13, foundQuestions: 25 }),
      obs({ expectedQuestions: 5, foundQuestions: 0 }),
    ]);
    expect(s.recall).toMatchObject({ matched: 13, expected: 18, found: 25, pages: 2, rate: 13 / 18 });
    // 13 of the 25 things it reported are real.
    expect(s.recall?.precision).toBeCloseTo(13 / 25);
    expect(s.overDetectionRate).toBeCloseTo(12 / 18);
  });

  it('leaves recall unmeasured where no expected count exists, and ignores unfinished pages', () => {
    const [s] = summarizeProviders([obs({ expectedQuestions: null }), obs({ status: 'FAILED', expectedQuestions: 10, foundQuestions: 0 }), obs({ expectedQuestions: 0, foundQuestions: 3 })]);
    expect(s.recall).toBeNull();
  });

  it('reports latency over completed calls only, and a per-profile tally', () => {
    const [s] = summarizeProviders([
      obs({ latencyMs: 1000 }), obs({ latencyMs: 3000, profile: 'IMAGE_BOOK' }), obs({ status: 'FAILED', latencyMs: 99999 }),
    ]);
    expect(s.medianLatencyMs).toBe(1000);
    expect(s.byProfile).toEqual({ DIGITAL_MATH: { attempted: 2, completed: 1 }, IMAGE_BOOK: { attempted: 1, completed: 1 } });
  });

  it('keeps providers apart', () => {
    const summaries = summarizeProviders([obs(), obs({ provider: 'MATHPIX_OCR' })]);
    expect(summaries.map(s => s.provider)).toEqual(['GEMINI_VISION', 'MATHPIX_OCR']);
  });
});

describe('pilotCoverage', () => {
  it('counts distinct completed pages per profile and per class against the targets', () => {
    const rows = [
      ...Array.from({ length: GATE_THRESHOLDS.minPagesPerProfile }, () => obs({ profile: 'DIGITAL_MATH', className: 'Class 12' })),
      obs({ profile: 'IMAGE_BOOK', className: 'Class 12' }),
      obs({ profile: 'IMAGE_BOOK', className: 'Class 12', status: 'FAILED' }),
    ];
    const c = pilotCoverage(rows);
    expect(c.profiles.find(p => p.profile === 'DIGITAL_MATH')).toMatchObject({ pages: 25, met: true });
    expect(c.profiles.find(p => p.profile === 'IMAGE_BOOK')).toMatchObject({ pages: 1, met: false });
    expect(c.profiles.find(p => p.profile === 'PHOTOGRAPHED_BOOK')).toMatchObject({ pages: 0, met: false });
    expect(c.classes.find(k => k.className === 'Class 12')?.met).toBe(true);
    expect(c.classes.find(k => k.className === 'Class 11')).toMatchObject({ pages: 0, met: false });
  });

  it('counts one page once even when two providers read it', () => {
    const c = pilotCoverage([obs({ sample: 'p1' }), obs({ sample: 'p1', provider: 'MATHPIX_OCR' })]);
    expect(c.profiles[0]).toMatchObject({ pages: 1, byProvider: { GEMINI_VISION: 1, MATHPIX_OCR: 1 } });
  });
});

describe('provisionalLead', () => {
  const pages = (provider: string, count: number, found: number, latencyMs = 10000) => Array.from({ length: count }, () => obs({ provider, expectedQuestions: 10, foundQuestions: found, latencyMs }));

  it('ranks on recall and precision together, then reliability, then speed', () => {
    const summaries = summarizeProviders([...pages('A', 12, 10, 30000), ...pages('B', 12, 8, 3000)]);
    expect(provisionalLead(summaries)?.provider).toBe('A');
    expect(provisionalLead(summaries)?.reason).toMatch(/100% of expected questions found and 100% of detections real, over 12 scored pages/);
  });

  it('does not let a provider that finds everything by also inventing a lot win', () => {
    // Finds all 10 on every page but reports 30: two thirds of its detections are false.
    const summaries = summarizeProviders([...pages('NOISY', 12, 30), ...pages('CLEAN', 12, 9)]);
    expect(provisionalLead(summaries)?.provider).toBe('CLEAN');
  });

  it('will not name a lead from a handful of pages', () => {
    expect(provisionalLead(summarizeProviders(pages('A', 4, 10)))).toBeNull();
    expect(provisionalLead(summarizeProviders(pages('A', 9, 10)))).toBeNull();
    expect(provisionalLead(summarizeProviders(pages('A', 10, 10)))?.provider).toBe('A');
    expect(provisionalLead([])).toBeNull();
  });
});

describe('evaluateGate', () => {
  const strong = () => summarizeProviders(Array.from({ length: 30 }, () => obs({ foundQuestions: 10 })));
  const fullCoverage = () => pilotCoverage([
    ...(['DIGITAL_MATH', 'MIXED_LAYOUT_ASSESSMENT', 'IMAGE_BOOK', 'PHOTOGRAPHED_BOOK'] as const).flatMap(profile =>
      Array.from({ length: 25 }, () => obs({ profile, className: 'Class 11' }))),
    ...Array.from({ length: 25 }, () => obs({ className: 'Class 12' })),
  ]);

  it('is NOT_READY on thin evidence, names every blocker, and calls a lead provisional', () => {
    const gate = evaluateGate({ summaries: strong(), coverage: pilotCoverage([]), economics: noEconomics, formulaAgreement: null });
    expect(gate.verdict).toBe('NOT_READY');
    expect(gate.statement).toMatch(/Do not buy a long-term plan yet/);
    expect(gate.statement).toMatch(/provisional reading, not a recommendation to buy/);
    const status = Object.fromEntries(gate.criteria.map(c => [c.id, c.status]));
    expect(status).toMatchObject({
      'coverage-profiles': 'NOT_MET', 'coverage-classes': 'NOT_MET', completion: 'MET', recall: 'MET', precision: 'MET',
      formula: 'NOT_MEASURED', option: 'NOT_MEASURED', solution: 'NOT_MEASURED', figure: 'NOT_MEASURED',
      'review-minutes': 'NOT_MEASURED', 'cost-per-verified': 'NOT_MEASURED',
    });
    expect(gate.blockers.length).toBe(8);
  });

  it('never invents a measurement: the label-dependent criteria stay unmeasured however good the rest looks', () => {
    const gate = evaluateGate({
      summaries: strong(), coverage: fullCoverage(),
      economics: { runsMeasured: 2, reviewMinutes: 300, reviewedQuestions: 200, spend: 500, currency: 'INR', verifiedQuestions: 250 },
      formulaAgreement: { compared: 100, agreed: 95 },
    });
    expect(gate.verdict).toBe('NOT_READY');
    expect(gate.criteria.filter(c => c.status === 'NOT_MEASURED').map(c => c.id)).toEqual(['option', 'solution', 'figure']);
    expect(gate.criteria.find(c => c.id === 'review-minutes')?.detail).toContain('150.0 minutes per 100');
    expect(gate.criteria.find(c => c.id === 'cost-per-verified')?.detail).toContain('2.00 INR per verified question');
  });

  it('reports a provider below the recall bar as not met rather than unmeasured', () => {
    const weak = summarizeProviders(Array.from({ length: 10 }, () => obs({ foundQuestions: 7 })));
    const gate = evaluateGate({ summaries: weak, coverage: pilotCoverage([]), economics: noEconomics, formulaAgreement: null });
    expect(gate.criteria.find(c => c.id === 'recall')?.status).toBe('NOT_MET');
  });

  it('needs one provider to clear recall and precision together, not one of each', () => {
    const noisy = Array.from({ length: 12 }, () => obs({ provider: 'NOISY', foundQuestions: 40 }));   // recall 100%, precision 25%
    const precise = Array.from({ length: 12 }, () => obs({ provider: 'PRECISE', foundQuestions: 6 })); // precision 100%, recall 60%
    const gate = evaluateGate({ summaries: summarizeProviders([...noisy, ...precise]), coverage: pilotCoverage([]), economics: noEconomics, formulaAgreement: null });
    expect(gate.criteria.find(c => c.id === 'recall')?.status).toBe('MET');
    expect(gate.criteria.find(c => c.id === 'precision')?.status).toBe('NOT_MET');
  });

  it('treats formula agreement below the bar as not met, and counts review minutes only from enough reviewed questions', () => {
    const gate = evaluateGate({
      summaries: strong(), coverage: pilotCoverage([]),
      economics: { ...noEconomics, runsMeasured: 1, reviewMinutes: 60, reviewedQuestions: 40 },
      formulaAgreement: { compared: 25, agreed: 15 },
    });
    expect(gate.criteria.find(c => c.id === 'formula')?.status).toBe('NOT_MET');
    expect(gate.criteria.find(c => c.id === 'review-minutes')?.status).toBe('NOT_MEASURED');
  });
});

describe('foundQuestionsFromMetrics', () => {
  it('reads the count from where each provider reports it', () => {
    expect(foundQuestionsFromMetrics('GEMINI_VISION', { detectedQuestions: 12 })).toBe(12);
    expect(foundQuestionsFromMetrics('MATHPIX_OCR', { detectedQuestionMarkers: 9, detectedQuestions: 99 })).toBe(9);
    expect(foundQuestionsFromMetrics('MISTRAL_OCR', { detectedQuestionMarkers: 3 })).toBe(3);
    expect(foundQuestionsFromMetrics('GEMINI_VISION', null)).toBeNull();
    expect(foundQuestionsFromMetrics('GEMINI_VISION', { detectedQuestions: 'x' })).toBeNull();
  });
});
