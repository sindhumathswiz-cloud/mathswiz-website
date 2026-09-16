import { expect, test } from "@playwright/test";
import { HEATMAP_QUESTIONS, HEATMAP_TOPIC, WEAK_TOPIC } from "./fixtures/data";
import { TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: TEACHER_STORAGE_STATE });

test("class heatmap shows real topic-mastery, wrong-answer, and at-risk data seeded for the batch", async ({ page }) => {
  await page.goto("/teacher/heatmap");

  // --- Topic mastery heat grid: the two seeded StudentProgress rows ---
  const weakRow = page.locator("div", { hasText: WEAK_TOPIC }).filter({ hasText: "% ·" }).first();
  await expect(weakRow).toContainText("20% · 1 rows");

  const heatmapRow = page.locator("div", { hasText: HEATMAP_TOPIC }).filter({ hasText: "% ·" }).first();
  await expect(heatmapRow).toContainText("60% · 1 rows");

  // --- Common wrong answers: 4 of the 6 seeded heatmap questions were
  // answered incorrectly (one wrong response each). ---
  const wrongQuestions = HEATMAP_QUESTIONS.slice(0, HEATMAP_QUESTIONS.length - 2);
  for (const q of wrongQuestions) {
    const card = page.locator("div.border.rounded-xl", { hasText: `Correct: ${q.correctAnswer}` }).filter({ hasText: "× 1" });
    await expect(card.first()).toBeVisible();
  }

  // --- Students needing support: the seeded student, below the 40%
  // threshold on WEAK_TOPIC. Not asserting an exact weak-topic count/avg
  // here -- another spec's student-mistakes-and-bookmarks test answers a
  // question wrong on its own dedicated topic as part of what it's
  // verifying, which legitimately starts that topic out below 40% too
  // when the full suite runs in order, growing this count by design. ---
  await expect(page.getByText("Students needing support")).toBeVisible();
  const atRiskCard = page.locator("div.border.rounded-lg", { hasText: "weak topic" }).first();
  await expect(atRiskCard).toContainText(/E2E Student/);
  await expect(atRiskCard).toContainText(/\d+ weak topics? · avg \d+(\.\d+)?%/);
  await expect(atRiskCard.getByRole("link", { name: "Assign support →" })).toHaveAttribute("href", "/teacher/interventions");
});
