import { expect, test } from "@playwright/test";
import { WEAK_TOPIC } from "./fixtures/data";
import { STUDENT_STORAGE_STATE, TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: TEACHER_STORAGE_STATE });

test("converting a low-mastery suggestion into a Practice intervention generates a real test the student can start", async ({ page, browser }) => {
  test.setTimeout(90_000);

  // The seeded batch is the teacher's only batch, so it's auto-selected.
  await page.goto("/teacher/interventions");
  const suggestionCard = page.locator("form", { hasText: WEAK_TOPIC });
  await expect(suggestionCard).toBeVisible();
  await expect(suggestionCard.getByText("Current mastery: 20%")).toBeVisible();
  await expect(suggestionCard.locator('select[name="type"]')).toHaveValue("PRACTICE");

  const reloadResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/teacher/interventions?batchId=") && r.request().method() === "GET" && r.ok(),
  );
  await suggestionCard.getByRole("button", { name: "Assign" }).click();
  const reloadResponse = await reloadResponsePromise;
  const { interventions } = await reloadResponse.json();
  const created = interventions.find((i: any) => i.topic === WEAK_TOPIC);
  expect(created, "the newly-created intervention should be in the reloaded list").toBeTruthy();
  expect(created.testAssignment?.test?.id, "PRACTICE intervention should have generated a real Test/TestAssignment").toBeTruthy();
  const generatedTestId: string = created.testAssignment.test.id;

  await expect(page.getByText(`✓ Practice set generated (${created.testAssignment.test.title})`)).toBeVisible();

  // --- Student sees a working "Start practice" CTA into the generated test ---
  const studentContext = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
  const studentPage = await studentContext.newPage();
  await studentPage.goto("/student/interventions");
  const startLink = studentPage.getByRole("link", { name: "Start practice" });
  await expect(startLink).toBeVisible();
  await expect(startLink).toHaveAttribute("href", `/student/tests/${generatedTestId}/take`);
  await startLink.click();
  await expect(studentPage.getByRole("button", { name: "Start Examination" })).toBeVisible({ timeout: 15_000 });

  await studentContext.close();
});
