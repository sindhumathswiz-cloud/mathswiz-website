import { findExamPattern, examMaxMarks, roundMarks } from './exam-patterns';

/**
 * What the Mock Exams list shows for one assignment: the paper's shape (sections,
 * the most it can score) and the student's history on it. Pure, so it is tested
 * rather than trusted.
 */

interface RawAttempt { totalScore: number; endTime?: string | Date | null; startTime?: string | Date | null }
interface RawSection { title: string; marksPerQuestion?: number | null; attemptLimit?: number | null; _count?: { questions: number } }
interface RawTest {
  examPattern?: string | null;
  totalMarks?: number | null;
  sections?: RawSection[];
  attempts?: RawAttempt[];
}

export type Trend = 'UP' | 'DOWN' | 'FLAT' | null;

export interface MockExamSummary {
  patternName: string | null;
  sections: Array<{ title: string; questions: number; rule: string | null }>;
  totalQuestions: number;
  maxMarks: number;
  attemptsUsed: number;
  bestScore: number | null;
  lastScore: number | null;
  trend: Trend;
}

const timeOf = (attempt: RawAttempt) => new Date(attempt.endTime ?? attempt.startTime ?? 0).getTime();

export function summarizeMockExam(test: RawTest): MockExamSummary {
  const sections = (test.sections ?? []).map(section => {
    const questions = section._count?.questions ?? 0;
    const limit = section.attemptLimit != null && section.attemptLimit > 0 && section.attemptLimit < questions ? section.attemptLimit : null;
    return { title: section.title, questions, limit, marks: section.marksPerQuestion ?? 4 };
  });

  const computedMax = examMaxMarks(sections.map(s => ({ questionCount: s.questions, attemptLimit: s.limit, marksPerQuestion: s.marks })));
  // The sections give the real ceiling (attempt-any-N papers score less than questions x marks);
  // totalMarks is the fallback for a paper whose sections are not loaded.
  const maxMarks = sections.length > 0 ? computedMax : roundMarks(test.totalMarks ?? 0);

  const attempts = [...(test.attempts ?? [])].sort((a, b) => timeOf(a) - timeOf(b));
  const scores = attempts.map(a => a.totalScore);
  let trend: Trend = null;
  if (scores.length >= 2) {
    const delta = roundMarks(scores[scores.length - 1] - scores[scores.length - 2]);
    trend = delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'FLAT';
  }

  return {
    patternName: findExamPattern(test.examPattern)?.name ?? null,
    sections: sections.map(s => ({ title: s.title, questions: s.questions, rule: s.limit ? `any ${s.limit}` : null })),
    totalQuestions: sections.reduce((sum, s) => sum + s.questions, 0),
    maxMarks,
    attemptsUsed: attempts.length,
    bestScore: scores.length ? roundMarks(Math.max(...scores)) : null,
    lastScore: scores.length ? roundMarks(scores[scores.length - 1]) : null,
    trend,
  };
}
