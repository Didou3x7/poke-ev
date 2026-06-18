/**
 * Best-effort in-memory rate limiter for public API routes.
 *
 * CAVEAT: state lives in a single serverless instance's memory and resets on
 * cold start, so this throttles a burst hitting one warm instance — NOT a
 * distributed flood across instances. Durable, cross-instance limiting would
 * need Vercel KV / Upstash. It's still worth having on the CPU-heavy /api/og
 * route (ImageResponse generation) and the /api/calc data route as a cheap
 * first line of defense; the edge cache (s-maxage) absorbs the rest.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Returns true if the request is allowed, false if it exceeds `limit` per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Bound memory: prune expired buckets when the map grows large.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
