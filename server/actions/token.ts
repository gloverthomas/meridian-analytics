/**
 * Signed, short-lived confirmation tokens. A proposal binds exactly one
 * (issue, target state) pair; the execute endpoint accepts nothing else, so a
 * click can't be replayed later or redirected at another ticket.
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "../auth.js";

export const ACTION_TOKEN_TTL_MS = 5 * 60_000;

export type ActionKind = "linear_transition" | "workflow_implement";

export interface TransitionClaim {
  issueId: string;
  toState: string;
  expiresAt: number;
  /** Which action the token confirms; a token for one action can't run the other. */
  action: ActionKind;
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(`action.v1.${payload}`).digest("base64url");

export function createActionToken(
  claim: Omit<TransitionClaim, "expiresAt" | "action"> & { action?: ActionKind },
  secret: string,
  nowMs = Date.now(),
): { token: string; expiresAt: number } {
  const expiresAt = nowMs + ACTION_TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ action: "linear_transition", ...claim, expiresAt })).toString("base64url");
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export type TokenCheck = { ok: true; claim: TransitionClaim } | { ok: false; reason: "invalid" | "expired" };

export function verifyActionToken(token: unknown, secret: string, nowMs = Date.now()): TokenCheck {
  if (typeof token !== "string" || token.length > 1_000) return { ok: false, reason: "invalid" };
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined || !safeEqual(signature, sign(payload, secret))) return { ok: false, reason: "invalid" };
  let claim: unknown;
  try {
    claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const c = claim as Partial<TransitionClaim>;
  if (typeof c.issueId !== "string" || typeof c.toState !== "string" || typeof c.expiresAt !== "number") return { ok: false, reason: "invalid" };
  if (c.expiresAt <= nowMs) return { ok: false, reason: "expired" };
  const action: ActionKind = c.action === "workflow_implement" ? "workflow_implement" : "linear_transition";
  return { ok: true, claim: { issueId: c.issueId, toState: c.toState, expiresAt: c.expiresAt, action } };
}
