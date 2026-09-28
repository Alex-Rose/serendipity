import type { NextFunction, Request, Response } from "express";

/**
 * A small in-memory, per-IP fixed-window limiter for the login and sign-up
 * routes. It's per process: run several instances and each keeps its own
 * counts. Behind a reverse proxy, set TRUST_PROXY so req.ip is the client's.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip ?? "unknown";
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    if (++entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many attempts. Please wait a bit and try again." });
      return;
    }
    next();
  };
}
