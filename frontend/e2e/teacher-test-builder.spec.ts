import { expect, test } from "@playwright/test";
import { BUILDER_TOPIC, E2E_BATCH_NAME } from "./fixtures/data";
import { STUDENT_STORAGE_STATE, TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: TEACHER_STORAGE_STATE });

const TEST_TITLE = "E2E Builder Test";

test("teacher builds a test by filters, saves it as a template, duplicates it, publishes and assigns the original, and the student can take it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  page.on("dialog", (dialog) => {
    console.log(`[dialog] ${dialog.type()}: ${dialog.message()}`);
    dialog.accept().catch(() => {});
  });

  // --- Build: structured filter-pick (no AI) against the seeded Mechanics fixtures ---
  await page.goto("/teacher/tests/create");
  await page.getByPlaceholder("e.g. Midterm Examination").fill(TEST_TITLE);
  await page.getByTestId("filter-topic-select").selectOption({ label: BUILDER_TOPIC });
  await page.getByTestId("filter-type-select").selectOption({ label: "Single MCQ" });

  await page.getByRole("button", { name: "Auto-pick by Filters" }).click();
  await page.getByTestId("pick-count-input").fill("2");
  const pickResponsePromise = page.waitForResponse((r) => r.url().includes("/api/teacher/tests/pick-questions") && r.ok());
  await page.getByRole("button", { name: "Pick Questions" }).click();
  const pickResponse = await pickResponsePromise;
  const { questions: pickedQuestions } = await pickResponse.json();
  expect(pickedQuestions.length).toBeGreaterThan(0);
  const answerByQuestionId = new Map(pickedQuestions.map((q: { id: string; correctAnswer: string }) => [q.id, q.correctAnswer]));

  // --- Save as a reusable Worksheet template ---
  await page.getByTestId("save-as-select").selectOption({ label: "Reusable template — Worksheet" });
  const saveResponsePromise = page.waitForResponse((r) => r.url().endsWith("/api/teacher/tests") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save Test" }).click();
  const saveResponse = await saveResponsePromise;
  const { test: savedTest } = await saveResponse.json();
  const testId: string = savedTest.id;
  await expect(page).toHaveURL(/\/teacher\/tests$/);

  // --- Reusable-templates view shows it with the right badge ---
  await page.getByRole("button", { name: "Reusable templates" }).click();
  const card = page.getByTestId(`test-card-${testId}`);
  await expect(card).toBeVisible();
  await expect(card.getByText("Worksheet")).toBeVisible();
  await expect(card.getByRole("heading", { name: TEST_TITLE, exact: true })).toBeVisible();

  // --- Duplicate: an independent copy, still filed as a template ---
  const duplicateResponsePromise = page.waitForResponse((r) => r.url().includes(`/api/teacher/tests/${testId}/duplicate`) && r.ok());
  await card.getByTitle("Duplicate as a new, independent test").click();
  await duplicateResponsePromise;
  await expect(page.getByRole("heading", { name: `${TEST_TITLE} (copy)`, exact: true })).toBeVisible();

  // --- Publish & assign the original to the seeded batch ---
  // Wait for the page's own initial `tests/list` fetch (which seeds
  // isPublished on mount) to resolve before toggling publish -- otherwise
  // that fetch can resolve *after* the toggle and clobber the just-set
  // isPublished back to its stale pre-toggle value.
  const initialListPromise = page.waitForResponse((r) => r.url().includes("/api/teacher/tests/list") && r.ok());
  await page.goto(`/teacher/tests/${testId}/assign`);
  await initialListPromise;
  await expect(page.getByRole("button", { name: "Unpublished — click to publish" })).toBeVisible();
  await page.getByRole("button", { name: "Unpublished — click to publish" }).click();
  await expect(page.getByRole("button", { name: "Published" })).toBeVisible();
  // The page's mount effects (React dev-mode double-invokes them) can fire
  // more than one /tests/list request; a slow duplicate resolving after
  // the toggle above would clobber isPublished back to stale. Give any
  // such straggler time to land, then confirm the published state held.
  await page.waitForTimeout(2000);
  await expect(page.getByRole("button", { name: "Published" })).toBeVisible();

  await page.getByRole("button", { name: "Whole batch" }).click();
  await page.getByTestId("assign-batch-select").selectOption({ label: E2E_BATCH_NAME });
  const assignResponsePromise = page.waitForResponse((r) => r.url().includes("/api/teacher/tests/assign") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Assign" }).click();
  await assignResponsePromise;
  const assignmentsPanel = page.locator("div", { has: page.getByRole("heading", { name: "Existing assignments" }) }).last();
  await expect(assignmentsPanel.getByText(E2E_BATCH_NAME)).toBeVisible();

  // --- Student takes the assigned test ---
  const studentContext = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
  const studentPage = await studentContext.newPage();
  await studentPage.goto(`/student/tests/${testId}/take`);
  await studentPage.getByRole("button", { name: "Start Examination" }).click();

  // Answer the first question correctly (start/submit gating and option
  // selection are what's under test here, not a full multi-question run).
  const firstAnswer = (answerByQuestionId as Map<string, string>).values().next().value as string;
  await expect(studentPage.getByTestId(`option-original-${firstAnswer}`)).toBeVisible();
  await studentPage.getByTestId(`option-original-${firstAnswer}`).click();

  studentPage.once("dialog", (dialog) => dialog.accept());
  const submitResponsePromise = studentPage.waitForResponse((r) => r.url().includes(`/api/student/tests/${testId}/submit`) && r.ok());
  await studentPage.getByRole("button", { name: "Terminate & Submit" }).click();
  const submitResponse = await submitResponsePromise;
  const submitData = await submitResponse.json();
  expect(submitData.status).toBe("SUBMITTED");
  expect(submitData.totalCorrect).toBeGreaterThanOrEqual(1);

  await studentContext.close();
});
