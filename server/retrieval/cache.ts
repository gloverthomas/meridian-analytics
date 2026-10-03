/**
 * Tiny TTL + LRU cache for connector responses. Grok answers are never cached —
 * only retrieval, so every answer is a fresh synthesis.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export const CACHE_TTL_MS = {
  linearIssue: 60_000,
  linearList: 60_000,
  githubPrs: 120_000,
  githubSearch: 120_000,
  githubChecks: 180_000,
  docs: 600_000,
} as const;

const MAX_ENTRIES = 200;

export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();

  constructor(private readonly now: () => number = Date.now) {}

  async getOrLoad<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) {
      // Re-insert to mark as most recently used.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value as T;
    }
    const value = await load();
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  clear(): void {
    this.entries.clear();
  }
}

export const retrievalCache = new TtlCache();
