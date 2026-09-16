import { expect, test } from "@playwright/test";
import { MISTAKES_TOPIC } from "./fixtures/data";
import { STUDENT_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: STUDENT_STORAGE_STATE });

type ArenaQuestion = { id: string; correctAnswer: string };

/** Resolves once the next /practice/next response lands, carrying its question. */
function nextArenaQuestion(page: import("@playwright/test").Page): Promise<ArenaQuestion> {
  return page
    .waitForResponse((r) => r.url().includes("/api/student/practice/next") && r.ok(), { timeout: 25_000 })
    .then((r) => r.json())
    .then((data) => ({ id: data.question.id, correctAnswer: data.question.correctAnswer }));
}

test("wrong answer lands in My Mistakes; flagging and bookmarking work from Practice Arena", async ({ page }) => {
  test.setTimeout(150_000);

  // Scoped to a dedicated topic -- leaving Practice Arena unfiltered risks
  // randomly being served one of the fixture questions another spec owns
  // (e.g. the weak-mastery topic), and deliberately answering it wrong
  // here would corrupt that other spec's expected mastery numbers.
  //
  // The Setup toggle only exists once the page's own unfiltered initial
  // fetch has served *some* question. The prior spec in this suite
  // (student-learning-path) is itself request-heavy, and this app's
  // general-tier rate limit (100 req/60s per user, see lib/rate-limit.ts)
  // is real and shared across specs running as the same fixture student
  // -- landing here already past that budget serves "Arena Empty" (a 429,
  // silently swallowed into an empty state) instead of a question.
  // Reloading immediately would only add to the same 60s window, so wait
  // it out once rather than hammering retries.
  let rateLimited = false;
  const rateLimitListener = (r: import("@playwright/test").Response) => {
    if (r.url().includes("/api/student/practice/next") && r.status() === 429) rateLimited = true;
  };
  page.on("response", rateLimitListener);
  await page.goto("/student/practice");
  let setupVisible = await page.getByRole("button", { name: "Setup" }).isVisible({ timeout: 15_000 }).catch(() => false);
  if (!setupVisible && rateLimited) {
    await page.waitForTimeout(65_000);
    await page.reload();
    setupVisible = await page.getByRole("button", { name: "Setup" }).isVisible({ timeout: 15_000 }).catch(() => false);
  }
  page.off("response", rateLimitListener);
  expect(setupVisible, "Practice Arena never served an initial question (Arena Empty)").toBe(true);
  await page.getByRole("button", { name: "Setup" }).click();
  await page.getByPlaceholder("e.g. Integrals, Probability").fill(MISTAKES_TOPIC);

  // Each question is captured from the specific response the *triggering
  // action* produced (registered just before that action), rather than a
  // long-lived listener disambiguated after the fact -- with the page's
  // own unfiltered initial fetch also in flight, a listener spanning
  // multiple actions can't reliably tell which response belongs to which.
  const q1Promise = nextArenaQuestion(page);
  await page.getByRole("button", { name: "Apply Filter" }).click();
  const q1 = await q1Promise;
  await page.waitForTimeout(300); // let React finish rendering q1's card

  const wrongLetter = (["A", "B", "C", "D"] as const).find((l) => l !== q1.correctAnswer)!;
  await page.getByTestId(`option-${wrongLetter}`).click();
  await page.getByTestId("submit-answer").click();
  await expect(page.getByText("Detailed Resolution")).toBeVisible();

  const q2Promise = nextArenaQuestion(page);
  await page.getByRole("button", { name: "Next Challenge" }).click();
  const q2 = await q2Promise;
  await page.waitForTimeout(300);
  await page.getByTestId("bookmark-question").click();
  await expect(page.getByText("Bookmarked!")).toBeVisible();

  const q3Promise = nextArenaQuestion(page);
  await page.getByRole("button", { name: "Skip" }).click();
  const q3 = await q3Promise;
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
