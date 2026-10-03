import { describe, expect, it } from "vitest";
import { accessCodeMatches, authenticate, buildSessionCookie, createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "../../server/auth.js";
import { loadConfig } from "../../server/config.js";
import { parseCookies } from "../../server/http.js";
import { TtlCache } from "../../server/retrieval/cache.js";
import { clip, redact } from "../../server/retrieval/redact.js";
import { RateLimiter } from "../../server/rateLimit.js";
import { DEMO_TOKEN, makeConfig } from "../helpers.js";

const SECRET = "s".repeat(40);

describe("session tokens", () => {
  it("round-trips and expires", () => {
    const now = Date.parse("2026-09-25T00:00:00Z");
    const token = createSessionToken(SECRET, now);
    expect(verifySessionToken(token, SECRET, now)).toBe(true);
    expect(verifySessionToken(token, SECRET, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  it("rejects tampering and wrong secrets", () => {
    const token = createSessionToken(SECRET);
    const [v, exp, sig] = token.split(".");
    expect(verifySessionToken(`${v}.${Number(exp) + 9999}.${sig}`, SECRET)).toBe(false);
    expect(verifySessionToken(token, "t".repeat(40))).toBe(false);
    expect(verifySessionToken("garbage", SECRET)).toBe(false);
    expect(verifySessionToken(`v2.${exp}.${sig}`, SECRET)).toBe(false);
  });
});

describe("authenticate", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/api", { headers });

  it("accepts the demo bearer token in dev only", () => {
    expect(authenticate(req({ authorization: `Bearer ${DEMO_TOKEN}` }), makeConfig())).toEqual({ ok: true, via: "bearer" });
    expect(authenticate(req({ authorization: "Bearer wrong-token-000000000" }), makeConfig())).toEqual({ ok: false, reason: "unauthorized" });
    const prod = makeConfig({ VERCEL: "1" });
    expect(prod.demoTokenEnabled).toBe(false);
    expect(authenticate(req({ authorization: `Bearer ${DEMO_TOKEN}` }), prod)).toEqual({ ok: false, reason: "auth_not_configured" });
    expect(makeConfig({ VERCEL: "1", LIQUID_ALLOW_DEMO_TOKEN: "true" }).demoTokenEnabled).toBe(true);
  });

  it("accepts a valid session cookie on hosted deploys", () => {
    const config = makeConfig({ VERCEL: "1", LIQUID_INSIGHTS_ACCESS_CODE: "open-sesame", LIQUID_SESSION_SECRET: SECRET });
    const token = createSessionToken(SECRET);
    expect(authenticate(req({ cookie: `other=1; __Host-li_session=${token}` }), config)).toEqual({ ok: true, via: "session" });
    expect(authenticate(req({ cookie: `li_session=${token}` }), config)).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("builds hardened cookies", () => {
    const prod = makeConfig({ VERCEL: "1" });
    expect(buildSessionCookie(prod, "abc")).toBe(`__Host-li_session=abc; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${SESSION_TTL_SECONDS}`);
    expect(buildSessionCookie(makeConfig(), null)).toBe("li_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  });

  it("compares access codes safely", () => {
    const config = makeConfig({ LIQUID_INSIGHTS_ACCESS_CODE: "open-sesame" });
    expect(accessCodeMatches(" open-sesame ", config)).toBe(true);
    expect(accessCodeMatches("open-sesam", config)).toBe(false);
    expect(accessCodeMatches(123, config)).toBe(false);
    expect(accessCodeMatches("anything", makeConfig())).toBe(false);
  });
});

describe("loadConfig", () => {
  it("ignores weak secrets and invalid repos", () => {
    const config = loadConfig({ LIQUID_BFF_DEMO_TOKEN: "short", LIQUID_SESSION_SECRET: "tiny", GITHUB_REPOS: "not a repo, ok/repo", XAI_TIMEOUT_MS: "5" });
    expect(config.demoToken).toBeNull();
    expect(config.sessionSecret).toBeNull();
    expect(config.github.repos).toEqual(["ok/repo"]);
    expect(config.xai.timeoutMs).toBe(12_000);
    expect(config.xai.model).toBe("grok-4-fast-non-reasoning");
  });

  it("falls back to default repos when none are valid", () => {
    expect(loadConfig({ GITHUB_REPOS: "???" }).github.repos).toHaveLength(2);
  });
});

describe("RateLimiter", () => {
  it("blocks after the max within the window and recovers after", () => {
    let now = 0;
    const limiter = new RateLimiter(() => now);
    const rule = { name: "t", windowMs: 1_000, max: 2 };
    expect(limiter.allow(rule, "ip")).toBe(true);
    expect(limiter.allow(rule, "ip")).toBe(true);
    expect(limiter.allow(rule, "ip")).toBe(false);
    expect(limiter.allow(rule, "other")).toBe(true);
    now = 1_001;
    expect(limiter.allow(rule, "ip")).toBe(true);
  });
});

describe("TtlCache", () => {
  it("serves hits until expiry", async () => {
    let now = 0;
    const cache = new TtlCache(() => now);
    let loads = 0;
    const load = async () => ++loads;
    expect(await cache.getOrLoad("k", 100, load)).toBe(1);
    expect(await cache.getOrLoad("k", 100, load)).toBe(1);
    now = 101;
    expect(await cache.getOrLoad("k", 100, load)).toBe(2);
    cache.clear();
    expect(await cache.getOrLoad("k", 100, load)).toBe(3);
  });
});

describe("redaction", () => {
  it("scrubs emails and credential-shaped strings", () => {
    const text = "ping tom@example.com with ghp_abcdefghijklmnopqrstuvwxyz0123 and xai-ABCDEFGHIJKLMNOPQRSTUVWX";
    expect(redact(text)).toBe("ping [email] with [secret] and [secret]");
  });

  it("clips and flattens whitespace", () => {
    expect(clip("a\n\n b   c", 100)).toBe("a b c");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
    expect(clip(null, 5)).toBe("");
  });

  it("parses cookie headers", () => {
    expect(parseCookies("a=1; b = 2;bad; =x")).toEqual({ a: "1", b: "2" });
    expect(parseCookies(null)).toEqual({});
  });
});
