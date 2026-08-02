/**
 * Simple in-memory IP rate limiter for auth endpoints.
 * Not distributed — fine for a single Railway replica.
 */

export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  maxAttempts = 5,
  lockMs = 15 * 60 * 1000,
} = {}) {
  const hits = new Map();

  function clientIp(req) {
    const forwarded = String(req.get?.("x-forwarded-for") || "")
      .split(",")[0]
      .trim();
    return forwarded || req.socket?.remoteAddress || "unknown";
  }

  function check(ip) {
    const now = Date.now();
    let row = hits.get(ip);
    if (!row || now > row.windowUntil) {
      row = { count: 0, windowUntil: now + windowMs, lockedUntil: 0 };
      hits.set(ip, row);
    }
    if (row.lockedUntil && now < row.lockedUntil) {
      return { ok: false, retryAfterSec: Math.ceil((row.lockedUntil - now) / 1000), row };
    }
    if (hits.size > 10_000) hits.clear();
    return { ok: true, row };
  }

  function fail(ip) {
    const now = Date.now();
    const { row } = check(ip);
    if (!row) return;
    row.count += 1;
    if (row.count >= maxAttempts) {
      row.lockedUntil = now + lockMs;
      row.count = 0;
      row.windowUntil = now + windowMs;
    }
  }

  function clear(ip) {
    hits.delete(ip);
  }

  return { clientIp, check, fail, clear };
}
