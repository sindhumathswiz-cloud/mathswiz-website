import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/prisma", () => ({ default: { $queryRawUnsafe: queryMock } }));

describe("readiness checks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    queryMock.mockResolvedValue([{ "?column?": 1 }]);
  });

  it("is ready in development when the database works and Redis is omitted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { checkReadiness } = await import("./readiness");
    await expect(checkReadiness()).resolves.toEqual({
      ready: true,
      checks: { database: "ok", rateLimit: "not_configured" },
    });
  });

  it("fails readiness when the database is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    queryMock.mockRejectedValue(new Error("offline"));
    const { checkReadiness } = await import("./readiness");
    expect((await checkReadiness()).ready).toBe(false);
  });

  it("requires Redis in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const { checkReadiness } = await import("./readiness");
    expect((await checkReadiness()).ready).toBe(false);
  });
});
