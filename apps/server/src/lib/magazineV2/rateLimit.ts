// ---------------------------------------------------------------------------
// Magazine Builder v2 — a tiny in-memory sliding-window rate limiter.
//
// Self-contained (no express-rate-limit dependency) — enough to stop a runaway
// client / abusive loop from hammering write + AI endpoints (closes review
// finding H5 for the v2 surface). Keyed by account id (falling back to IP), so
// one user can't be blocked by another behind the same proxy. In-memory is fine
// for a single API process; swap for a shared store if the API is scaled out.
// ---------------------------------------------------------------------------

import type { Request, Response, NextFunction } from 'express';

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

function keyFor(req: Request, scope: string): string {
  const acct = (req as Request & { account?: { id?: string } }).account?.id;
  const ip = acct || req.ip || req.socket?.remoteAddress || 'unknown';
  return `${scope}:${ip}`;
}

/**
 * Build a middleware allowing at most `max` requests per `windowMs` per caller.
 * Only non-GET requests are counted (reads are cheap and public-facing).
 */
export function rateLimit(scope: string, max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET') return next();
    const now = Date.now();
    const key = keyFor(req, scope);
    const bucket = buckets.get(key) ?? { hits: [] };
    // Drop timestamps outside the window.
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
    if (bucket.hits.length >= max) {
      const retryMs = windowMs - (now - bucket.hits[0]!);
      res.setHeader('Retry-After', String(Math.ceil(retryMs / 1000)));
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    bucket.hits.push(now);
    buckets.set(key, bucket);
    // Opportunistic eviction so idle callers don't accumulate forever.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) {
        if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
      }
    }
    next();
  };
}
