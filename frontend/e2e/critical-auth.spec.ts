import { expect, test } from "@playwright/test";

test("login exposes password authentication and no OTP bypass", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Mobile Number *")).toBeVisible();
  await expect(page.getByLabel("Password *")).toHaveAttribute("type", "password");
  await expect(page.getByText(/OTP/i)).toHaveCount(0);
});

test("configured identity providers are exposed by NextAuth", async ({ request }) => {
  const response = await request.get("/api/auth/providers");
  expect(response.ok()).toBeTruthy();
  const providers = await response.json();
  expect(Object.keys(providers)).toEqual(expect.arrayContaining(["credentials", "google", "azure-ad"]));
});

for (const path of ["/admin/dashboard", "/teacher/dashboard", "/student/dashboard", "/parent/dashboard"]) {
  test(`anonymous visitor is redirected away from ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  });
}

test("anonymous API access is denied while health monitoring stays public", async ({ request }) => {
  const protectedResponse = await request.get("/api/admin/dashboard");
  expect(protectedResponse.status()).toBe(401);

  const liveResponse = await request.get("/api/health/live");
  expect(liveResponse.status()).toBe(200);
  await expect(liveResponse.json()).resolves.toMatchObject({ status: "alive" });

  const readyResponse = await request.get("/api/health");
  expect(readyResponse.status()).toBe(200);
  await expect(readyResponse.json()).resolves.toMatchObject({
    status: "ready",
    checks: { database: "ok", rateLimit: "ok" },
  });
});
