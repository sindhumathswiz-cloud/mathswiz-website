import { expect, test as setup, type Page } from "@playwright/test";
import { E2E_STUDENT, E2E_TEACHER } from "./fixtures/data";
import { STUDENT_STORAGE_STATE, TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

async function loginViaUi(page: Page, creds: { mobileNumber: string; password: string }, dashboardPath: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile Number *").fill(creds.mobileNumber);
  await page.getByLabel("Password *").fill(creds.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(new RegExp(dashboardPath.replace(/\//g, "\\/")));
  await expect(page).toHaveURL(new RegExp(dashboardPath.replace(/\//g, "\\/")));
}

setup("authenticate as teacher", async ({ page }) => {
  await loginViaUi(page, E2E_TEACHER, "/teacher/dashboard");
  await page.context().storageState({ path: TEACHER_STORAGE_STATE });
});

setup("authenticate as student", async ({ page }) => {
  await loginViaUi(page, E2E_STUDENT, "/student/dashboard");
  await page.context().storageState({ path: STUDENT_STORAGE_STATE });
});
