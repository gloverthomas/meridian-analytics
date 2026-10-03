/** Sample data is dated relative to "now" so it always falls inside the default window. */
export function daysAgo(days: number, nowMs = Date.now()): string {
  return new Date(nowMs - days * 86_400_000).toISOString();
}
