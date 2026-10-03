/**
 * Two ways in, both fail-closed:
 *  1. Bearer demo token — injected by the Vite proxy in local dev (never in the bundle).
 *  2. Signed session cookie — issued after the viewer enters the access code (hosted deploys).
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sessionAuthEnabled, type Config } from "./config.js";
import { parseCookies } from "./http.js";

export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_VERSION = "v1";

export type AuthResult = { ok: true; via: "bearer" | "session" } | { ok: false; reason: "unauthorized" | "auth_not_configured" };

/** Constant-time compare that doesn't leak length (both sides hashed first). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(secret: string, nowMs = Date.now()): string {
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = `${SESSION_VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string, nowMs = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_VERSION) return false;
  const expiresAt = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= nowMs) return false;
  return safeEqual(parts[2], sign(`${parts[0]}.${parts[1]}`, secret));
}

export function sessionCookieName(config: Config): string {
  // __Host- forces Secure + Path=/ + no Domain; only valid over HTTPS.
  return config.isProductionLike ? "__Host-li_session" : "li_session";
}

export function buildSessionCookie(config: Config, token: string | null): string {
  const attrs = ["Path=/", "HttpOnly", "SameSite=Strict"];
  if (config.isProductionLike) attrs.push("Secure");
  const value = token ?? "";
  const maxAge = token ? SESSION_TTL_SECONDS : 0;
  return [`${sessionCookieName(config)}=${value}`, ...attrs, `Max-Age=${maxAge}`].join("; ");
}

export function authenticate(request: Request, config: Config): AuthResult {
  const authorization = request.headers.get("authorization");
  if (config.demoTokenEnabled && config.demoToken && authorization?.startsWith("Bearer ")) {
    if (safeEqual(authorization.slice(7), config.demoToken)) return { ok: true, via: "bearer" };
  }

  if (sessionAuthEnabled(config) && config.sessionSecret) {
    const token = parseCookies(request.headers.get("cookie"))[sessionCookieName(config)];
    if (token && verifySessionToken(token, config.sessionSecret)) return { ok: true, via: "session" };
  }

  if (!config.demoTokenEnabled && !sessionAuthEnabled(config)) {
    return { ok: false, reason: "auth_not_configured" };
  }
  return { ok: false, reason: "unauthorized" };
}

export function accessCodeMatches(supplied: unknown, config: Config): boolean {
  if (!config.accessCode || typeof supplied !== "string") return false;
  return safeEqual(supplied.trim(), config.accessCode);
}
