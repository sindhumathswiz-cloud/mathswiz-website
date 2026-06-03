interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const defaultLimits: Record<string, RateLimitConfig> = {
  ai: { windowMs: 60_000, maxRequests: 10 },
  general: { windowMs: 60_000, maxRequests: 100 },
  auth: { windowMs: 60_000, maxRequests: 5 },
};

export function checkRateLimit(
  identifier: string,
  tier: keyof typeof defaultLimits = "general"
): { allowed: boolean; remaining: number; resetAt: number } {
  const config = defaultLimits[tier];
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now > entry.resetTime) {
    store.set(identifier, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetTime };
  }

  entry.count++;
  return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetTime };
}

export function cleanupStore() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetTime) {
      store.delete(key);
    }
  }
}

setInterval(cleanupStore, 60_000);
