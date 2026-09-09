import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getToken = vi.fn();
const checkRateLimit = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit,
}));

describe("API authorization middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 99, resetAt: Date.now() + 60_000, available: true });
  });

  it("returns 401 for anonymous access to previously unprotected APIs", async () => {
    getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");
    const response = await middleware(new NextRequest("http://localhost/api/admin/dashboard"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
  });

  it("returns 403 for cross-role access", async () => {
    getToken.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    const { middleware } = await import("./middleware");
    const response = await middleware(new NextRequest("http://localhost/api/teacher/tests"));

    expect(response.status).toBe(403);
  });

  it.each([
    ["ADMIN", "/api/admin/stats"],
    ["TEACHER", "/api/teacher/batches"],
    ["STUDENT", "/api/student/tests/assigned"],
    ["PARENT", "/api/parent/dashboard"],
  ])("allows %s through its API namespace", async (role, path) => {
    getToken.mockResolvedValue({ id: `${role.toLowerCase()}-1`, role });
    const { middleware } = await import("./middleware");
    const response = await middleware(new NextRequest(`http://localhost${path}`));

    expect(response.status).toBe(200);
  });

  it("keeps registration and public site content accessible", async () => {
    getToken.mockResolvedValue(null);
    const { middleware } = await import("./middleware");

    expect((await middleware(new NextRequest("http://localhost/api/auth/register"))).status).toBe(200);
    expect((await middleware(new NextRequest("http://localhost/api/site-page/home"))).status).toBe(200);
  });

  it("returns 429 when the distributed limit is exceeded", async () => {
    getToken.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 30_000, available: true });
    const { middleware } = await import("./middleware");
    const response = await middleware(new NextRequest("http://localhost/api/student/report"));

    expect(response.status).toBe(429);
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("fails safely when protection is unavailable for authentication", async () => {
    vi.stubEnv("NODE_ENV", "production");
    getToken.mockResolvedValue(null);
    checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, resetAt: Date.now(), available: false });
    const { middleware } = await import("./middleware");
    const response = await middleware(new NextRequest("http://localhost/api/auth/register", { method: "POST" }));

    expect(response.status).toBe(503);
    vi.unstubAllEnvs();
  });
});
