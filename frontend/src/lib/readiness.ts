import prisma from "@/lib/prisma";

export type DependencyStatus = "ok" | "not_configured" | "unavailable";

export type ReadinessResult = {
  ready: boolean;
  checks: {
    database: DependencyStatus;
    rateLimit: DependencyStatus;
  };
};

async function checkDatabase(): Promise<DependencyStatus> {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return "ok";
  } catch {
    return "unavailable";
  }
}

async function checkRateLimitStore(): Promise<DependencyStatus> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return "not_configured";

  try {
    const response = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return "unavailable";
    const body = await response.json();
    return body.result === "PONG" ? "ok" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function checkReadiness(): Promise<ReadinessResult> {
  const [database, rateLimit] = await Promise.all([checkDatabase(), checkRateLimitStore()]);
  const redisRequired = process.env.NODE_ENV === "production";
  return {
    ready: database === "ok" && (!redisRequired || rateLimit === "ok"),
    checks: { database, rateLimit },
  };
}
