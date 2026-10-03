/**
 * Docs connector: how the system works and why. Reads an allowlist of Markdown
 * docs (READMEs, policies, decision records) and the design comment at the top
 * of key source files from each repo's `main`, plus Linear Documents. Splits
 * them by heading and cites each section as a link.
 *
 * Only allowlisted paths are read (never arbitrary code or config), so nothing
 * outside the curated docs can end up in an answer.
 */
import type { FetchLike, RetrievedItem } from "./types.js";
import { CONNECTOR_TIMEOUT_MS } from "./types.js";
import { clip, redact } from "./redact.js";

const GITHUB_API = "https://api.github.com";
const SECTION_CHARS = 1_600;
const MAX_DOC_ITEMS = 12;
const WF = "gloverthomas/liquid-workflow";
const INSIGHTS = "gloverthomas/meridian-analytics";
const CORE = "gloverthomas/meridian-saas-core";
const REPORTING = "gloverthomas/meridian-saas-reporting";

/** Markdown files and folders of decision records (read in full). */
export const DOC_PATHS: Array<{ repo: string; path: string; dir?: boolean }> = [
  { repo: WF, path: "README.md" },
  { repo: WF, path: "WRITE-POLICY.md" },
  { repo: WF, path: "docs/decisions", dir: true },
  { repo: INSIGHTS, path: "README.md" },
  { repo: INSIGHTS, path: "docs/ARCHITECTURE.md" },
  { repo: INSIGHTS, path: "docs/CONNECTORS.md" },
  { repo: INSIGHTS, path: "docs/decisions", dir: true },
  { repo: INSIGHTS, path: "docs/handbook", dir: true },
  { repo: CORE, path: "README.md" },
  { repo: CORE, path: "docs/decisions", dir: true },
  { repo: REPORTING, path: "README.md" },
  { repo: REPORTING, path: "docs/decisions", dir: true },
];

/** Source files whose leading design comment explains a key control (only that comment is read). */
export const CODE_HEADER_PATHS: Array<{ repo: string; path: string }> = [
  { repo: WF, path: "src/access.ts" },
  { repo: WF, path: "src/guardrails.ts" },
  { repo: WF, path: "src/pii.ts" },
  { repo: WF, path: "src/feature-map.ts" },
  { repo: INSIGHTS, path: "server/actions/linearTransition.ts" },
  { repo: INSIGHTS, path: "server/actions/workflowImplement.ts" },
  { repo: INSIGHTS, path: "server/slack/handler.ts" },
  { repo: INSIGHTS, path: "server/telemetry.ts" },
];

/**
 * Copies of repo docs published to Linear start with this (visible) line and are
 * skipped, so each doc is only searched once, from its source.
 */
export const PUBLISHED_MARKER = "📌 Published from GitHub:";

export interface DocSection {
  id: string;
  source: string;
  title: string;
  heading: string;
  url: string;
  body: string;
  updatedAt: string | null;
  isDecision: boolean;
}

export interface DocsDeps {
  githubToken: string | null;
  linearApiKey: string | null;
  fetch: FetchLike;
}

const shortRepo = (repo: string) => repo.split("/")[1];

/** GitHub's heading anchor: lowercase, drop punctuation except hyphens/spaces, spaces → hyphens. */
export function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .trim()
    .replace(/ /g, "-");
}

/** Splits Markdown into sections at `##` headings; the `#` title names the doc. */
export function splitMarkdown(markdown: string): { title: string; sections: Array<{ heading: string; body: string }> } {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const title = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim() ?? "";
  const sections: Array<{ heading: string; body: string }> = [];
  let heading = "";
  let buffer: string[] = [];
  let inFence = false;
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s+/.test(line)) {
      flush();
      heading = line.replace(/^##\s+/, "").trim();
      continue;
    }
    if (!inFence && /^#\s+/.test(line)) continue;
    buffer.push(line);
  }
  flush();
  return { title, sections };
}

/** The first `/** … *\/` block in the file's opening lines, as plain text. */
export function leadingComment(source: string): string | null {
  const head = source.split("\n").slice(0, 60).join("\n");
  const match = head.match(/\/\*\*([\s\S]*?)\*\//);
  if (!match) return null;
  const text = match[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\* ?/, ""))
    .join("\n")
    .trim();
  return text.length >= 40 ? text : null;
}

async function github(path: string, deps: DocsDeps, raw: boolean): Promise<Response> {
  const res = await deps.fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "User-Agent": "meridian-analytics",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(deps.githubToken ? { Authorization: `Bearer ${deps.githubToken}` } : {}),
    },
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`github_docs_${res.status}`);
  return res;
}

const fileText = (repo: string, path: string, deps: DocsDeps) =>
  github(`/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=main`, deps, true).then((r) => r.text());

function sectionsFrom(repo: string, path: string, markdown: string): DocSection[] {
  const { title, sections } = splitMarkdown(markdown);
  const docTitle = title || path;
  const isDecision = path.startsWith("docs/decisions/") && !path.endsWith("README.md");
  return sections.map(({ heading, body }) => {
    const anchor = heading ? `#${slugify(heading)}` : "";
    return {
      id: `docs:${shortRepo(repo)}/${path}${anchor}`,
      source: `${shortRepo(repo)}/${path}`,
      title: docTitle,
      heading,
      url: `https://github.com/${repo}/blob/main/${path}${anchor}`,
      body,
      updatedAt: null,
      isDecision,
    };
  });
}

async function repoDocs(deps: DocsDeps): Promise<DocSection[]> {
  const markdownPaths = (
    await Promise.all(
      DOC_PATHS.map(async ({ repo, path, dir }) => {
        if (!dir) return [{ repo, path }];
        const listing = (await (await github(`/repos/${repo}/contents/${path}?ref=main`, deps, false)).json().catch(() => [])) as Array<{ name: string; type: string; path: string }>;
        return Array.isArray(listing) ? listing.filter((f) => f.type === "file" && f.name.endsWith(".md")).map((f) => ({ repo, path: f.path })) : [];
      }).map((p) => p.catch(() => [] as Array<{ repo: string; path: string }>)),
    )
  ).flat();

  const markdown = await Promise.all(
    markdownPaths.map(({ repo, path }) =>
      fileText(repo, path, deps)
        .then((text) => sectionsFrom(repo, path, text))
        .catch(() => [] as DocSection[]),
    ),
  );
  const headers = await Promise.all(
    CODE_HEADER_PATHS.map(({ repo, path }) =>
      fileText(repo, path, deps)
        .then((source): DocSection[] => {
          const comment = leadingComment(source);
          return comment
            ? [{ id: `docs:${shortRepo(repo)}/${path}`, source: `${shortRepo(repo)}/${path}`, title: `${path} (design comment)`, heading: "", url: `https://github.com/${repo}/blob/main/${path}`, body: comment, updatedAt: null, isDecision: false }]
            : [];
        })
        .catch(() => [] as DocSection[]),
    ),
  );
  return [...markdown.flat(), ...headers.flat()];
}

interface LinearDocument {
  slugId: string;
  title: string;
  url: string;
  content: string | null;
  updatedAt: string;
}

async function linearDocs(deps: DocsDeps): Promise<DocSection[]> {
  if (!deps.linearApiKey) return [];
  const res = await deps.fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: deps.linearApiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ documents(first: 250, orderBy: updatedAt) { nodes { slugId title url content updatedAt } } }" }),
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`linear_docs_${res.status}`);
  const body = (await res.json()) as { data?: { documents?: { nodes: LinearDocument[] } } };
  /** Skip GitHub→Linear auto-sync mirrors (hash in banner); keep manual-sync handbook pages. */
  const isAutoSyncedGithubMirror = (content: string) =>
    content.includes(PUBLISHED_MARKER) && /· sync [0-9a-f]{10}/.test(content.slice(0, 600));

  return (body.data?.documents?.nodes ?? [])
    .filter((d) => d.content && !isAutoSyncedGithubMirror(d.content))
    .flatMap((d) =>
      splitMarkdown(`# ${d.title}\n${d.content}`).sections.map(({ heading, body: text }) => ({
        id: `docs:linear/${d.slugId}${heading ? `#${slugify(heading)}` : ""}`,
        source: `Linear doc "${d.title}"`,
        title: d.title,
        heading,
        url: d.url,
        body: text,
        updatedAt: d.updatedAt,
        isDecision: false,
      })),
    );
}

/** Everything searchable. Individual failures are skipped; throws only if nothing at all could be read. */
export async function loadDocCorpus(deps: DocsDeps): Promise<DocSection[]> {
  const [repo, linear] = await Promise.all([repoDocs(deps), linearDocs(deps).catch(() => [] as DocSection[])]);
  const all = [...repo, ...linear];
  if (!all.length) throw new Error("docs_unavailable");
  return all;
}

const STOP = new Set(
  "the and for are was were how why what when where who does did do our we you your with this that from into have has had its it's about there their then than which would could should can will just like any all but not use used using work works".split(" "),
);

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu) ?? []).filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Question words → the words our docs actually use. Applied to questions only, never to the docs. */
const SYNONYMS: Record<string, string[]> = {
  secured: ["security", "token", "auth", "access"],
  secure: ["security", "token", "auth", "access"],
  security: ["token", "auth", "secret", "access"],
  api: ["control", "plane", "route", "routes", "token"],
  authenticated: ["auth", "token", "signature"],
  verified: ["signature", "secret", "verify"],
  approve: ["approval", "write-gate"],
  approval: ["approve", "write-gate"],
  approvals: ["approve", "approval", "write-gate"],
  onboarding: ["setup", "run", "readme"],
  start: ["setup", "run"],
  deploy: ["vercel", "hosting"],
  deployed: ["vercel", "hosting"],
  hosted: ["tunnel", "hosting", "vercel"],
  privacy: ["pii", "posthog", "telemetry"],
  signal: ["triage", "todo", "product", "kickoff"],
  kick: ["kickoff", "kicks", "trigger"],
  kicks: ["kick", "kickoff", "trigger"],
  kickoff: ["kick", "kicks", "trigger"],
  chat: ["assistant", "new"],
  bugbot: ["autofix", "review"],
  grok: ["xai", "assistant"],
  sdk: ["agent", "cursor", "planner"],
  specialist: ["reviewer", "security", "quality"],
  composer: ["fallback", "router"],
  credential: ["secret", "token", "access"],
  credentials: ["secret", "token", "access"],
  merge: ["human", "github"],
  merges: ["human", "github"],
  seam: ["reporting", "parity"],
  eligibility: ["allowlist", "product"],
  sidebar: ["file", "cursor"],
};

export function queryTokens(question: string): string[] {
  const base = tokens(
    question.replace(/\bsginal\b/gi, "signal").replace(/\bgroq\b/gi, "grok").replace(/\bsignal[- ]to[- ]sdk\b/gi, "signal to sdk"),
  );
  return [...new Set([...base, ...base.flatMap((t) => SYNONYMS[t] ?? [])])];
}

/** BM25 over sections, with extra weight on title/heading matches and on decision records for "why" questions. */
export function rankSections(question: string, sections: DocSection[], limit = MAX_DOC_ITEMS): DocSection[] {
  const terms = queryTokens(question);
  if (!terms.length || !sections.length) return [];
  const docs = sections.map((s) => ({ s, words: tokens(`${s.title} ${s.heading} ${s.body}`), head: new Set(tokens(`${s.title} ${s.heading} ${s.source}`)) }));
  const avg = docs.reduce((a, d) => a + d.words.length, 0) / docs.length || 1;
  const df = new Map(terms.map((t) => [t, docs.filter((d) => d.words.includes(t)).length]));
  const asksWhy = /\bwhy\b|\breason|\bdecid|\brationale\b/i.test(question);
  const k1 = 1.2;
  const b = 0.75;
  return docs
    .map(({ s, words, head }) => {
      let score = 0;
      for (const t of terms) {
        const tf = words.filter((w) => w === t).length;
        const n = df.get(t) ?? 0;
        if (!tf) continue;
        const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * words.length) / avg)));
        if (head.has(t)) score += idf * 0.75;
      }
      // "Why" questions are what decision records are for; they should beat a merely on-topic heading.
      if (score > 0 && asksWhy && s.isDecision) score *= 2;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

export function normalizeSection(s: DocSection): RetrievedItem {
  const label = s.heading ? `${s.title} › ${s.heading}` : s.title;
  return {
    connector: "docs",
    citation: { id: s.id, kind: "doc", title: clip(`${label}`, 110), url: s.url, status: s.isDecision ? "decision record" : s.source.split("/")[0] },
    text: `[${s.id}] ${s.isDecision ? "DECISION RECORD" : "DOC"} ${s.source} — ${label}\n${clip(redact(s.body), SECTION_CHARS)}`,
    updatedAt: s.updatedAt,
    mentions: [],
  };
}

export const DOC_REPOS = [WF, INSIGHTS, CORE, REPORTING];
