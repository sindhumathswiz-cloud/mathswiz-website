import { roundMarks } from '@/lib/exam-patterns';
import type { ErrorType } from '@/lib/response-insight';

/**
 * Exam-quality analysis of one submitted attempt: what negative marking cost, how accuracy splits by difficulty,
 * whether the quick answers (guesses) paid for themselves, and how many marks were within reach. Pure and
 * deterministic: it only re-reads the marks the submit route already stored, so it can never disagree with the
 * student's score.
 */

export type DifficultyKey = 'EASY' | 'MEDIUM' | 'HARD';
const DIFFICULTIES: DifficultyKey[] = ['EASY', 'MEDIUM', 'HARD'];

/** An answer given in less than this share of the student's median time is read as a guess (as elsewhere in the report). */
export const GUESS_TIME_SHARE = 0.5;

export interface AnalysisSection {
  id: string;
  title: string;
  marksPerQuestion: number;
  negativeMarks: number;
  attemptLimit: number | null;
  questions: Array<{ questionId: string; choiceGroup: string | null }>;
}

export interface AnalysisResponse {
  questionId: string;
  status: string; // ANSWERED | MARKED_FOR_REVIEW | SKIPPED | OVER_LIMIT
  isCorrect: boolean;
  marksAwarded: number;
  timeSpent: number;
  topic: string | null;
  difficulty: string | null;
  /** Written answers are marked by a teacher; they are left out. */
  isWritten: boolean;
  errorType: ErrorType | null;
}

export interface SectionBreakdown {
  title: string;
  marksPerQuestion: number;
  negativeMarks: number;
  attempted: number;
  correct: number;
  wrong: number;
  accuracy: number | null; // percent
  /** Accuracy above which attempting a question beats leaving it, or null without negative marking. */
  breakEven: number | null;
  netMarks: number;
}

export interface DifficultyBreakdown {
  difficulty: DifficultyKey;
  attempted: number;
  correct: number;
  skipped: number;
  accuracy: number | null;
}

export type RecoverableReason = 'CARELESS' | 'EASY' | 'MEDIUM';

export interface RecoverableItem {
  questionId: string;
  reason: RecoverableReason;
  skipped: boolean;
  marks: number;
}

export interface ExamAnalysis {
  /** Marks lost to negative marking, as a positive number. */
  negativeMarksLost: number;
  /** Marks that right answers earned before any deduction. */
  grossMarks: number;
  netMarks: number;
  hasNegativeMarking: boolean;
  topicsHitByNegative: Array<{ topic: string; wrong: number; marksLost: number }>;
  sections: SectionBreakdown[];
  byDifficulty: DifficultyBreakdown[];
  guesses: { count: number; correct: number; netMarks: number; costMarks: number };
  recoverable: { total: number; byReason: Record<RecoverableReason, number>; items: RecoverableItem[] };
  takeaways: string[];
}

function difficultyOf(value: string | null): DifficultyKey {
  const upper = (value ?? '').toUpperCase();
  return upper === 'EASY' || upper === 'HARD' ? upper : 'MEDIUM';
}

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

const isAnswered = (r: AnalysisResponse) => r.status !== 'SKIPPED' && r.status !== 'OVER_LIMIT';

export function analyseAttempt(input: { sections: AnalysisSection[]; responses: AnalysisResponse[]; medianTime: number }): ExamAnalysis {
  const { sections, medianTime } = input;
  const scored = input.responses.filter((r) => !r.isWritten && r.status !== 'OVER_LIMIT');
  const byQuestion = new Map(scored.map((r) => [r.questionId, r]));
  const sectionOf = new Map<string, AnalysisSection>();
  for (const section of sections) for (const q of section.questions) sectionOf.set(q.questionId, section);

  // --- Marks: what the right answers earned and what the wrong ones took back ---
  let grossMarks = 0;
  let negativeMarksLost = 0;
  const topicLoss = new Map<string, { wrong: number; marksLost: number }>();
  for (const r of scored) {
    if (!isAnswered(r)) continue;
    if (r.isCorrect && r.marksAwarded > 0) grossMarks += r.marksAwarded;
    if (!r.isCorrect && r.marksAwarded < 0) {
      negativeMarksLost += -r.marksAwarded;
      const topic = r.topic?.trim() || 'General';
      const entry = topicLoss.get(topic) ?? { wrong: 0, marksLost: 0 };
      entry.wrong += 1;
      entry.marksLost += -r.marksAwarded;
      topicLoss.set(topic, entry);
    }
  }
  const hasNegativeMarking = sections.some((s) => s.negativeMarks > 0);

  // --- Per section: where the negative marking bit, and the accuracy a guess needs to pay ---
  const sectionRows: SectionBreakdown[] = sections.map((section) => {
    const answered = section.questions.map((q) => byQuestion.get(q.questionId)).filter((r): r is AnalysisResponse => !!r && isAnswered(r));
    const correct = answered.filter((r) => r.isCorrect).length;
    return {
      title: section.title,
      marksPerQuestion: section.marksPerQuestion,
      negativeMarks: section.negativeMarks,
      attempted: answered.length,
      correct,
      wrong: answered.length - correct,
      accuracy: percent(correct, answered.length),
      breakEven: section.negativeMarks > 0 ? Math.round((section.negativeMarks / (section.marksPerQuestion + section.negativeMarks)) * 100) : null,
      netMarks: roundMarks(answered.reduce((sum, r) => sum + r.marksAwarded, 0)),
    };
  }).filter((row) => row.attempted > 0 || sections.length === 1);

  // --- Accuracy by difficulty ---
  const byDifficulty: DifficultyBreakdown[] = DIFFICULTIES.map((difficulty) => {
    const rows = scored.filter((r) => difficultyOf(r.difficulty) === difficulty);
    const answered = rows.filter(isAnswered);
    const correct = answered.filter((r) => r.isCorrect).length;
    return { difficulty, attempted: answered.length, correct, skipped: rows.length - answered.length, accuracy: percent(correct, answered.length) };
  });

  // --- Guesses: quick answers, and whether they paid ---
  const guessed = scored.filter((r) => isAnswered(r) && medianTime > 0 && r.timeSpent < medianTime * GUESS_TIME_SHARE);
  const guessNet = roundMarks(guessed.reduce((sum, r) => sum + r.marksAwarded, 0));
  const guesses = {
    count: guessed.length,
    correct: guessed.filter((r) => r.isCorrect).length,
    netMarks: guessNet,
    costMarks: guessNet < 0 ? roundMarks(-guessNet) : 0,
  };

  // --- Marks within reach: wrong or skipped on easier questions, and careless slips on any ---
  const items: RecoverableItem[] = [];
  const reasonFor = (r: AnalysisResponse): RecoverableReason | null => {
    if (!r.isCorrect && isAnswered(r) && r.errorType === 'CARELESS') return 'CARELESS';
    const difficulty = difficultyOf(r.difficulty);
    return difficulty === 'EASY' ? 'EASY' : difficulty === 'MEDIUM' ? 'MEDIUM' : null;
  };
  for (const section of sections) {
    const own = section.questions.map((q) => byQuestion.get(q.questionId)).filter((r): r is AnalysisResponse => !!r);
    for (const r of own) {
      if (!isAnswered(r) || r.isCorrect) continue;
      const reason = reasonFor(r);
      if (reason) items.push({ questionId: r.questionId, reason, skipped: false, marks: roundMarks(section.marksPerQuestion - r.marksAwarded) });
    }
    // A blank question is only a missed chance if the section had room: "attempt any N" and internal choice
    // mean some blanks were never going to count.
    const slotKeys = new Set(section.questions.map((q) => q.choiceGroup ?? q.questionId));
    const slots = section.attemptLimit != null ? Math.min(section.attemptLimit, slotKeys.size) : slotKeys.size;
    const answeredSlots = new Set(section.questions.filter((q) => { const r = byQuestion.get(q.questionId); return r && isAnswered(r); }).map((q) => q.choiceGroup ?? q.questionId));
    let free = Math.max(0, slots - answeredSlots.size);
    const blanks = section.questions
      .filter((q) => { const r = byQuestion.get(q.questionId); return r && !isAnswered(r) && !answeredSlots.has(q.choiceGroup ?? q.questionId); })
      .map((q) => byQuestion.get(q.questionId)!)
      .sort((a, b) => DIFFICULTIES.indexOf(difficultyOf(a.difficulty)) - DIFFICULTIES.indexOf(difficultyOf(b.difficulty)));
    const takenSlots = new Set<string>();
    for (const r of blanks) {
      if (free <= 0) break;
      const group = section.questions.find((q) => q.questionId === r.questionId)?.choiceGroup ?? r.questionId;
      if (takenSlots.has(group)) continue;
      const reason = reasonFor(r);
      if (!reason) continue;
      takenSlots.add(group);
      free -= 1;
      items.push({ questionId: r.questionId, reason, skipped: true, marks: roundMarks(section.marksPerQuestion) });
    }
  }
  const byReason: Record<RecoverableReason, number> = { CARELESS: 0, EASY: 0, MEDIUM: 0 };
  for (const item of items) byReason[item.reason] = roundMarks(byReason[item.reason] + item.marks);
  const recoverableTotal = roundMarks(items.reduce((sum, item) => sum + item.marks, 0));

  // --- A few plain sentences, only where the numbers support them ---
  const takeaways: string[] = [];
  if (negativeMarksLost > 0) {
    const worst = [...topicLoss.entries()].sort((a, b) => b[1].marksLost - a[1].marksLost)[0];
    takeaways.push(`Wrong answers cost you ${roundMarks(negativeMarksLost)} marks in deductions${worst && topicLoss.size > 1 ? `, most of it in ${worst[0]}` : ''}.`);
  }
  if (guesses.costMarks > 0) {
    takeaways.push(`Your ${guesses.count} quick answers netted −${guesses.costMarks} marks. Leaving them blank would have scored higher.`);
  } else if (guesses.count >= 3 && guesses.netMarks > 0) {
    takeaways.push(`Your ${guesses.count} quick answers netted +${guesses.netMarks} marks, so they paid off this time.`);
  }
  const easy = byDifficulty[0];
  if (easy.attempted >= 3 && easy.accuracy != null && easy.accuracy < 80) {
    takeaways.push(`You got ${easy.accuracy}% of the easy questions right. Those are the marks to protect first.`);
  }
  if (recoverableTotal > 0) {
    takeaways.push(`About ${recoverableTotal} marks were within reach on easier questions and careless slips.`);
  }

  return {
    negativeMarksLost: roundMarks(negativeMarksLost),
    grossMarks: roundMarks(grossMarks),
    netMarks: roundMarks(grossMarks - negativeMarksLost),
    hasNegativeMarking,
    topicsHitByNegative: [...topicLoss.entries()].map(([topic, v]) => ({ topic, wrong: v.wrong, marksLost: roundMarks(v.marksLost) })).sort((a, b) => b.marksLost - a.marksLost),
    sections: sectionRows,
    byDifficulty,
    guesses,
    recoverable: { total: recoverableTotal, byReason, items },
    takeaways,
  };
}
