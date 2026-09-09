import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("persistent rate limiter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com/";
    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
  });

  it("uses one atomic Redis script and reports remaining requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ result: [2, 45_000] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    const result = await checkRateLimit("ip:127.0.0.1", "auth", 1_000);

    expect(result).toEqual({ allowed: true, remaining: 3, resetAt: 46_000, available: true });
    const [, request] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request?.body))).toEqual(expect.arrayContaining([
      "EVAL",
      expect.stringContaining("INCR"),
      1,
      "mathswiz:ratelimit:auth:ip:127.0.0.1",
      60_000,
    ]));
  });

  it("blocks requests above the configured limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ result: [6, 30_000] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));

    await expect(checkRateLimit("ip:test", "auth", 2_000)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 32_000,
      available: true,
    });
  });

  it("marks the backend unavailable when credentials or Redis are unavailable", async () => {
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect((await checkRateLimit("ip:test", "ai")).available).toBe(false);

    process.env.UPSTASH_REDIS_REST_TOKEN = "secret-token";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect((await checkRateLimit("ip:test", "ai")).available).toBe(false);
  });
});
