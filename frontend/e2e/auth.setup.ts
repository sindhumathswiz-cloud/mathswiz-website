import { expect, test as setup, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_STUDENT, E2E_TEACHER } from "./fixtures/data";
import { ADMIN_STORAGE_STATE, STUDENT_STORAGE_STATE, TEACHER_STORAGE_STATE } from "./fixtures/storage-state";

async function loginViaUi(page: Page, creds: { mobileNumber: string; password: string }, dashboardPath: string) {
  const dashboard = new RegExp(dashboardPath.replace(/\//g, "\\/"));
  // The login form can be submitted before the page's JavaScript has attached. The browser then submits it natively
  // and lands on /login?mobile=..., and the sign-in has to be tried again. A slow sign-in is not that: it is waited for.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");
    await page.getByLabel("Mobile Number *").fill(creds.mobileNumber);
    await page.getByLabel("Password *").fill(creds.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    const outcome = await Promise.race([
      page.waitForURL(dashboard, { timeout: 90_000 }).then(() => "signed-in" as const),
      page.waitForURL(/\/login\?/, { timeout: 90_000 }).then(() => "native-submit" as const),
    ]).catch(() => "timeout" as const);
    if (outcome === "signed-in" || dashboard.test(page.url())) break;
    if (outcome === "timeout" || attempt === 3) throw new Error(`Sign-in did not complete (${outcome}) at ${page.url()}`);
  }
  await expect(page).toHaveURL(dashboard);
}

setup("authenticate as teacher", async ({ page }) => {
  setup.setTimeout(150_000);
  await loginViaUi(page, E2E_TEACHER, "/teacher/dashboard");
  await page.context().storageState({ path: TEACHER_STORAGE_STATE });
});

setup("authenticate as student", async ({ page }) => {
  setup.setTimeout(150_000);
  await loginViaUi(page, E2E_STUDENT, "/student/dashboard");
  await page.context().storageState({ path: STUDENT_STORAGE_STATE });
});

setup("authenticate as admin", async ({ page }) => {
  setup.setTimeout(150_000);
  await loginViaUi(page, E2E_ADMIN, "/admin/dashboard");
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
