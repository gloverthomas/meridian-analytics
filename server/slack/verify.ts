/**
 * Slack request signing: HMAC-SHA256 of `v0:<timestamp>:<raw body>` with the
 * app's signing secret, compared in constant time. Requests older than five
 * minutes are refused so a captured request can't be replayed later.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_SECONDS = 300;

export function verifySlackSignature(rawBody: string, headers: Headers, signingSecret: string, nowMs: number): boolean {
  const timestamp = headers.get("x-slack-request-timestamp") ?? "";
  const signature = headers.get("x-slack-signature") ?? "";
  if (!/^\d{1,12}$/.test(timestamp) || !signature.startsWith("v0=")) return false;
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > MAX_SKEW_SECONDS) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
