/**
 * Phase QB provider purchase gate, as code.
 *
 * PHASE_QB_PILOT.md says: "Do not purchase a long-term plan before running a
 * controlled representative sample from all four profiles", compared on question
 * recall, formula accuracy, option accuracy, solution-match precision, figure
 * retention, review minutes per 100 questions, and cost per verified question.
 *
 * This module turns the evidence gathered so far into that decision. It never
 * guesses: a criterion with no measurement says so, the verdict stays NOT_READY
 * until every criterion is measured and met, and a "provisional lead" is labelled
 * as evidence-so-far rather than a recommendation to buy. Pure functions only
 * (no database, no client), so the screen, the API and the tests share one source
 * of truth.
 */

export const PILOT_PROFILES = ['DIGITAL_MATH', 'MIXED_LAYOUT_ASSESSMENT', 'IMAGE_BOOK', 'PHOTOGRAPHED_BOOK'] as const;
export type PilotProfile = (typeof PILOT_PROFILES)[number];
export const PILOT_CLASSES = ['Class 11', 'Class 12'] as const;

/**
 * Proposed thresholds. They are judgement calls, not measurements: change them
 * here and the gate, the screen and the tests follow. The page counts mirror the
 * stratified 25-page-per-profile shadow sample the pilot was designed around.
 */
export const GATE_THRESHOLDS = {
  completionRate: 0.9,
  questionRecall: 0.95,
  // Of everything a provider reports as a question, how much really is one.
  questionPrecision: 0.9,
  // A lead drawn from fewer scored pages than this is noise.
  minScoredPagesForLead: 10,
  formulaAgreement: 0.9,
  minPagesPerProfile: 25,
  minPagesPerClass: 25,
  minReviewedQuestions: 100,
} as const;

export interface PilotObservation {
  provider: string;
  profile: string | null;
  className: string | null;
  sample: string;
  status: string;
  latencyMs: number | null;
  model?: string | null;
  // The PDF's own question markers (born-digital pages only) or a hand count: a proxy for truth.
  expectedQuestions: number | null;
  foundQuestions: number | null;
  overDetection?: number | null;
  origin: 'DATABASE' | 'PILOT_FILE';
}

const isCompleted = (status: string) => status === 'COMPLETED';
// A provider that ran out of quota or credit tells us nothing about its quality.
const isUnavailable = (status: string) => status === 'PROVIDER_UNAVAILABLE';

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

export interface ProviderSummary {
  provider: string;
  attempted: number;
  completed: number;
  failed: number;
  unavailable: number;
  // completed / (attempted - unavailable): reliability when the provider was actually reachable.
  completionRate: number | null;
  medianLatencyMs: number | null;
  p90LatencyMs: number | null;
  // Share of the expected questions found, capped per page so over-detection cannot offset a miss.
  recall: { matched: number; expected: number; found: number; pages: number; rate: number; precision: number; f1: number } | null;
  // Extra markers beyond the expected count, as a share of the expected total.
  overDetectionRate: number | null;
  byProfile: Record<string, { attempted: number; completed: number }>;
}

export function summarizeProviders(observations: PilotObservation[]): ProviderSummary[] {
  const providers = [...new Set(observations.map(o => o.provider))].sort();
  return providers.map((provider): ProviderSummary => {
    const own = observations.filter(o => o.provider === provider);
    const completed = own.filter(o => isCompleted(o.status));
    const unavailable = own.filter(o => isUnavailable(o.status)).length;
    const reachable = own.length - unavailable;

    const scored = completed.filter(o => o.expectedQuestions != null && o.expectedQuestions > 0 && o.foundQuestions != null);
    const expected = scored.reduce((sum, o) => sum + (o.expectedQuestions ?? 0), 0);
    const matched = scored.reduce((sum, o) => sum + Math.min(o.foundQuestions ?? 0, o.expectedQuestions ?? 0), 0);
    const found = scored.reduce((sum, o) => sum + (o.foundQuestions ?? 0), 0);
    const extra = scored.reduce((sum, o) => sum + Math.max(0, (o.foundQuestions ?? 0) - (o.expectedQuestions ?? 0)), 0);
    const latencies = completed.map(o => o.latencyMs).filter((v): v is number => typeof v === 'number');

    const byProfile: ProviderSummary['byProfile'] = {};
    for (const o of own) {
      const key = o.profile ?? 'UNKNOWN';
      byProfile[key] ??= { attempted: 0, completed: 0 };
      byProfile[key].attempted++;
      if (isCompleted(o.status)) byProfile[key].completed++;
    }

    return {
      provider,
      attempted: own.length,
      completed: completed.length,
      failed: own.length - completed.length - unavailable,
      unavailable,
      completionRate: reachable > 0 ? completed.length / reachable : null,
      medianLatencyMs: percentile(latencies, 50),
      p90LatencyMs: percentile(latencies, 90),
      recall: expected > 0 ? (() => {
        const rate = matched / expected;
        const precision = found > 0 ? matched / found : 0;
        return { matched, expected, found, pages: scored.length, rate, precision, f1: rate + precision > 0 ? (2 * rate * precision) / (rate + precision) : 0 };
      })() : null,
      overDetectionRate: expected > 0 ? extra / expected : null,
      byProfile,
    };
  });
}

export interface Coverage {
  profiles: Array<{ profile: PilotProfile; pages: number; byProvider: Record<string, number>; met: boolean }>;
  classes: Array<{ className: string; pages: number; byProvider: Record<string, number>; met: boolean }>;
}

/** How much of the representative sample has real, completed provider evidence behind it. */
export function pilotCoverage(observations: PilotObservation[]): Coverage {
  const done = observations.filter(o => isCompleted(o.status));
  const count = (rows: PilotObservation[]) => {
    const byProvider: Record<string, number> = {};
    const pages = new Set(rows.map(o => o.sample));
    for (const o of rows) byProvider[o.provider] = (byProvider[o.provider] ?? 0) + 1;
    return { pages: pages.size, byProvider };
  };
  return {
    profiles: PILOT_PROFILES.map(profile => {
      const c = count(done.filter(o => o.profile === profile));
      return { profile, ...c, met: c.pages >= GATE_THRESHOLDS.minPagesPerProfile };
    }),
    classes: PILOT_CLASSES.map(className => {
      const c = count(done.filter(o => o.className === className));
      return { className, ...c, met: c.pages >= GATE_THRESHOLDS.minPagesPerClass };
    }),
  };
}

export interface PilotEconomics {
  runsMeasured: number;
  reviewMinutes: number;
  reviewedQuestions: number;
  spend: number;
  currency: string | null;
  verifiedQuestions: number;
}

export type CriterionStatus = 'MET' | 'NOT_MET' | 'NOT_MEASURED';
export interface Criterion {
  id: string;
  label: string;
  status: CriterionStatus;
  // What was measured, in words, or what is missing.
  detail: string;
}

export interface GateInput {
  summaries: ProviderSummary[];
  coverage: Coverage;
  economics: PilotEconomics;
  // Share of compared formula blocks the two providers agreed on, from page reconciliation.
  formulaAgreement: { compared: number; agreed: number } | null;
}

export interface Gate {
  verdict: 'NOT_READY' | 'READY_TO_DECIDE';
  criteria: Criterion[];
  blockers: string[];
  provisionalLead: { provider: string; reason: string } | null;
  statement: string;
}

const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
const fixed = (value: number, digits = 1) => value.toFixed(digits);

/** The lead on the evidence so far, among providers that were reachable and scored. Never a purchase recommendation. */
export function provisionalLead(summaries: ProviderSummary[]): Gate['provisionalLead'] {
  // Enough scored pages to mean something, and ranked on recall AND precision: a provider that finds
  // every question by also inventing many is not ahead.
  const scored = summaries.filter(s => s.recall && s.recall.pages >= GATE_THRESHOLDS.minScoredPagesForLead && s.completionRate !== null);
  if (scored.length === 0) return null;
  const ranked = [...scored].sort((a, b) =>
    (b.recall!.f1 - a.recall!.f1) || ((b.completionRate ?? 0) - (a.completionRate ?? 0)) || ((a.medianLatencyMs ?? Infinity) - (b.medianLatencyMs ?? Infinity)));
  const lead = ranked[0];
  return {
    provider: lead.provider,
    reason: `${pct(lead.recall!.rate)} of expected questions found and ${pct(lead.recall!.precision)} of detections real, over ${lead.recall!.pages} scored pages; ${pct(lead.completionRate ?? 0)} completed`,
  };
}

export function evaluateGate({ summaries, coverage, economics, formulaAgreement }: GateInput): Gate {
  const T = GATE_THRESHOLDS;
  const criteria: Criterion[] = [];

  const missingProfiles = coverage.profiles.filter(p => !p.met);
  criteria.push({
    id: 'coverage-profiles',
    label: 'All four source profiles sampled',
    status: missingProfiles.length === 0 ? 'MET' : 'NOT_MET',
    detail: missingProfiles.length === 0
      ? `Every profile has at least ${T.minPagesPerProfile} pages with completed provider results.`
      : coverage.profiles.map(p => `${p.profile.replaceAll('_', ' ').toLowerCase()} ${p.pages}/${T.minPagesPerProfile}`).join(' · '),
  });

  const missingClasses = coverage.classes.filter(c => !c.met);
  criteria.push({
    id: 'coverage-classes',
    label: 'Both Class 11 and Class 12 represented',
    status: missingClasses.length === 0 ? 'MET' : 'NOT_MET',
    detail: coverage.classes.map(c => `${c.className}: ${c.pages}/${T.minPagesPerClass} pages`).join(' · '),
  });

  const reliable = summaries.filter(s => s.completionRate !== null);
  const passingReliability = reliable.filter(s => (s.completionRate ?? 0) >= T.completionRate && s.completed >= 4);
  criteria.push({
    id: 'completion',
    label: `Completes at least ${pct(T.completionRate)} of the pages it is given`,
    status: reliable.length === 0 ? 'NOT_MEASURED' : passingReliability.length > 0 ? 'MET' : 'NOT_MET',
    detail: reliable.length === 0 ? 'No provider results yet.' : reliable.map(s => `${s.provider}: ${s.completed}/${s.attempted - s.unavailable}${s.unavailable ? ` (+${s.unavailable} unavailable)` : ''}`).join(' · '),
  });

  const withRecall = summaries.filter(s => s.recall);
  const passingRecall = withRecall.filter(s => (s.recall?.rate ?? 0) >= T.questionRecall);
  criteria.push({
    id: 'recall',
    label: `Finds at least ${pct(T.questionRecall)} of the questions on a page`,
    status: withRecall.length === 0 ? 'NOT_MEASURED' : passingRecall.length > 0 ? 'MET' : 'NOT_MET',
    detail: withRecall.length === 0 ? 'No page has a known expected question count.' : withRecall.map(s => `${s.provider}: ${pct(s.recall!.rate)} (${s.recall!.matched}/${s.recall!.expected} on ${s.recall!.pages} pages)`).join(' · '),
  });

  // The same provider has to clear both bars: finding everything by also inventing a lot, or being
  // precise while missing questions, is not good enough. Precision is judged among those that clear recall.
  const precisionCandidates = passingRecall.length > 0 ? passingRecall : withRecall;
  const passingPrecision = precisionCandidates.filter(s => (s.recall?.precision ?? 0) >= T.questionPrecision);
  criteria.push({
    id: 'precision',
    label: `At least ${pct(T.questionPrecision)} of what it reports as a question really is one`,
    status: withRecall.length === 0 ? 'NOT_MEASURED' : passingPrecision.length > 0 ? 'MET' : 'NOT_MET',
    detail: withRecall.length === 0 ? 'No page has a known expected question count.' : withRecall.map(s => `${s.provider}: ${pct(s.recall!.precision)} (${s.recall!.matched} real of ${s.recall!.found} reported)`).join(' · '),
  });

  criteria.push({
    id: 'formula',
    label: `Two providers agree on at least ${pct(T.formulaAgreement)} of formulas`,
    status: !formulaAgreement || formulaAgreement.compared === 0 ? 'NOT_MEASURED'
      : formulaAgreement.agreed / formulaAgreement.compared >= T.formulaAgreement ? 'MET' : 'NOT_MET',
    detail: !formulaAgreement || formulaAgreement.compared === 0
      ? 'No page has both a Gemini and a Mathpix reading compared yet (Provider Agreement screen). Agreement is a triage signal, not accuracy against the page.'
      : `${formulaAgreement.agreed}/${formulaAgreement.compared} formula blocks agree (${pct(formulaAgreement.agreed / formulaAgreement.compared)}).`,
  });

  for (const [id, label] of [
    ['option', 'Option accuracy'],
    ['solution', 'Solution-match precision'],
    ['figure', 'Figure retention'],
  ] as const) {
    criteria.push({ id, label, status: 'NOT_MEASURED', detail: 'Needs a hand-labelled sample to score against; nothing in the system records ground truth for this yet.' });
  }

  const enoughReview = economics.reviewedQuestions >= T.minReviewedQuestions;
  criteria.push({
    id: 'review-minutes',
    label: 'Review minutes per 100 questions',
    status: enoughReview ? 'MET' : 'NOT_MEASURED',
    detail: enoughReview
      ? `${fixed((economics.reviewMinutes / economics.reviewedQuestions) * 100)} minutes per 100 questions over ${economics.reviewedQuestions} reviewed (${economics.runsMeasured} run${economics.runsMeasured === 1 ? '' : 's'}).`
      : `Recorded for ${economics.reviewedQuestions} reviewed questions; at least ${T.minReviewedQuestions} are needed for a figure worth deciding on.`,
  });

  const costKnown = economics.spend > 0 && economics.verifiedQuestions > 0;
  criteria.push({
    id: 'cost-per-verified',
    label: 'Cost per verified question',
    status: costKnown ? 'MET' : 'NOT_MEASURED',
    detail: costKnown
      ? `${fixed(economics.spend / economics.verifiedQuestions, 2)} ${economics.currency ?? ''} per verified question (${economics.spend} spent, ${economics.verifiedQuestions} verified).`.replace('  ', ' ')
      : 'Needs the amount spent on a run and how many of its questions were verified.',
  });

  const blockers = criteria.filter(c => c.status !== 'MET').map(c => `${c.label}${c.status === 'NOT_MEASURED' ? ' (not measured)' : ' (not met)'}`);
  const verdict: Gate['verdict'] = blockers.length === 0 ? 'READY_TO_DECIDE' : 'NOT_READY';
  const lead = provisionalLead(summaries);

  return {
    verdict,
    criteria,
    blockers,
    provisionalLead: lead,
    statement: verdict === 'READY_TO_DECIDE'
      ? `Every criterion is measured and met. ${lead ? `${lead.provider} leads on the evidence (${lead.reason}).` : ''}`.trim()
      : `Do not buy a long-term plan yet: ${blockers.length} of ${criteria.length} criteria are not both measured and met.${lead ? ` On the evidence so far ${lead.provider} leads (${lead.reason}), which is a provisional reading, not a recommendation to buy.` : ''}`,
  };
}

/** Where a provider put its question count, by provider. Gemini structures questions; the OCR providers report markers. */
export function foundQuestionsFromMetrics(provider: string, metrics: unknown): number | null {
  if (!metrics || typeof metrics !== 'object') return null;
  const m = metrics as Record<string, unknown>;
  const value = provider === 'GEMINI_VISION' || provider === 'OPENAI_VISION' ? m.detectedQuestions : m.detectedQuestionMarkers;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
