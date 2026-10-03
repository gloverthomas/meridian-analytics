/**
 * In-memory sliding-window limiter. Per-process: on Vercel each warm instance
 * keeps its own window, so treat this as abuse damping, not a hard quota.
 */

export interface RateLimitRule {
  name: string;
  windowMs: number;
  max: number;
}

export const RATE_LIMITS = {
  general: { name: "general", windowMs: 60_000, max: 180 },
  chat: { name: "chat", windowMs: 60_000, max: 20 },
  session: { name: "session", windowMs: 60_000, max: 10 },
  action: { name: "action", windowMs: 60_000, max: 10 },
} as const satisfies Record<string, RateLimitRule>;

const MAX_TRACKED_KEYS = 5_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Records a hit and returns false when the caller is over the limit. */
  allow(rule: RateLimitRule, ip: string): boolean {
    const key = `${rule.name}:${ip}`;
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < rule.windowMs);
    if (recent.length >= rule.max) {
      this.hits.set(key, recent);
      return false;
    }
    this.hits.delete(key);
    this.hits.set(key, [...recent, now]);
    if (this.hits.size > MAX_TRACKED_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest !== undefined) this.hits.delete(oldest);
    }
    return true;
  }
}
