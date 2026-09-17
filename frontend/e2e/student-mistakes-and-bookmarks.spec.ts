import { expect, test, type Page } from "@playwright/test";
import { MISTAKES_TOPIC } from "./fixtures/data";
import { STUDENT_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: STUDENT_STORAGE_STATE });

type ArenaQuestion = { id: string; correctAnswer: string };

/**
 * Tracks whichever question Practice Arena's /practice/next most recently
 * served, via a generation counter rather than an id diff -- the adaptive
 * picker can legitimately re-serve the same question twice in a row, and
 * an id-diff check would then wait forever for a "new" id that was never
 * coming.
 */
function trackArenaQuestions(page: Page) {
  let latest: ArenaQuestion | null = null;
  let generation = 0;
  page.on("response", (r) => {
    if (!r.ok() || !r.url().includes("/api/student/practice/next")) return;
    r.json()
      .then((data) => {
        if (data?.question?.id) {
          latest = { id: data.question.id, correctAnswer: data.question.correctAnswer };
          generation++;
        }
      })
      .catch(() => {});
  });
  return {
    generation: () => generation,
    /**
     * Waits for a new question (generation advances past `seenGeneration`).
     * The Practice Arena page surfaces a distinct, testable error state
     * (data-testid="practice-arena-error") when the fetch itself failed --
     * a real rate-limit hit (429) or a transient server error -- rather
     * than legitimately finding zero questions. On that signal, wait out
     * the rate-limit window (or a short beat for anything else) and click
     * "Try Again" rather than treating it as a hard failure.
     */
    async waitForNext(seenGeneration: number): Promise<ArenaQuestion> {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        if (generation > seenGeneration) return latest!;
        const errorPanel = page.getByTestId("practice-arena-error");
        if (await errorPanel.isVisible()) {
          const message = await errorPanel.textContent();
          const isRateLimited = /too many requests/i.test(message ?? "");
          await page.waitForTimeout(isRateLimited ? 65_000 : 1_000);
          await errorPanel.getByRole("button", { name: "Try Again" }).click().catch(() => {});
        } else {
          await page.waitForTimeout(500);
        }
      }
      throw new Error("Practice Arena never served a question within the deadline");
    },
  };
}

test("wrong answer lands in My Mistakes; flagging and bookmarking work from Practice Arena", async ({ page }) => {
  test.setTimeout(180_000);

  // Scoped to a dedicated topic -- leaving Practice Arena unfiltered risks
  // randomly being served one of the fixture questions another spec owns
  // (e.g. the weak-mastery topic), and deliberately answering it wrong
  // here would corrupt that other spec's expected mastery numbers.
  const tracker = trackArenaQuestions(page);
  await page.goto("/student/practice");
  await tracker.waitForNext(0);
  await expect(page.getByRole("button", { name: "Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByPlaceholder("e.g. Integrals, Probability").fill(MISTAKES_TOPIC);
  const genBeforeFilter = tracker.generation();
  await page.getByRole("button", { name: "Apply Filter" }).click();

  const q1 = await tracker.waitForNext(genBeforeFilter);
  await page.waitForTimeout(300); // let React finish rendering q1's card
  const wrongLetter = (["A", "B", "C", "D"] as const).find((l) => l !== q1.correctAnswer)!;
  await page.getByTestId(`option-${wrongLetter}`).click();
  await page.getByTestId("submit-answer").click();
  await expect(page.getByText("Detailed Resolution")).toBeVisible();

  const genAfterQ1 = tracker.generation();
  await page.getByRole("button", { name: "Next Challenge" }).click();
  const q2 = await tracker.waitForNext(genAfterQ1);
  await page.waitForTimeout(300);
  await page.getByTestId("bookmark-question").click();
  await expect(page.getByText("Bookmarked!")).toBeVisible();

  const genAfterQ2 = tracker.generation();
  await page.getByRole("button", { name: "Skip" }).click();
  const q3 = await tracker.waitForNext(genAfterQ2);
  await page.waitForTimeout(300);
  await page.getByTestId("flag-question").click();
  await expect(page.getByText("Pinned to My Mistakes notebook")).toBeVisible();

  // --- My Mistakes: both the auto-captured wrong answer (q1) and the
  // explicitly pinned question (q3) should be listed. ---
  await page.goto("/student/mistakes");
  await expect(page.getByTestId(`mistake-${q1.id}`)).toBeVisible();
  await expect(page.getByTestId(`mistake-${q1.id}`)).toContainText(/missed 1×/);
  await expect(page.getByTestId(`mistake-${q3.id}`)).toBeVisible();
  await expect(page.getByTestId(`mistake-${q3.id}`)).toContainText("pinned");

  // --- Bookmarks: the quick-bookmarked question (q2) should be filed
  // into a list reachable from the bookmarks index. ---
  await page.goto("/student/bookmarks");
  await page.getByTestId(/^bookmark-list-/).first().click();
  await expect(page.getByTestId(`bookmark-item-${q2.id}`)).toBeVisible();
});

test("student can create, browse, and study their own flashcards", async ({ page }) => {
  const front = "E2E flashcard front: derivative of x^2?";
  const back = "E2E flashcard back: 2x";

  await page.goto("/student/flashcards");
  await page.getByRole("button", { name: "New card" }).click();
  await page.getByPlaceholder("Front (question / prompt)").fill(front);
  await page.getByPlaceholder("Back (answer)").fill(back);
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(page.getByText(front)).toBeVisible();
  await expect(page.getByText(back)).toBeVisible();

  await page.getByRole("link", { name: "Study", exact: true }).click();
  await expect(page).toHaveURL(/\/student\/flashcards\/study$/);
  // Seeded fixtures never touch StudentFlashcard, so this is the only
  // card this student has -- shuffling a single-element array is a no-op,
  // so it always starts front-side-up (unflipped).
  await expect(page.getByText(front)).toBeVisible();
  await expect(page.getByText(back)).not.toBeVisible();
  await page.getByText("Tap to flip").click();
  await expect(page.getByText(back)).toBeVisible();
  await expect(page.getByText(front)).not.toBeVisible();
});
