import { expect, test } from "@playwright/test";
import { LEARNING_PATH_QUESTIONS, LEARNING_PATH_TOPIC } from "./fixtures/data";
import { STUDENT_STORAGE_STATE } from "./fixtures/storage-state";
import { waitVisible } from "./fixtures/wait";

test.use({ storageState: STUDENT_STORAGE_STATE });

// Every question this suite could ever be served for this topic has a
// known, fixed correct answer (see e2e/fixtures/data.ts) -- this map lets
// the test answer correctly regardless of which one the adaptive picker
// or the quiz shuffle happens to serve.
const answerByQuestionId = new Map(LEARNING_PATH_QUESTIONS.map((q) => [q.id, q.correctAnswer]));

test("student progresses a topic through the full learning-path state machine: examples -> guided practice -> timed quiz -> completed", async ({ page }) => {
  // Generous: worst case is several rate-limit windows back to back (each
  // recovery waits out a full 65s window), on top of the dozens of real
  // requests this test makes walking the actual state machine end to end.
  test.setTimeout(420_000);

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

  // Selects `letter` and submits, tolerating the remount race where a
  // new question's card replaces the old one right as the option click
  // lands: selectedOption never gets set on the still-disabled new card,
  // so submit stays disabled. Re-picks up to 6 times (not just once)
  // before giving up, since the same race can in principle repeat. Every
  // step in an attempt has its own short, explicit timeout -- an
  // unbounded click() here previously swallowed the test's *entire*
  // remaining time budget retrying a single stuck attempt instead of
  // failing fast enough for this loop to actually retry.
  async function selectAndSubmit(letter: string) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ok = await (async () => {
        try {
          await page.getByTestId(`option-${letter}`).click({ timeout: 3_000 });
          await expect(page.getByTestId("submit-answer")).toBeEnabled({ timeout: 3_000 });
          await page.getByTestId("submit-answer").click({ timeout: 3_000 });
          return true;
        } catch {
          return false;
        }
      })();
      if (ok) return;
      await page.waitForTimeout(500);
    }
    throw new Error(`submit-answer stayed disabled after repeated attempts to select option ${letter}`);
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

  // If what's missing is the page's own automatic follow-up fetch and it
  // 429'd, that fetch won't retry itself. Back off for the rate-limit
  // window, then reload to resync from the server's actually-persisted
  // stage rather than resuming a promise tied to a request that never
  // came. Loops rather than recovering once, since a reload's own fresh
  // fetch (plus whatever else shares this student's rate-limit budget)
  // can itself land back in the same window. Used both for the very
  // first guided question below and for every one after it in the loop.
  async function resolveOrRecoverFromRateLimit(pending: Promise<{ questionId: string } | { advanced: true }>) {
    let current = pending;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await current;
      } catch {
        await cooldownIfRateLimited();
        await page.reload();
        const reachedQuiz = await waitVisible(page.getByText("Step 3 of 4"), 10_000);
        if (reachedQuiz) return { advanced: true } as const;
        current = nextGuidedQuestionOrQuizStage();
      }
    }
    return await current;
  }

  // --- Stage 2: guided practice (need 5+ attempts at 70%+ accuracy) ---
  let next = firstGuided ?? (await resolveOrRecoverFromRateLimit(nextGuidedQuestionOrQuizStage()));
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
    await selectAndSubmit(correctLetter!);
    next = await resolveOrRecoverFromRateLimit(followUp);
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
    await selectAndSubmit(correctLetter!);
    await page.waitForTimeout(1100); // quiz card auto-advances after autoAdvanceMs=900
  }

  // A perfect quiz (0 misses) skips recovery practice and completes
  // directly; an occasional miss (e.g. a submission the rate limiter
  // rejected) instead lands in recovery practice, whose actual job -- and
  // the thing this test cares about -- is reaching COMPLETED either way.
  let reachedCompleted = await waitVisible(page.getByText("Path complete!"), 30_000);
  let reachedRecovery = reachedCompleted ? false : await waitVisible(page.getByText("Step 4 of 4"), 5_000);
  if (!reachedCompleted && !reachedRecovery) {
    // Neither showed up -- most likely the /quiz/complete call for the
    // last question itself got rate-limited and, unlike this test's own
    // actions, the app doesn't retry it, leaving the client stuck showing
    // the last-answered question forever. Reload: the stage is still
    // TIMED_QUIZ server-side too in that case, so this starts a fresh
    // (new, still fully known-answerable) quiz rather than resuming a
    // call that's never coming back.
    await cooldownIfRateLimited();
    const retryQuizPromise = page.waitForResponse((r) => r.url().includes("/quiz/start") && r.ok(), { timeout: 30_000 });
    await page.reload();
    const retryQuizData = await (await retryQuizPromise).json();
    const retryQuizIds: string[] = retryQuizData.questions.map((q: { id: string }) => q.id);
    for (const questionId of retryQuizIds) {
      await cooldownIfRateLimited();
      const correctLetter = answerByQuestionId.get(questionId);
      expect(correctLetter, `no known fixture answer for retried quiz question ${questionId}`).toBeTruthy();
      await selectAndSubmit(correctLetter!);
      await page.waitForTimeout(1100);
    }
    reachedCompleted = await waitVisible(page.getByText("Path complete!"), 30_000);
    reachedRecovery = reachedCompleted ? false : await waitVisible(page.getByText("Step 4 of 4"), 5_000);
  }
  if (!reachedCompleted) {
    expect(reachedRecovery, "learning path reached neither COMPLETED nor RECOVERY_PRACTICE after the quiz").toBe(true);
    // The recovery queue is fetched once and then served client-side (no
    // further /practice/next calls per item), in the same order it was
    // returned -- capture it and answer that many rounds in order. Must
    // match on scope=all specifically: Practice Arena's own page-mount
    // effect independently calls this same endpoint unscoped (for its
    // passive "N due" badge), and that call can race this one since both
    // fire the instant the "Review now" navigation lands.
    const mistakesResponsePromise = page.waitForResponse((r) => r.url().includes("/api/student/practice/mistakes") && r.url().includes("scope=all") && r.ok());
    await page.getByRole("link", { name: "Review now" }).click();
    const mistakesData = await (await mistakesResponsePromise).json();
    const recoveryIds: string[] = (mistakesData.questions ?? []).map((q: { id: string }) => q.id);
    for (const qId of recoveryIds) {
      await cooldownIfRateLimited();
      const letter = answerByQuestionId.get(qId);
      expect(letter, `no known fixture answer for recovery question ${qId}`).toBeTruthy();
      await expect(page.getByTestId(`option-${letter}`)).toBeVisible({ timeout: 10_000 });
      await selectAndSubmit(letter!);
      await page.waitForTimeout(1200);
    }
    await page.goto(`/student/learning-paths/${encodeURIComponent(LEARNING_PATH_TOPIC)}`);
    const checkAgain = page.getByRole("button", { name: "I've reviewed — check again" });
    if (await waitVisible(checkAgain, 5_000)) await checkAgain.click();
    await expect(page.getByText("Path complete!")).toBeVisible({ timeout: 20_000 });
  }

  // The topic's card on the index page reflects the completed state too.
  await page.getByRole("link", { name: "More paths" }).click();
  await expect(page).toHaveURL(/\/student\/learning-paths$/);
});
