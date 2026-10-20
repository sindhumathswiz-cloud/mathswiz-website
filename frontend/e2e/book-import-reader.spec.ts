import { expect, test } from "@playwright/test";
import { E2E_BOOK_PREFIX } from "./fixtures/data";
import { countVersions, createBookQuestion, readQuestion, setPageTextLayer } from "./fixtures/db";
import { screenshotPng } from "./fixtures/png";
import { ADMIN_STORAGE_STATE } from "./fixtures/storage-state";

test.use({ storageState: ADMIN_STORAGE_STATE });

test("screenshots of a book become its pages, and its questions are compared and corrected beside them", async ({ page, request }) => {
  test.setTimeout(300_000);

  // --- A book to import into ---
  const title = `${E2E_BOOK_PREFIX}Page Image Book`;
  const created = await request.post("/api/admin/books", { data: { title, className: "Class 12", edition: "E2E" } });
  expect(created.ok()).toBeTruthy();
  const createdBody = await created.json();
  const bookId: string = createdBody.book?.id ?? createdBody.id;
  expect(bookId).toBeTruthy();

  // --- Import: two screenshots of an open book, each with a browser toolbar across the top ---
  await page.goto("/admin/question-bank/books");
  await page.getByTestId(`import-images-${bookId}`).click();
  const dialog = page.getByRole("dialog", { name: "Import page images" });
  await expect(dialog).toBeVisible();

  const shots = [1, 2].map((n) => ({ name: `shot-${n}.png`, mimeType: "image/png", buffer: screenshotPng({ width: 1600, height: 900, toolbar: 90, spread: true, seed: n }) }));
  await dialog.getByTestId("page-images-input").setInputFiles(shots);
  await expect(dialog.getByTestId("import-summary")).toContainText("2 images → 2 pages");
  // Wider than tall, so the dialog warns that these look like spreads.
  await expect(dialog.getByText(/two-page spread/)).toBeVisible();

  await dialog.getByTestId("crop-top").fill("10"); // exactly the 90px toolbar
  await dialog.getByTestId("split-toggle").check();
  await expect(dialog.getByTestId("import-summary")).toContainText("2 images → 4 pages");
  await expect(dialog.getByText(/two-page spread/)).toHaveCount(0);

  await dialog.getByTestId("build-pdf").click();
  await expect(page.getByText(/all 4 pages match the PDF page for page/)).toBeVisible({ timeout: 150_000 });

  // Every page was rendered, and each is one half of a cropped screenshot (about square, not a wide spread).
  await expect.poll(async () => {
    const overview = await (await request.get(`/api/admin/books/${bookId}/source`)).json();
    const pages = overview.pages as Array<{ width: number | null; height: number | null; hasImage: boolean }>;
    return pages.length === 4 && pages.every((p) => p.hasImage) ? pages.map((p) => Math.round(((p.width ?? 0) / (p.height ?? 1)) * 100) / 100) : null;
  }, { timeout: 180_000, intervals: [2000] }).toEqual([0.99, 0.99, 0.99, 0.99]);

  // --- Stand in for extraction: a text layer on page 2 and a question filed under it ---
  await setPageTextLayer(bookId, 2, [
    { y: 0.08, h: 0.03, text: "RELATIONS 1.3" },
    { y: 0.3, h: 0.03, text: "Let L be the set of all lines in a plane. Then relation R on L defined by" },
    { y: 0.5, h: 0.03, text: "SOLUTION First, let R be a symmetric relation on set A." },
  ]);
  const questionId = await createBookQuestion(bookId, { content: "7. Let $L$ be the set of all lines in a plane. Then relation $R$ on $L$ defined by $(L_1, L_2) \\in R$ is", page: 2, printedNumber: "7", options: ["reflexive", "symmetric", "transitive", "equivalence"] });

  // --- The reader: two pages across, the cover alone, the question's line marked ---
  await page.goto(`/admin/question-bank/books/${bookId}/read?question=${questionId}`);
  const viewer = page.locator("[data-layout]");
  await expect(viewer).toHaveAttribute("data-layout", "spread");
  const p1 = page.getByAltText("Page 1");
  const p2 = page.getByAltText("Page 2");
  const p3 = page.getByAltText("Page 3");
  await expect(p2).toBeVisible({ timeout: 60_000 });
  const [b1, b2, b3] = await Promise.all([p1.boundingBox(), p2.boundingBox(), p3.boundingBox()]);
  // Page 1 is the cover, alone on the right; pages 2 and 3 share a row, 2 on the left.
  expect(b2!.x).toBeLessThan(b3!.x);
  expect(Math.abs(b2!.y - b3!.y)).toBeLessThan(6);
  expect(b1!.x).toBeGreaterThan(b2!.x - 4);
  expect(b1!.y).toBeLessThan(b2!.y);

  await expect(page.getByTestId("question-highlight")).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId(`reader-question-${questionId}`);
  await expect(card).toBeVisible();
  await expect(card.getByTestId("edit-content")).toHaveValue(/Let \$L\$ be the set of all lines/);

  // Turning "First page alone" off pairs pages 1 and 2.
  await page.getByLabel("First page alone").uncheck();
  await expect.poll(async () => {
    const [x1, x2] = await Promise.all([p1.boundingBox(), p2.boundingBox()]);
    return x1 && x2 ? Math.abs(x1.y - x2.y) < 6 && x1.x < x2.x : false;
  }).toBe(true);
  await page.getByLabel("First page alone").check();

  // --- Correct the question beside its page, and save ---
  await card.getByTestId("edit-answer").fill("B");
  await card.getByTestId("edit-content").fill("7. Let $L$ be the set of all lines in a plane. The relation $R$ on $L$ defined by $(L_1, L_2) \\in R \\Leftrightarrow L_1 \\perp L_2$ is");
  await card.getByTestId("save-question").click();
  await expect(card.getByRole("status")).toContainText("Saved");
  const saved = await readQuestion(questionId);
  expect(saved?.correctAnswer).toBe("B");
  expect(saved?.content).toContain("\\perp");
  expect(await countVersions(questionId)).toBe(1); // the original is kept in the version history
});
