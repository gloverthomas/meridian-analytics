/**
 * Environment → typed, validated config. Read once per process (or per test via
 * `loadConfig(customEnv)`). Nothing here is ever sent to the browser.
 */

export interface Config {
  /** True on Vercel or NODE_ENV=production — tightens auth defaults. */
  isProductionLike: boolean;
  allowedOrigins: string[];
  demoToken: string | null;
  /** Bearer demo token is honoured only in dev, or in prod behind an explicit flag. */
  demoTokenEnabled: boolean;
  accessCode: string | null;
  sessionSecret: string | null;
  allowFixtures: boolean;
  xai: { apiKey: string | null; model: string; timeoutMs: number };
  linear: { apiKey: string | null; teamId: string | null; teamKey: string };
  /** Write-scoped Linear key for confirmed ticket moves. Absent = actions off. */
  actions: { linearApiKey: string | null; allowedStates: string[]; secret: string | null };
  github: { token: string | null; repos: string[]; branch: string };
  /** IANA zone for day/week chart buckets. */
  timeZone: string;
  /** apiKey = personal key (read queries); projectToken = public phc_ token (writes the question log). */
  posthog: { apiKey: string | null; projectId: string | null; host: string; projectToken: string | null };
  sentry: { token: string | null; org: string; host: string; environment: string };
  /** liquid-workflow control plane (Cursor SDK plans/evals). Token is server-side only. */
  workflow: { baseUrl: string; token: string | null };
  /**
   * Slack bot. botToken (xoxb-) + signingSecret switch it on; approverIds are the
   * Slack user IDs allowed to press Approve / Move buttons (empty = no buttons).
   */
  slack: { botToken: string | null; signingSecret: string | null; approverIds: string[]; publicUrl: string };
}

type Env = Record<string, string | undefined>;

const DEFAULT_MODEL = "grok-4-fast-non-reasoning";
const DEFAULT_REPOS = ["gloverthomas/meridian-saas-core", "gloverthomas/meridian-saas-reporting"];
const DEFAULT_XAI_TIMEOUT_MS = 12_000;
const MIN_DEMO_TOKEN_CHARS = 16;
const MIN_ACCESS_CODE_CHARS = 8;
const MIN_SESSION_SECRET_CHARS = 32;
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function str(env: Env, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function atLeast(value: string | null, min: number): string | null {
  return value && value.length >= min ? value : null;
}

function parseRepos(raw: string | null): string[] {
  if (!raw) return DEFAULT_REPOS;
  const repos = raw
    .split(",")
    .map((repo) => repo.trim())
    .filter((repo) => REPO_PATTERN.test(repo));
  return repos.length ? repos : DEFAULT_REPOS;
}

function parseTimeZone(raw: string | null): string {
  const zone = raw ?? "Australia/Sydney";
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return zone;
  } catch {
    return "UTC";
  }
}

/** Only PostHog's own hosts: the key is sent there, so this must not be free-form (SSRF). */
const POSTHOG_HOSTS = new Set(["https://us.posthog.com", "https://eu.posthog.com", "https://app.posthog.com"]);

function parsePosthogHost(raw: string | null): string {
  const host = (raw ?? "https://us.posthog.com").replace(/\/+$/, "");
  return POSTHOG_HOSTS.has(host) ? host : "https://us.posthog.com";
}

/** Sentry's own API hosts only: the token is sent there (SSRF guard). */
const SENTRY_HOSTS = new Set(["https://sentry.io", "https://us.sentry.io", "https://de.sentry.io"]);

function parseSentryHost(raw: string | null): string {
  const host = (raw ?? "https://us.sentry.io").replace(/\/+$/, "");
  return SENTRY_HOSTS.has(host) ? host : "https://us.sentry.io";
}

/** The workflow URL gets a bearer token, so only our own domain (or loopback in dev) is allowed. */
function parseWorkflowUrl(raw: string | null, isProductionLike: boolean): string {
  const fallback = "http://127.0.0.1:4100";
  const value = (raw ?? fallback).replace(/\/+$/, "");
  try {
    const url = new URL(value);
    const ours = url.protocol === "https:" && (url.hostname === "meridian-saas.local" || url.hostname.endsWith(".meridian-saas.local"));
    const loopback = !isProductionLike && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    return ours || loopback ? `${url.origin}` : fallback;
  } catch {
    return fallback;
  }
}

function parseTimeout(raw: string | null): number {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) && value >= 1_000 && value <= 60_000 ? value : DEFAULT_XAI_TIMEOUT_MS;
}

export function loadConfig(env: Env = process.env): Config {
  const isProductionLike = env.VERCEL === "1" || env.NODE_ENV === "production";
  const demoToken = atLeast(str(env, "LIQUID_BFF_DEMO_TOKEN"), MIN_DEMO_TOKEN_CHARS);
  const demoTokenFlag = str(env, "LIQUID_ALLOW_DEMO_TOKEN") === "true";

  return {
    isProductionLike,
    allowedOrigins: (str(env, "LIQUID_INSIGHTS_APP_ORIGIN") ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    demoToken,
    demoTokenEnabled: Boolean(demoToken) && (!isProductionLike || demoTokenFlag),
    accessCode: atLeast(str(env, "LIQUID_INSIGHTS_ACCESS_CODE"), MIN_ACCESS_CODE_CHARS),
    sessionSecret: atLeast(str(env, "LIQUID_SESSION_SECRET"), MIN_SESSION_SECRET_CHARS),
    allowFixtures: str(env, "LIQUID_INSIGHTS_ALLOW_FIXTURES") !== "false",
    xai: {
      apiKey: str(env, "XAI_API_KEY"),
      model: str(env, "XAI_MODEL") ?? DEFAULT_MODEL,
      timeoutMs: parseTimeout(str(env, "XAI_TIMEOUT_MS")),
    },
    linear: {
      apiKey: str(env, "LINEAR_API_KEY"),
      teamId: str(env, "LINEAR_TEAM_ID"),
      teamKey: str(env, "LINEAR_TEAM_KEY") ?? "KAN",
    },
    actions: {
      linearApiKey: str(env, "LINEAR_ACTIONS_API_KEY"),
      allowedStates: (str(env, "LIQUID_ACTIONS_ALLOWED_STATES") ?? "In Progress")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      // Signs confirmation tokens: the session secret on hosted deploys, the demo token locally.
      secret: atLeast(str(env, "LIQUID_SESSION_SECRET"), MIN_SESSION_SECRET_CHARS) ?? demoToken,
    },
    github: {
      token: str(env, "GITHUB_TOKEN"),
      repos: parseRepos(str(env, "GITHUB_REPOS")),
      branch: str(env, "GITHUB_BRANCH") ?? "main",
    },
    timeZone: parseTimeZone(str(env, "LIQUID_TIMEZONE")),
    workflow: {
      baseUrl: parseWorkflowUrl(str(env, "WORKFLOW_BASE_URL"), isProductionLike),
      token: atLeast(str(env, "WORKFLOW_API_TOKEN"), 24),
    },
    slack: {
      botToken: /^xoxb-[A-Za-z0-9-]{20,}$/.test(str(env, "SLACK_BOT_TOKEN") ?? "") ? str(env, "SLACK_BOT_TOKEN") : null,
      signingSecret: atLeast(str(env, "SLACK_SIGNING_SECRET"), 16),
      approverIds: (str(env, "SLACK_APPROVER_IDS") ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^[UW][A-Z0-9]{6,}$/.test(id)),
      publicUrl: /^https:\/\/[\w.-]+$/.test(str(env, "INSIGHTS_PUBLIC_URL") ?? "") ? str(env, "INSIGHTS_PUBLIC_URL")! : "http://localhost:5173",
    },
    sentry: {
      token: str(env, "SENTRY_AUTH_TOKEN"),
      org: /^[a-z0-9-]{1,64}$/.test(str(env, "SENTRY_ORG") ?? "") ? str(env, "SENTRY_ORG")! : "liquid-accounting",
      host: parseSentryHost(str(env, "SENTRY_HOST")),
      environment: /^[a-z0-9_-]{1,32}$/i.test(str(env, "SENTRY_ENVIRONMENT") ?? "") ? str(env, "SENTRY_ENVIRONMENT")! : "production",
    },
    posthog: {
      apiKey: str(env, "POSTHOG_PERSONAL_API_KEY"),
      projectId: /^\d{1,12}$/.test(str(env, "POSTHOG_PROJECT_ID") ?? "") ? str(env, "POSTHOG_PROJECT_ID") : null,
      host: parsePosthogHost(str(env, "POSTHOG_HOST")),
      projectToken: /^phc_[A-Za-z0-9_-]{20,}$/.test(str(env, "POSTHOG_PROJECT_TOKEN") ?? "") ? str(env, "POSTHOG_PROJECT_TOKEN") : null,
    },
  };
}

export function sessionAuthEnabled(config: Config): boolean {
  return Boolean(config.accessCode && config.sessionSecret);
}
