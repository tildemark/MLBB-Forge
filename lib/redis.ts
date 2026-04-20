/**
 * lib/redis.ts
 *
 * Singleton ioredis client.  All Redis usage (rate-limiting, caching) goes
 * through this module.  If Redis is unreachable every call gracefully degrades
 * (callers catch the error and continue without cache/rate-limit).
 */

import Redis from "ioredis";

// Singleton instance — reused across serverless invocations in the same process.
let _client: Redis | null = null;

export function getRedis(): Redis {
  if (!_client) {
    _client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 2000,
    });
    _client.on("error", () => {
      // Suppress noisy connection errors; callers handle failures gracefully.
    });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Rate-limiting helpers
// ---------------------------------------------------------------------------

/**
 * Increment a rate-limit counter and set expiry on first increment.
 * Returns the current count AFTER incrementing, or null if Redis is down.
 */
export async function rlIncr(key: string, ttlSeconds: number): Promise<number | null> {
  try {
    const redis = getRedis();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, ttlSeconds);
    return count;
  } catch {
    return null; // Redis down — fail open
  }
}

// ---------------------------------------------------------------------------
// Generic cache helpers
// ---------------------------------------------------------------------------

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // ignore
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    // ignore
  }
}
