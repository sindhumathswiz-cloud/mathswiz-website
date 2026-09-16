/**
 * Shared fixture constants for the authenticated e2e suite. Pure data --
 * no Prisma/server imports -- so both e2e/global-setup.ts (which writes
 * this data to the DB) and the spec files (which need to know it, e.g.
 * the correct answer for a fixture question) can import it directly.
 */

export const E2E_TEACHER = {
  mobileNumber: "9990000001",
  password: "E2eTeacher!Pass1",
  firstName: "E2E",
  lastName: "Teacher",
};

export const E2E_STUDENT = {
  mobileNumber: "9990000002",
  password: "E2eStudent!Pass1",
  firstName: "E2E",
  lastName: "Student",
};

export const E2E_BATCH_CODE = "E2EBATCH01";
export const E2E_BATCH_NAME = "E2E Test Batch";

// A free-form topic string -- the student-facing learning-paths and
// teacher-facing heatmap/interventions screens derive their topic lists
// from real Question/StudentProgress rows, so any string works here.
export const LEARNING_PATH_TOPIC = "E2E Fractions Learning Path";
export const WEAK_TOPIC = "E2E Weak Topic";
export const HEATMAP_TOPIC = "E2E Heatmap Topic";
// Its own topic (rather than leaving Practice Arena unfiltered) so
// answering-wrong-on-purpose here can never randomly land on -- and
// pollute the StudentProgress/mastery numbers of -- one of the other
// fixture topics above, which several other specs assert exact values for.
export const MISTAKES_TOPIC = "E2E Mistakes And Bookmarks Topic";

// The test-builder's topic filter is a hardcoded <select> (Calculus /
// Algebra / Mechanics), not a free-text field -- reuse one of those
// rather than a custom string so "Auto-pick by Filters" can find it.
export const BUILDER_TOPIC = "Mechanics";

export type FixtureQuestion = {
  id: string;
  content: string;
  options: string[];
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
};

const LETTERS = ["A", "B", "C", "D"] as const;

/**
 * Deterministic fixture questions: fixed ids (safe to upsert), a correct
 * answer that cycles through all four option letters (so tests exercise
 * real per-question answer-matching, not "always click A"), and an
 * explanation deliberately free of "correct/right ... option/answer ..."
 * phrasing -- src/lib/arena-answer.ts's extractClaimedAnswerIndex() scans
 * explanations for that pattern and would otherwise misread a fixture
 * explanation as claiming the wrong answer, dropping the question from
 * the adaptive pool.
 */
export function buildQuestions(
  slug: string,
  topic: string,
  count: number,
  difficulties: Array<"EASY" | "MEDIUM" | "HARD">,
): FixtureQuestion[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const correctIndex = i % 4;
    const correctValue = n * 2;
    const options = LETTERS.map((_, idx) => (idx === correctIndex ? String(correctValue) : String(correctValue + 10 + idx)));
    return {
      id: `e2e-${slug}-q${n}`,
      content: `E2E fixture question ${n} for ${topic}: what is ${n} + ${n}?`,
      options,
      correctAnswer: LETTERS[correctIndex],
      explanation: `Fixture question ${n}, generated only for automated end-to-end testing -- the arithmetic above is straightforward.`,
      difficulty: difficulties[i % difficulties.length],
      topic,
    };
  });
}

export const LEARNING_PATH_QUESTIONS = buildQuestions("lp", LEARNING_PATH_TOPIC, 16, ["EASY", "MEDIUM", "HARD"]);
export const WEAK_TOPIC_QUESTIONS = buildQuestions("wk", WEAK_TOPIC, 8, ["EASY"]);
export const HEATMAP_QUESTIONS = buildQuestions("hm", HEATMAP_TOPIC, 6, ["EASY", "MEDIUM"]);
export const BUILDER_QUESTIONS = buildQuestions("tb", BUILDER_TOPIC, 5, ["EASY"]);
export const MISTAKES_QUESTIONS = buildQuestions("mb", MISTAKES_TOPIC, 5, ["EASY", "MEDIUM"]);
