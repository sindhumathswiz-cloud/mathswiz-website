import { expect, test } from "@playwright/test";
import { BUILDER_QUESTIONS, E2E_BATCH_NAME, NUMERIC_QUESTION, WRITTEN_QUESTION } from "./fixtures/data";
import { STUDENT_STORAGE_STATE, TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: TEACHER_STORAGE_STATE });

const TITLE = "E2E JEE-style Mock";

// The paper: Section A (2 MCQs, +4/-1), Section B (3 MCQs, attempt any 2, +4/0),
// Section C (1 numerical, +4/0). Most it can score: 8 + 8 + 4 = 20.
// Fixture answers cycle A, B, C, D, A for q1..q5.
test("a mock exam is built in a real pattern, sat on the exam screen, scored per section and shown in the list", async ({ request, browser }) => {
  test.setTimeout(120_000);

  // --- Teacher: build, publish and assign (the builder UI has its own spec) ---
  const batches = await (await request.get("/api/teacher/batches")).json();
  const batch = batches.find((b: { name: string }) => b.name === E2E_BATCH_NAME);
  expect(batch, "the seeded batch").toBeTruthy();

  const q = (n: number) => ({ id: BUILDER_QUESTIONS[n - 1].id });
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: TITLE,
      mode: "PRACTICE",
      duration: 60,
      totalMarks: 20,
      templateType: "MOCK_EXAM",
      examPattern: "JEE_MAIN_MATHS",
      sections: [
        { title: "Section A", marksPerQuestion: 4, negativeMarks: 1, questions: [q(1), q(2)] },
        { title: "Section B", marksPerQuestion: 4, negativeMarks: 0, attemptLimit: 2, questions: [q(3), q(4), q(5)] },
        { title: "Section C", marksPerQuestion: 4, negativeMarks: 0, questions: [{ id: NUMERIC_QUESTION.id }] },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const testId: string = (await created.json()).test.id;
  expect((await request.patch(`/api/teacher/tests/${testId}/publish`, { data: { isPublished: true } })).ok()).toBeTruthy();
  expect((await request.post("/api/teacher/tests/assign", { data: { testId, batchId: batch.id, maxAttempts: 2 } })).ok()).toBeTruthy();

  // --- Student: the list describes the paper before it is started ---
  const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
  const page = await context.newPage();
  await page.goto("/student/mock-tests");
  const card = page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: TITLE, exact: true }) }).last();
  await expect(card).toContainText(/JEE Main/);
  await expect(card).toContainText("20 marks");
  await expect(card).toContainText("Section B · 3 (attempt any 2)");
  await expect(card).toContainText("2 of 2 attempts left");
  await card.getByRole("link", { name: "Start Mock Exam" }).click();

  // --- Instructions state the rules before the clock starts ---
  await expect(page.getByText("Attempt any 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Start Examination" }).click();

  // --- Section A: one right, one wrong (-1) ---
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText("0/2 answered");
  await page.getByTestId("option-original-A").click();
  await page.getByRole("button", { name: /Save & Continue/ }).click();
  await page.getByTestId("option-original-C").click(); // q2's answer is B
  await expect(page.getByRole("navigation", { name: "Sections" })).toContainText("2/2 answered");

  // --- Section B: attempt any 2; a third answer is refused with the reason ---
  await page.getByRole("button", { name: /Section B/ }).click();
  await page.getByTestId("option-original-C").click(); // q3: correct
  await page.getByRole("button", { name: /^Question 2,/ }).click();
  await page.getByTestId("option-original-D").click(); // q4: correct
  await page.getByRole("button", { name: /^Question 3,/ }).click();
  await page.getByTestId("option-original-A").click(); // q5: over the limit
  await expect(page.getByText("You can answer only 2 questions in Section B")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Question 3, answered/ })).toHaveCount(0);

  // --- Section C: a numerical answer is typed, not picked ---
  await page.getByRole("button", { name: /Section C/ }).click();
  await expect(page.getByTestId("option-original-A")).toHaveCount(0);
  await page.getByTestId("numeric-answer").fill("12.5");

  // --- Review before submitting, then submit ---
  const submitResponse = page.waitForResponse((r) => r.url().includes(`/api/student/tests/${testId}/submit`) && r.ok());
  await page.getByRole("button", { name: "Review & Submit" }).click();
  const summary = page.getByRole("dialog", { name: "Review your paper" });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("Section B");
  await expect(summary).toContainText("attempt any 2");
  await summary.getByRole("button", { name: "Submit exam" }).click();
  const result = await (await submitResponse).json();

  // 3 (A: +4, -1) + 8 (B: both right) + 4 (C: 12.5 matched numerically) = 15 of 20.
  expect(result.totalScore).toBe(15);
  expect(result.totalCorrect).toBe(4);
  expect(result.totalIncorrect).toBe(1);
  await expect(page.getByText("Paper submitted")).toBeVisible();
  await expect(page.getByText("/ 20")).toBeVisible();

  // --- The list now shows the result and the attempts left ---
  await page.goto("/student/mock-tests");
  const after = page.locator("div.rounded-2xl", { has: page.getByRole("heading", { name: TITLE, exact: true }) }).last();
  await expect(after).toContainText("Best 15 / 20");
  await expect(after).toContainText("1 of 2 attempts left");

  await context.close();
});

// Regression: the clock used to run out inside a callback frozen at the moment the
// exam began, so the automatic submit sent a blank paper and the answers were lost.
test("when time runs out the paper is submitted automatically with the answers given so far", async ({ request, browser }) => {
  test.setTimeout(150_000);

  const batches = await (await request.get("/api/teacher/batches")).json();
  const batch = batches.find((b: { name: string }) => b.name === E2E_BATCH_NAME);
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: "E2E One Minute Mock",
      mode: "PRACTICE",
      duration: 1,
      totalMarks: 8,
      templateType: "MOCK_EXAM",
      sections: [{ title: "Section A", marksPerQuestion: 4, negativeMarks: 1, questions: [{ id: BUILDER_QUESTIONS[0].id }, { id: BUILDER_QUESTIONS[1].id }] }],
    },
  });
  expect(created.ok()).toBeTruthy();
  const testId: string = (await created.json()).test.id;
  await request.patch(`/api/teacher/tests/${testId}/publish`, { data: { isPublished: true } });
  await request.post("/api/teacher/tests/assign", { data: { testId, batchId: batch.id } });

  const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`/student/tests/${testId}/take`);
  await page.getByRole("button", { name: "Start Examination" }).click();
  await page.getByTestId("option-original-A").click(); // q1: correct
  // The exam is a full-screen layer: no student sidebar to click away to.
  const sidebarReachable = await page.getByRole("link", { name: "Dashboard" }).evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  });
  expect(sidebarReachable, "the student sidebar must be covered during an exam").toBe(false);
  await expect(page.getByRole("button", { name: /^Question 1, answered/ })).toBeVisible();
  await page.waitForTimeout(400);

  const shotDir = process.env.EXAM_SHOTS;
  if (shotDir) await page.screenshot({ path: `${shotDir}/exam-desktop.png` });

  // No click on submit: the deadline does it.
  const submit = await page.waitForResponse((r) => r.url().includes(`/api/student/tests/${testId}/submit`), { timeout: 100_000 });
  expect(submit.ok()).toBeTruthy();
  const body = await submit.json();
  expect(body.totalCorrect).toBe(1);
  expect(body.totalScore).toBe(4);
  await expect(page.getByText("Paper submitted")).toBeVisible();

  await context.close();
});

test("the exam screen works on a phone: palette in a drawer, numeric keypad usable", async ({ request, browser }) => {
  const batches = await (await request.get("/api/teacher/batches")).json();
  const batch = batches.find((b: { name: string }) => b.name === E2E_BATCH_NAME);
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: "E2E Phone Mock",
      mode: "PRACTICE",
      duration: 30,
      totalMarks: 8,
      templateType: "MOCK_EXAM",
      sections: [
        { title: "Section A", marksPerQuestion: 4, negativeMarks: 1, questions: [{ id: BUILDER_QUESTIONS[0].id }] },
        { title: "Section B", marksPerQuestion: 4, negativeMarks: 0, questions: [{ id: NUMERIC_QUESTION.id }] },
      ],
    },
  });
  const testId: string = (await created.json()).test.id;
  await request.patch(`/api/teacher/tests/${testId}/publish`, { data: { isPublished: true } });
  await request.post("/api/teacher/tests/assign", { data: { testId, batchId: batch.id } });

  const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE, viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`/student/tests/${testId}/take`);
  await page.getByRole("button", { name: "Start Examination" }).click();

  // The side palette is hidden on a phone; the Questions button opens it as a drawer.
  await expect(page.getByRole("button", { name: "Review & Submit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Questions" }).click();
  await expect(page.getByRole("button", { name: "Review & Submit" })).toBeVisible();
  await page.getByRole("button", { name: /^Question 1,/ }).click();
  await expect(page.getByRole("button", { name: "Review & Submit" })).toHaveCount(0);

  await page.getByRole("button", { name: /Section B/ }).click();
  for (const key of ["1", "2", ".", "5"]) await page.getByRole("group", { name: "Number pad" }).getByRole("button", { name: key, exact: true }).click();
  await expect(page.getByTestId("numeric-answer")).toHaveValue("12.5");
  await page.getByRole("button", { name: "Backspace" }).click();
  await expect(page.getByTestId("numeric-answer")).toHaveValue("12.");

  const shotDir = process.env.EXAM_SHOTS;
  if (shotDir) await page.screenshot({ path: `${shotDir}/exam-phone.png` });
  await context.close();
});

// Regression: the remaining time used to be restored from the browser's own saved copy, so closing
// the tab paused the clock. The server now decides how much is left.
test("reloading the exam page does not pause the clock, and answers survive on the server", async ({ request, browser }) => {
  test.setTimeout(90_000);
  const batches = await (await request.get("/api/teacher/batches")).json();
  const batch = batches.find((b: { name: string }) => b.name === E2E_BATCH_NAME);
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: "E2E Clock Mock", mode: "PRACTICE", duration: 10, totalMarks: 4, templateType: "MOCK_EXAM",
      sections: [{ title: "Section A", marksPerQuestion: 4, negativeMarks: 1, questions: [{ id: BUILDER_QUESTIONS[0].id }, { id: BUILDER_QUESTIONS[1].id }] }],
    },
  });
  const testId: string = (await created.json()).test.id;
  await request.patch(`/api/teacher/tests/${testId}/publish`, { data: { isPublished: true } });
  await request.post("/api/teacher/tests/assign", { data: { testId, batchId: batch.id } });

  const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
  const page = await context.newPage();
  await page.goto(`/student/tests/${testId}/take`);
  await page.getByRole("button", { name: "Start Examination" }).click();
  await page.getByTestId("option-original-A").click();

  const progress = page.waitForResponse((r) => r.url().includes(`/api/student/tests/${testId}/progress`) && r.request().method() === "POST", { timeout: 20_000 });
  expect((await progress).ok()).toBeTruthy();
  await page.waitForTimeout(6000);

  // Simulate a tab closed for a while: drop the browser's own copy, then reopen the paper.
  await page.evaluate((id) => localStorage.removeItem(`test_state_${id}`), testId);
  await page.reload();

  // No instructions page again, the clock has kept running, and the saved answer is back.
  await expect(page.getByRole("button", { name: "Start Examination" })).toHaveCount(0);
  const clock = await page.getByText(/^\d{2}:\d{2}:\d{2}$/).first().innerText();
  const [h, m, sec] = clock.split(":").map(Number);
  expect(h * 3600 + m * 60 + sec).toBeLessThanOrEqual(10 * 60 - 12);
  await expect(page.getByRole("button", { name: /^Question 1, answered/ })).toBeVisible();

  await context.close();
});

// A paper with a written section: the student types the answer, the server scores the choice
// section at once and queues the written answer, and the teacher's marks complete the total.
test("a written answer is typed by the student, marked by the teacher, and added to the total", async ({ request, browser }) => {
  test.setTimeout(90_000);
  const batches = await (await request.get("/api/teacher/batches")).json();
  const batch = batches.find((b: { name: string }) => b.name === E2E_BATCH_NAME);
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: "E2E Written Mock", mode: "PRACTICE", duration: 30, totalMarks: 6, templateType: "MOCK_EXAM",
      sections: [
        { title: "Section A", marksPerQuestion: 1, negativeMarks: 0, questions: [{ id: BUILDER_QUESTIONS[0].id }] },
        { title: "Section B", marksPerQuestion: 5, negativeMarks: 0, questions: [{ id: WRITTEN_QUESTION.id }] },
      ],
    },
  });
  const testId: string = (await created.json()).test.id;
  await request.patch(`/api/teacher/tests/${testId}/publish`, { data: { isPublished: true } });
  await request.post("/api/teacher/tests/assign", { data: { testId, batchId: batch.id } });

  const context = await browser.newContext({ storageState: STUDENT_STORAGE_STATE });
  const page = await context.newPage();
  await page.goto(`/student/tests/${testId}/take`);
  await expect(page.getByText("1 question in this paper needs a written answer")).toBeVisible();
  await page.getByRole("button", { name: "Start Examination" }).click();
  await page.getByTestId("option-original-A").click(); // correct: +1
  await page.getByRole("button", { name: /Section B/ }).click();
  await expect(page.getByTestId("written-answer")).toBeVisible();
  await page.getByTestId("written-answer").fill("Let the numbers be 2a and 2b. Their sum is 2(a+b), which is even.");
  await expect(page.getByRole("button", { name: /^Question 1, answered/ })).toBeVisible();

  const submitResponse = page.waitForResponse((r) => r.url().includes(`/api/student/tests/${testId}/submit`) && r.ok());
  await page.getByRole("button", { name: "Review & Submit" }).click();
  await page.getByRole("dialog", { name: "Review your paper" }).getByRole("button", { name: "Submit exam" }).click();
  const result = await (await submitResponse).json();
  expect(result.totalScore).toBe(1);
  expect(result.pendingReview).toBe(1);
  await expect(page.getByText("1 written answer will be marked by your teacher")).toBeVisible();

  // Teacher: finds it in the review queue, cannot over-mark, then marks it.
  const queue = await (await request.get("/api/teacher/homework/submissions")).json();
  const item = queue.submissions.find((s: { attempt: { id: string }; question: { id: string } }) => s.attempt.id === result.id && s.question.id === WRITTEN_QUESTION.id);
  expect(item, "the written answer in the teacher's queue").toBeTruthy();
  expect(item.reviewStatus).toBe("PENDING");
  expect(item.maxMarks).toBe(5);
  expect(item.subjectiveText).toContain("2(a+b)");

  const tooMuch = await request.patch(`/api/teacher/homework/submissions/${item.id}`, { data: { marksAwarded: 6, teacherFeedback: "x" } });
  expect(tooMuch.status()).toBe(400);
  const marked = await request.patch(`/api/teacher/homework/submissions/${item.id}`, { data: { marksAwarded: 4, teacherFeedback: "Clear, but state that a and b are integers." } });
  expect(marked.ok()).toBeTruthy();

  // The student's total is now 1 (choice) + 4 (written).
  await page.goto(`/student/performance/${result.id}`);
  await expect(page.getByText("Your written answer")).toBeVisible();
  await expect(page.getByText("Marked: 4")).toBeVisible();
  await expect(page.getByText("state that a and b are integers")).toBeVisible();
  const report = await (await context.request.get(`/api/student/performance/${result.id}`)).json();
  expect(report.attempt.totalScore).toBe(5);

  await context.close();
});

test("a test prints as a paper: student copy has no answers, the teacher copy adds an answer key", async ({ request, page }) => {
  const created = await request.post("/api/teacher/tests", {
    data: {
      title: "E2E Printed Paper", mode: "PRACTICE", duration: 45, totalMarks: 11, templateType: "MOCK_EXAM", examPattern: "CBSE_12_MATHS",
      sections: [
        { title: "Section A", marksPerQuestion: 1, negativeMarks: 0, questions: [{ id: BUILDER_QUESTIONS[1].id }] },
        { title: "Section B", marksPerQuestion: 5, negativeMarks: 0, questions: [{ id: WRITTEN_QUESTION.id }] },
        { title: "Section C", marksPerQuestion: 5, negativeMarks: 0, questions: [{ id: NUMERIC_QUESTION.id }] },
      ],
    },
  });
  const testId: string = (await created.json()).test.id;

  await page.goto(`/teacher/tests/${testId}/print`);
  const paper = page.locator(".paper");
  await expect(paper.getByRole("heading", { name: "E2E Printed Paper", exact: true })).toBeVisible();
  await expect(paper).toContainText("Time: 45 minutes");
  await expect(paper).toContainText("Maximum marks: 11");
  await expect(paper).toContainText("E2E fixture question 2 for Mechanics");
  await expect(paper).toContainText("(B)");
  await expect(paper).toContainText("Answer: ______");
  await expect(paper).toContainText("Name:");
  await expect(paper.getByText("Answer key")).toHaveCount(0);
  // On paper: the toolbar goes away and only the paper shows.
  if (process.env.EXAM_SHOTS) await page.screenshot({ path: `${process.env.EXAM_SHOTS}/print-screen.png`, fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.goto(`/teacher/tests/${testId}/print?key=1`);
  const keyed = page.locator(".paper");
  await expect(keyed).toContainText("(teacher copy)");
  await expect(keyed.getByRole("heading", { name: "Answer key" })).toBeVisible();
  await expect(keyed).toContainText("Marked by the teacher");
  await expect(keyed).toContainText("12.5");

  // Someone else's test is not found.
  const other = await page.goto(`/teacher/tests/not-a-real-test/print`);
  expect(other?.status()).toBe(404);
});
