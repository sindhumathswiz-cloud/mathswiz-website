export type RateLimitTier = "ai" | "auth" | "general";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  available: boolean;
}

export const rateLimitConfigs: Record<RateLimitTier, RateLimitConfig> = {
  ai: { windowMs: 60_000, maxRequests: 10 },
  auth: { windowMs: 60_000, maxRequests: 5 },
  general: { windowMs: 60_000, maxRequests: 100 },
};

const ATOMIC_COUNTER_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {count, ttl}
`.trim();

type RedisResponse = { result?: [number, number]; error?: string };

export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = "general",
  now = Date.now(),
): Promise<RateLimitResult> {
  const config = rateLimitConfigs[tier];
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    return { allowed: true, remaining: config.maxRequests, resetAt: now, available: false };
  }

  const key = `mathswiz:ratelimit:${tier}:${identifier}`;

  try {
    const response = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", ATOMIC_COUNTER_SCRIPT, 1, key, config.windowMs]),
      cache: "no-store",
    });

    if (!response.ok) {
      return { allowed: true, remaining: config.maxRequests, resetAt: now, available: false };
    }

    const data = await response.json() as RedisResponse;
    if (data.error || !Array.isArray(data.result)) {
      return { allowed: true, remaining: config.maxRequests, resetAt: now, available: false };
    }

    const [count, ttl] = data.result.map(Number);
    if (!Number.isFinite(count) || !Number.isFinite(ttl)) {
      return { allowed: true, remaining: config.maxRequests, resetAt: now, available: false };
    }

    const remaining = Math.max(0, config.maxRequests - count);
    return {
      allowed: count <= config.maxRequests,
      remaining,
      resetAt: now + Math.max(0, ttl),
      available: true,
    };
  } catch {
    return { allowed: true, remaining: config.maxRequests, resetAt: now, available: false };
  }
}
