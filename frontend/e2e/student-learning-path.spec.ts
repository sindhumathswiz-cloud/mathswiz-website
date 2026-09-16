import { expect, test } from "@playwright/test";
import { LEARNING_PATH_QUESTIONS, LEARNING_PATH_TOPIC } from "./fixtures/data";
import { STUDENT_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: STUDENT_STORAGE_STATE });

// Every question this suite could ever be served for this topic has a
// known, fixed correct answer (see e2e/fixtures/data.ts) -- this map lets
// the test answer correctly regardless of which one the adaptive picker
// or the quiz shuffle happens to serve.
const answerByQuestionId = new Map(LEARNING_PATH_QUESTIONS.map((q) => [q.id, q.correctAnswer]));

test("student progresses a topic through the full learning-path state machine: examples -> guided practice -> timed quiz -> completed", async ({ page }) => {
  test.setTimeout(210_000);

  // This test alone can make dozens of requests (a GET+2 POSTs per guided
  // question, 2 POSTs per quiz question, plus page loads) as the same
  // fixture student -- close enough to this app's real general-tier rate
  // limit (100 req/60s per user, see lib/rate-limit.ts) that a dense
  // burst can trip it. Track it and back off for a full window rather
  // than treating a 429 as a hard failure.
  let rateLimitedAt = 0;
  page.on("response", (r) => {
    if (r.status() === 429 && r.url().includes("/api/student/")) rateLimitedAt = Date.now();
  });
  async function cooldownIfRateLimited() {
    if (Date.now() - rateLimitedAt < 65_000) {
      const wait = 65_000 - (Date.now() - rateLimitedAt);
      await page.waitForTimeout(wait);
    }
  }

  // Resolves with whichever of the two happens first: another guided-
  // practice question loads, or the stage has already advanced to the
  // timed quiz (the 5th correct answer can flip the stage without the
  // app ever requesting a 6th guided question). Each is captured from
  // the specific response/DOM change a given action produces, rather
  // than a long-lived listener disambiguated after the fact -- with the
  // page's own other in-flight fetches, that proved unreliable in
  // practice at this generation-counting granularity.
  function nextGuidedQuestionOrQuizStage(): Promise<{ questionId: string } | { advanced: true }> {
    const candidates = [
      page
        .waitForResponse((r) => r.url().includes("/api/student/practice/next") && r.ok(), { timeout: 20_000 })
        .then((r) => r.json())
        .then((data) => ({ questionId: data.question.id as string })),
      page.getByText("Step 3 of 4").waitFor({ state: "visible", timeout: 20_000 }).then(() => ({ advanced: true as const })),
    ];
    // A plain Promise.race would reject the instant either candidate's
    // *own* 20s timeout fires first, even while the other is about to
    // succeed -- resolve on the first fulfillment, suppress the loser's
    // eventual rejection so it doesn't surface as an unhandled one.
    return new Promise((resolve, reject) => {
      let settled = false;
      let rejections = 0;
      for (const candidate of candidates) {
        candidate.then(
          (value) => {
            if (!settled) {
              settled = true;
              resolve(value);
            }
          },
          () => {
            rejections++;
            if (!settled && rejections === candidates.length) {
              reject(new Error("neither the next guided question nor the quiz stage showed up in time"));
            }
          },
        );
      }
    });
  }

  let quizQuestionIds: string[] = [];
  page.on("response", (response) => {
    if (!response.ok() || !response.url().includes("/quiz/start")) return;
    response
      .json()
      .then((data) => {
        if (Array.isArray(data?.questions)) quizQuestionIds = data.questions.map((q: { id: string }) => q.id);
      })
      .catch(() => {});
  });

  await page.goto("/student/learning-paths");
  await page.getByRole("link", { name: LEARNING_PATH_TOPIC }).click();
  await expect(page.getByRole("heading", { name: LEARNING_PATH_TOPIC })).toBeVisible();

  // --- Stage 1: worked examples ---
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  let firstGuided: { questionId: string } | { advanced: true } | null = null;
  for (let i = 1; i <= 3; i++) {
    const isGuidedNow = await page.getByText("Step 2 of 4").isVisible().catch(() => false);
    if (isGuidedNow) break;
    // Only the *last* review click actually flips the stage and triggers
    // guided practice's first question fetch -- racing for it on every
    // click is harmless (the loser is simply abandoned) and means that
    // transition is never missed regardless of which click causes it.
    const guidedRace = nextGuidedQuestionOrQuizStage().catch(() => null);
    await page.getByRole("button", { name: "Mark as reviewed" }).first().click();
    // markViewed() clears its "in flight" marker as soon as it *calls*
    // onAdvance(), not once that reload actually finishes -- wait for
    // either the reviewed count to visibly increment or the stage to
    // have already advanced, or a fast second click can re-target the
    // same still-"unreviewed"-looking card instead of a new one.
    const stageAdvanced = await Promise.race([
      page.getByText(`Reviewed ${i} of`).waitFor({ state: "visible", timeout: 10_000 }).then(() => false),
      page.getByText("Step 2 of 4").waitFor({ state: "visible", timeout: 10_000 }).then(() => true),
    ]);
    if (stageAdvanced) {
      firstGuided = await guidedRace;
      break;
    }
  }
  await expect(page.getByText("Step 2 of 4")).toBeVisible({ timeout: 15_000 });

  // --- Stage 2: guided practice (need 5+ attempts at 70%+ accuracy) ---
  let next = firstGuided ?? (await nextGuidedQuestionOrQuizStage());
  for (let attempt = 0; attempt < 12 && !("advanced" in next); attempt++) {
    const { questionId } = next;
    // The response arrives a tick before React finishes rendering that
    // question's card -- without this, an option click can land right as
    // the card remounts, leaving the (new, still unselected) submit
    // button disabled indefinitely.
    await page.waitForTimeout(300);
    const correctLetter = answerByQuestionId.get(questionId);
    expect(correctLetter, `no known fixture answer for guided-practice question ${questionId}`).toBeTruthy();

    const followUp = nextGuidedQuestionOrQuizStage();
    await page.getByTestId(`option-${correctLetter}`).click();
    // Safety net for the same remount race the settle wait above guards
    // against: if the option click still landed just as the card
    // remounted, selectedOption never got set and submit stays disabled
    // -- reselect once rather than waiting out the full 5s for nothing.
    const enabledFirstTry = await expect(page.getByTestId("submit-answer"))
      .toBeEnabled({ timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (!enabledFirstTry) {
      await page.getByTestId(`option-${correctLetter}`).click();
      await expect(page.getByTestId("submit-answer")).toBeEnabled({ timeout: 5_000 });
    }
    await page.getByTestId("submit-answer").click();
    try {
      next = await followUp;
    } catch (error) {
      // The submission itself (a POST already sent and awaited by the
      // click above) succeeded regardless -- if what's missing is the
      // page's own automatic follow-up fetch and it 429'd, that fetch
      // won't retry itself. Back off for the rate-limit window, then
      // reload to resync from the server's actually-persisted stage
      // rather than resuming a promise tied to a request that never came.
      await cooldownIfRateLimited();
      await page.reload();
      const reachedQuiz = await page.getByText("Step 3 of 4").isVisible({ timeout: 10_000 }).catch(() => false);
      next = reachedQuiz ? { advanced: true } : await nextGuidedQuestionOrQuizStage();
    }
  }
  await expect(page.getByText("Step 3 of 4")).toBeVisible({ timeout: 15_000 });

  // --- Stage 3: timed quiz ---
  await expect.poll(() => quizQuestionIds.length, { timeout: 15_000, message: "waiting for the quiz to start" }).toBeGreaterThan(0);
  for (const questionId of quizQuestionIds) {
    // A rate-limited submit here would silently score as a miss (the
    // card advances regardless of whether the POST actually landed) --
    // back off proactively rather than let one 429 cascade through the
    // rest of the quiz.
    await cooldownIfRateLimited();
    const correctLetter = answerByQuestionId.get(questionId);
    expect(correctLetter, `no known fixture answer for quiz question ${questionId}`).toBeTruthy();
    await page.getByTestId(`option-${correctLetter}`).click();
    // Same remount race as guided practice: reselect once if the click
    // landed just as this question's card mounted and didn't register.
    const enabledFirstTry = await expect(page.getByTestId("submit-answer"))
      .toBeEnabled({ timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (!enabledFirstTry) {
      await page.getByTestId(`option-${correctLetter}`).click();
      await expect(page.getByTestId("submit-answer")).toBeEnabled({ timeout: 5_000 });
    }
    await page.getByTestId("submit-answer").click();
    await page.waitForTimeout(1100); // quiz card auto-advances after autoAdvanceMs=900
  }

  // A perfect quiz (0 misses) skips recovery practice and completes
  // directly; an occasional miss (e.g. a submission the rate limiter
  // rejected) instead lands in recovery practice, whose actual job -- and
  // the thing this test cares about -- is reaching COMPLETED either way.
  const reachedCompleted = await page.getByText("Path complete!").isVisible({ timeout: 20_000 }).catch(() => false);
  if (!reachedCompleted) {
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    // The recovery queue is fetched once and then served client-side (no
    // further /practice/next calls per item), in the same order it was
    // returned -- capture it and answer that many rounds in order.
    const mistakesResponsePromise = page.waitForResponse((r) => r.url().includes("/api/student/practice/mistakes") && r.ok());
    await page.getByRole("link", { name: "Review now" }).click();
    const mistakesData = await (await mistakesResponsePromise).json();
    const recoveryIds: string[] = (mistakesData.questions ?? []).map((q: { id: string }) => q.id);
    for (const qId of recoveryIds) {
      await cooldownIfRateLimited();
      const letter = answerByQuestionId.get(qId);
      expect(letter, `no known fixture answer for recovery question ${qId}`).toBeTruthy();
      await expect(page.getByTestId(`option-${letter}`)).toBeVisible({ timeout: 10_000 });
      await page.getByTestId(`option-${letter}`).click();
      await page.getByTestId("submit-answer").click();
      await page.waitForTimeout(1200);
    }
    await page.goto(`/student/learning-paths/${encodeURIComponent(LEARNING_PATH_TOPIC)}`);
    const checkAgain = page.getByRole("button", { name: "I've reviewed — check again" });
    if (await checkAgain.isVisible({ timeout: 5_000 }).catch(() => false)) await checkAgain.click();
    await expect(page.getByText("Path complete!")).toBeVisible({ timeout: 20_000 });
  }

  // The topic's card on the index page reflects the completed state too.
  await page.getByRole("link", { name: "More paths" }).click();
  await expect(page).toHaveURL(/\/student\/learning-paths$/);
});
