/** HTTP contract for the BFF: auth, origin, limits, validation, and response shape. */
import { describe, expect, it } from "vitest";
import type { ChatResponse } from "../../shared/contracts.js";
import { createApp, type AppDeps } from "../../server/app.js";
import { RateLimiter } from "../../server/rateLimit.js";
import { DEMO_TOKEN, fakeGrok, get, makeConfig, mockFetch, postJson } from "../helpers.js";

let seq = 0;
const ctx = (path: string, ip = "1.1.1.1") => ({ ip, requestId: `req-${++seq}`, path });
const SECRET = "x".repeat(40);

function devApp(overrides: Partial<AppDeps> = {}) {
  return createApp({ config: makeConfig(), fetch: mockFetch(), grok: null, ...overrides });
}

describe("BFF routes", () => {
  it("serves health without auth and reports connector flags only", async () => {
    const res = await devApp()(get("/health", {}), ctx("/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", grok: "fixture", connectors: { linear: false, github: false, fixtures: true } });
    expect(JSON.stringify(body)).not.toContain(DEMO_TOKEN);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("rejects missing or wrong bearer tokens with 401", async () => {
    const app = devApp();
    expect((await app(get("/api/v1/organisation", {}), ctx("/api/v1/organisation"))).status).toBe(401);
    const wrong = await app(get("/api/v1/organisation", { Authorization: "Bearer nope-nope-nope-nope" }), ctx("/api/v1/organisation"));
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).requestId).toMatch(/^req-/);
  });

  it("returns org, orgs, prompts and connector status when authorised", async () => {
    const app = devApp();
    expect(await (await app(get("/api/v1/organisation"), ctx("/api/v1/organisation"))).json()).toMatchObject({ id: "org_liquid_coffee", name: "Liquid Coffee Co." });
    expect((await (await app(get("/api/v1/orgs"), ctx("/api/v1/orgs"))).json()).orgs).toHaveLength(1);
    expect((await (await app(get("/api/v1/suggested-prompts"), ctx("/api/v1/suggested-prompts"))).json()).prompts[0].label).toBe("Where New chat lives");
    expect((await app(get("/api/v1/connectors/status"), ctx("/api/v1/connectors/status"))).status).toBe(200);
    expect((await app(get("/api/v1/nope"), ctx("/api/v1/nope"))).status).toBe(404);
    expect((await app(postJson("/api/v1/orgs", {}), ctx("/api/v1/orgs"))).status).toBe(405);
  });

  it("blocks foreign origins but allows the app origin and same-host", async () => {
    const app = devApp();
    const foreign = await app(get("/api/v1/orgs", { Authorization: `Bearer ${DEMO_TOKEN}`, Origin: "https://evil.test" }), ctx("/api/v1/orgs"));
    expect(foreign.status).toBe(403);
    const ok = await app(get("/api/v1/orgs", { Authorization: `Bearer ${DEMO_TOKEN}`, Origin: "http://localhost:5173" }), ctx("/api/v1/orgs"));
    expect(ok.status).toBe(200);
    const fetchMeta = await app(
      get("/api/v1/orgs", { Authorization: `Bearer ${DEMO_TOKEN}`, Origin: "https://insights.example", "Sec-Fetch-Site": "same-origin" }),
      ctx("/api/v1/orgs"),
    );
    expect(fetchMeta.status).toBe(200);
    const forwarded = await app(
      get("/api/v1/orgs", { Authorization: `Bearer ${DEMO_TOKEN}`, Origin: "https://insights.example", "X-Forwarded-Host": "insights.example" }),
      ctx("/api/v1/orgs"),
    );
    expect(forwarded.status).toBe(200);
    const crossSite = await app(
      get("/api/v1/orgs", { Authorization: `Bearer ${DEMO_TOKEN}`, Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }),
      ctx("/api/v1/orgs"),
    );
    expect(crossSite.status).toBe(403);
    const preflight = await app(new Request("http://localhost:5173/api/v1/orgs", { method: "OPTIONS" }), ctx("/api/v1/orgs"));
    expect(preflight.status).toBe(204);
  });

  it("answers chat with the full contract shape (fixture mode)", async () => {
    const res = await devApp()(postJson("/api/v1/insights/chat", { message: "What's the status of KAN-5 and are there PRs?", orgId: "org_liquid_coffee" }), ctx("/api/v1/insights/chat"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.provider).toBe("fixture");
    expect(body.citations.map((c) => c.id)).toContain("linear:KAN-5");
    expect(body.relatedQuestions).toHaveLength(3);
    expect(body.retrievalMeta).toMatchObject({ connectors: ["linear", "github"], truncated: false });
    expect(typeof body.latencyMs).toBe("number");
  });

  it("uses Grok when a client is available", async () => {
    const grok = fakeGrok(JSON.stringify({ reply: "hi [linear:KAN-5]", citations: ["linear:KAN-5"], relatedQuestions: ["a", "b", "c"] }));
    const res = await devApp({ grok })(postJson("/api/v1/insights/chat", { message: "KAN-5?" }), ctx("/api/v1/insights/chat"));
    expect((await res.json()).provider).toBe("grok:grok-test");
  });

  it("validates chat input", async () => {
    const app = devApp();
    const cases: Array<[unknown, number, string]> = [
      [{ message: "x" }, 400, "invalid_message"],
      [{ message: "y".repeat(2001) }, 400, "invalid_message"],
      [{ message: "hello", orgId: "org_other" }, 400, "unknown_org"],
    ];
    for (const [body, status, error] of cases) {
      const res = await app(postJson("/api/v1/insights/chat", body), ctx("/api/v1/insights/chat"));
      expect(res.status).toBe(status);
      expect((await res.json()).error).toBe(error);
    }
    const notJson = new Request("http://localhost:5173/api/v1/insights/chat", { method: "POST", headers: { Authorization: `Bearer ${DEMO_TOKEN}`, "Content-Type": "text/plain" }, body: "hi" });
    expect((await app(notJson, ctx("/api/v1/insights/chat"))).status).toBe(415);
    const badJson = new Request("http://localhost:5173/api/v1/insights/chat", { method: "POST", headers: { Authorization: `Bearer ${DEMO_TOKEN}`, "Content-Type": "application/json" }, body: "{oops" });
    expect((await app(badJson, ctx("/api/v1/insights/chat"))).status).toBe(400);
    const huge = postJson("/api/v1/insights/chat", { message: "hello", pad: "z".repeat(70_000) });
    expect((await app(huge, ctx("/api/v1/insights/chat"))).status).toBe(413);
  });

  it("rate limits chat per IP", async () => {
    const app = devApp({ limiter: new RateLimiter() });
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await app(postJson("/api/v1/insights/chat", { message: "x" }), ctx("/api/v1/insights/chat", "9.9.9.9"))).status;
    }
    expect(last).toBe(429);
  });

  it("returns 500 without leaking details when something throws", async () => {
    // A config missing its github section makes retrieval planning throw.
    const broken = createApp({ config: { ...makeConfig(), github: null as never }, grok: null, fetch: mockFetch() });
    const res = await broken(postJson("/api/v1/insights/chat", { message: "hello there" }), ctx("/api/v1/insights/chat"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "internal_error" });
  });
});

describe("hosted auth (session cookie)", () => {
  const hosted = makeConfig({ VERCEL: "1", LIQUID_INSIGHTS_ACCESS_CODE: "coffee-demo-2026", LIQUID_SESSION_SECRET: SECRET });
  const hostedReq = (path: string, init: RequestInit = {}) =>
    new Request(`https://insights.example${path}`, { ...init, headers: { host: "insights.example", origin: "https://insights.example", ...(init.headers ?? {}) } });

  it("fails closed with 503 when no auth is configured", async () => {
    const app = createApp({ config: makeConfig({ VERCEL: "1" }), grok: null, fetch: mockFetch() });
    const res = await app(hostedReq("/api/v1/organisation"), ctx("/api/v1/organisation"));
    expect(res.status).toBe(503);
    expect((await app(hostedReq("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), ctx("/api/v1/session"))).status).toBe(503);
  });

  it("issues a cookie for the right code and accepts it", async () => {
    const app = createApp({ config: hosted, grok: null, fetch: mockFetch() });
    const bad = await app(hostedReq("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: "wrong" }) }), ctx("/api/v1/session"));
    expect(bad.status).toBe(401);

    const good = await app(hostedReq("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: "coffee-demo-2026" }) }), ctx("/api/v1/session"));
    expect(good.status).toBe(204);
    const cookie = good.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^__Host-li_session=v1\.\d+\.[\w-]+; Path=\/; HttpOnly; SameSite=Strict; Secure/);

    const authed = await app(hostedReq("/api/v1/organisation", { headers: { cookie: cookie.split(";")[0] } }), ctx("/api/v1/organisation"));
    expect(authed.status).toBe(200);

    // Demo token is refused in production unless explicitly enabled.
    const bearer = await app(hostedReq("/api/v1/organisation", { headers: { authorization: `Bearer ${DEMO_TOKEN}` } }), ctx("/api/v1/organisation"));
    expect(bearer.status).toBe(401);

    const logout = await app(hostedReq("/api/v1/session", { method: "DELETE" }), ctx("/api/v1/session"));
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("rate limits access-code attempts", async () => {
    const app = createApp({ config: hosted, grok: null, fetch: mockFetch(), limiter: new RateLimiter() });
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const req = hostedReq("/api/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessCode: "guess" }) });
      last = (await app(req, ctx("/api/v1/session", "7.7.7.7"))).status;
    }
    expect(last).toBe(429);
  });
});
