/**
 * Publishes the engineering handbook (analytics `docs/handbook/`) and every
 * repo's decision records (`docs/decisions/`) from GitHub `main` into Linear as
 * team documents, in a fixed order.
 *
 * GitHub stays the source of truth: each Linear copy starts with a banner that
 * links back to its source and carries a content hash, so re-running updates
 * only what changed. It only ever touches documents carrying that banner, and
 * never deletes anything (orphans are reported).
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { PUBLISHED_MARKER, splitMarkdown } from "../retrieval/docs.js";
import type { FetchLike } from "../retrieval/types.js";

const GITHUB_API = "https://api.github.com";
const LINEAR_API = "https://api.linear.app/graphql";
const TIMEOUT_MS = 15_000;

export const HANDBOOK = { repo: "gloverthomas/meridian-analytics", dir: "docs/handbook" };
export const DECISION_REPOS: Array<{ repo: string; label: string }> = [
  { repo: "gloverthomas/liquid-workflow", label: "Workflow" },
  { repo: "gloverthomas/meridian-analytics", label: "Insights" },
  { repo: "gloverthomas/meridian-saas-core", label: "Core" },
  { repo: "gloverthomas/meridian-saas-reporting", label: "Reporting" },
];

export interface PublishSource {
  repo: string;
  path: string;
  title: string;
  /** Markdown without its `#` title. */
  body: string;
  sortOrder: number;
}

export interface ExistingDoc {
  id: string;
  title: string;
  url: string;
  content: string | null;
}

export interface PublishPlan {
  create: PublishSource[];
  update: Array<{ source: PublishSource; doc: ExistingDoc }>;
  unchanged: PublishSource[];
  orphans: ExistingDoc[];
}

export const sourceUrl = (repo: string, path: string) => `https://github.com/${repo}/blob/main/${path}`;

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 10);

/** Banner line: marks the doc as ours, links to the source, and records the content hash. */
export function banner(repo: string, path: string, contentHash: string): string {
  return `> ${PUBLISHED_MARKER} [${repo.split("/")[1]}/${path}](${sourceUrl(repo, path)}). Edit it there; changes sync here automatically. · sync ${contentHash}`;
}

// Linear stores links as `[text](<url>)`, so the angle brackets are optional.
const BANNER_SOURCE = /📌 Published from GitHub: \[[^\]]*\]\(<?(https:\/\/github\.com\/[^)>\s]+)>?\)/;
const BANNER_HASH = /· sync ([0-9a-f]{10})/;

export function parseBanner(content: string | null): { url: string; hash: string | null } | null {
  const head = (content ?? "").slice(0, 600);
  const url = head.match(BANNER_SOURCE)?.[1];
  return url ? { url, hash: head.match(BANNER_HASH)?.[1] ?? null } : null;
}

/**
 * Relative links (`../README.md`, `0001-x.md#decision`) → the Linear copy when
 * that file is published, else the file on GitHub. Absolute links and anchors are kept.
 */
export function rewriteLinks(markdown: string, repo: string, path: string, published: ReadonlyMap<string, string>): string {
  return markdown.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_m, target: string) => {
    const [file, anchor] = target.split("#");
    const resolved = posix.normalize(posix.join(posix.dirname(path), file)).replace(/\/$/, "");
    const github = sourceUrl(repo, resolved);
    const linear = published.get(github);
    return `](${linear ?? `${github}${anchor ? `#${anchor}` : ""}`})`;
  });
}

export function renderContent(source: PublishSource, published: ReadonlyMap<string, string>): { content: string; hash: string } {
  const body = rewriteLinks(source.body, source.repo, source.path, published).trim();
  const contentHash = hash(`${source.title}\n${body}`);
  return { content: `${banner(source.repo, source.path, contentHash)}\n\n${body}\n`, hash: contentHash };
}

// ─── Reading sources from GitHub ────────────────────────────────────────────

interface GithubDeps {
  token: string | null;
  fetch: FetchLike;
}

async function gh(path: string, deps: GithubDeps, raw: boolean): Promise<Response> {
  const res = await deps.fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "User-Agent": "meridian-analytics",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(deps.token ? { Authorization: `Bearer ${deps.token}` } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`github_${res.status}_${path}`);
  return res;
}

async function markdownFiles(repo: string, dir: string, deps: GithubDeps): Promise<Array<{ path: string; text: string }>> {
  const listing = (await (await gh(`/repos/${repo}/contents/${dir}?ref=main`, deps, false)).json()) as Array<{ name: string; type: string; path: string }>;
  const files = listing.filter((f) => f.type === "file" && f.name.endsWith(".md") && f.name !== "README.md").sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(files.map(async (f) => ({ path: f.path, text: await (await gh(`/repos/${repo}/contents/${f.path}?ref=main`, deps, true)).text() })));
}

/** Titles and order: handbook "NN · Title" first (0–99), then decisions grouped by repo (100+). */
export async function collectSources(deps: GithubDeps): Promise<PublishSource[]> {
  const toSource = (repo: string, path: string, text: string, title: (h1: string) => string, sortOrder: number): PublishSource => {
    // Titles are plain text in Linear, so drop Markdown code ticks.
    const h1 = (splitMarkdown(text).title || posix.basename(path, ".md")).replace(/`/g, "");
    const body = text.replace(/^#\s+.*\n?/m, "");
    return { repo, path, title: title(h1), body, sortOrder };
  };

  const handbook = (await markdownFiles(HANDBOOK.repo, HANDBOOK.dir, deps)).map(({ path, text }) => {
    const n = Number.parseInt(posix.basename(path), 10);
    const order = Number.isFinite(n) ? n : 50;
    return toSource(HANDBOOK.repo, path, text, (h1) => `${String(order).padStart(2, "0")} · ${h1}`, order);
  });

  const decisions = (
    await Promise.all(
      DECISION_REPOS.map(async ({ repo, label }, r) =>
        (await markdownFiles(repo, "docs/decisions", deps)).map(({ path, text }) => {
          const n = Number.parseInt(posix.basename(path), 10) || 0;
          return toSource(repo, path, text, (h1) => `Decision · ${label} ${h1}`, 100 + r * 25 + n);
        }),
      ),
    )
  ).flat();

  return [...handbook, ...decisions];
}

// ─── Linear ─────────────────────────────────────────────────────────────────

export interface LinearDeps {
  apiKey: string;
  fetch: FetchLike;
}

async function linear<T>(query: string, variables: Record<string, unknown>, deps: LinearDeps): Promise<T> {
  const res = await deps.fetch(LINEAR_API, {
    method: "POST",
    headers: { Authorization: deps.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message: string }> };
  if (!res.ok || body.errors?.length || !body.data) throw new Error(`linear_${res.status}_${body.errors?.[0]?.message ?? "failed"}`);
  return body.data;
}

export async function teamIdForKey(key: string, deps: LinearDeps): Promise<string> {
  const data = await linear<{ teams: { nodes: Array<{ id: string; key: string }> } }>(`{ teams { nodes { id key } } }`, {}, deps);
  const team = data.teams.nodes.find((t) => t.key.toUpperCase() === key.toUpperCase());
  if (!team) throw new Error(`linear_team_not_found_${key}`);
  return team.id;
}

export async function existingPublished(teamId: string, deps: LinearDeps): Promise<ExistingDoc[]> {
  const data = await linear<{ documents: { nodes: ExistingDoc[] } }>(
    `query Docs($teamId: ID!) { documents(first: 250, filter: { team: { id: { eq: $teamId } } }) { nodes { id title url content } } }`,
    { teamId },
    deps,
  );
  return data.documents.nodes.filter((d) => parseBanner(d.content));
}

export function planPublish(sources: PublishSource[], existing: ExistingDoc[], published: ReadonlyMap<string, string>): PublishPlan {
  const bySource = new Map(existing.map((d) => [parseBanner(d.content)!.url, d]));
  const plan: PublishPlan = { create: [], update: [], unchanged: [], orphans: [] };
  for (const source of sources) {
    const doc = bySource.get(sourceUrl(source.repo, source.path));
    if (!doc) {
      plan.create.push(source);
      continue;
    }
    const { hash: next } = renderContent(source, published);
    if (parseBanner(doc.content)?.hash === next && doc.title === source.title) plan.unchanged.push(source);
    else plan.update.push({ source, doc });
  }
  const wanted = new Set(sources.map((s) => sourceUrl(s.repo, s.path)));
  plan.orphans = existing.filter((d) => !wanted.has(parseBanner(d.content)!.url));
  return plan;
}

export interface PublishResult {
  created: string[];
  updated: string[];
  unchanged: number;
  orphans: string[];
}

/**
 * Two passes so links between published pages can point at their Linear copies:
 * create any missing docs (banner only), then write every doc's final content.
 */
export async function publish(sources: PublishSource[], teamId: string, deps: LinearDeps, apply: boolean): Promise<PublishResult> {
  const existing = await existingPublished(teamId, deps);
  const urls = new Map(existing.map((d) => [parseBanner(d.content)!.url, d.url]));
  const firstPlan = planPublish(sources, existing, urls);
  const result: PublishResult = { created: [], updated: [], unchanged: 0, orphans: firstPlan.orphans.map((d) => d.title) };
  if (!apply) {
    return { ...result, created: firstPlan.create.map((s) => s.title), updated: firstPlan.update.map((u) => u.source.title), unchanged: firstPlan.unchanged.length };
  }

  const docs = new Map(existing.map((d) => [parseBanner(d.content)!.url, d]));
  for (const source of firstPlan.create) {
    const created = await linear<{ documentCreate: { document: ExistingDoc } }>(
      `mutation Create($input: DocumentCreateInput!) { documentCreate(input: $input) { document { id title url content } } }`,
      { input: { teamId, title: source.title, sortOrder: source.sortOrder, content: `${banner(source.repo, source.path, "0000000000")}\n` } },
      deps,
    );
    docs.set(sourceUrl(source.repo, source.path), created.documentCreate.document);
    urls.set(sourceUrl(source.repo, source.path), created.documentCreate.document.url);
    result.created.push(source.title);
  }

  for (const source of sources) {
    const doc = docs.get(sourceUrl(source.repo, source.path))!;
    const { content, hash: next } = renderContent(source, urls);
    if (parseBanner(doc.content)?.hash === next && doc.title === source.title) {
      result.unchanged += 1;
      continue;
    }
    await linear(
      `mutation Update($id: String!, $input: DocumentUpdateInput!) { documentUpdate(id: $id, input: $input) { success } }`,
      { id: doc.id, input: { title: source.title, content, sortOrder: source.sortOrder } },
      deps,
    );
    if (!result.created.includes(source.title)) result.updated.push(source.title);
  }
  return result;
}
