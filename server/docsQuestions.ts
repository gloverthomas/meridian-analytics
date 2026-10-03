/**
 * "How does X work / why did we do Y?" — onboarding and triage questions about
 * the workflow, tooling and security. Retrieval is docs sections (repo docs,
 * decision records, design comments, Linear Documents) plus merged PRs whose
 * descriptions often hold the rationale. Open security work is included on the
 * web only; Slack channels are readable by more people.
 */
import type { RetrievalMeta } from "../shared/contracts.js";
import type { Config } from "./config.js";
import { errorCode, logEvent } from "./log.js";
import { CACHE_TTL_MS, retrievalCache, type TtlCache } from "./retrieval/cache.js";
import { DOC_REPOS, loadDocCorpus, normalizeSection, rankSections, tokens, type DocSection } from "./retrieval/docs.js";
import { normalizePull, searchPulls } from "./retrieval/github.js";
import type { FetchLike, RetrievedItem } from "./retrieval/types.js";
import type { QuestionChannel } from "./telemetry.js";

export interface DocsOutcome {
  context: string;
  items: RetrievedItem[];
  meta: RetrievalMeta;
}

const MAX_RATIONALE_PRS = 3;
const SECURITY_TERMS = /\b(security|secure|auth\w*|tokens?|secrets?|vulnerab\w*|exposure|exposed|lock(ed)?[- ]?down|attack|pii|privacy|permissions?)\b/i;
const OPEN_SECURITY_QUERY = "is:open security OR auth OR vulnerability OR exposure OR lock-down in:title";

function meta(itemCount: number, modes: Partial<Record<"docs" | "github", "live" | "unavailable">>): RetrievalMeta {
  return {
    connectors: Object.keys(modes) as Array<"docs" | "github">,
    connectorModes: modes,
    window: "current docs on main",
    truncated: false,
    itemCount,
  };
}

/** The most distinctive words in the question, for a GitHub search (which ANDs its terms). */
function searchTerms(question: string, corpus: DocSection[]): string[] {
  const vocab = new Set(corpus.flatMap((s) => tokens(`${s.title} ${s.heading}`)));
  const words = [...new Set(tokens(question))];
  const known = words.filter((w) => vocab.has(w));
  return (known.length ? known : words).slice(0, 2);
}

export async function runDocsQuestion(
  question: string,
  config: Config,
  fetch: FetchLike,
  channel: QuestionChannel,
  cache: TtlCache = retrievalCache,
): Promise<DocsOutcome> {
  const docsDeps = { githubToken: config.github.token, linearApiKey: config.linear.apiKey, fetch };
  let corpus: DocSection[];
  try {
    corpus = await cache.getOrLoad("docs:corpus", CACHE_TTL_MS.docs, () => loadDocCorpus(docsDeps));
  } catch (error) {
    logEvent("connector_error", { connectors: ["docs"], connector_error: errorCode(error) });
    return { context: "DOCS UNAVAILABLE: the repo docs couldn't be read right now. Say so plainly.", items: [], meta: meta(0, { docs: "unavailable" }) };
  }

  const sections = rankSections(question, corpus).map(normalizeSection);
  const gh = config.github.token ? { token: config.github.token, fetch } : null;
  const terms = searchTerms(question, corpus);
  const wantsSecurity = SECURITY_TERMS.test(question);

  const [rationale, openSecurity] = await Promise.all([
    gh && terms.length
      ? searchPulls(`is:merged ${terms.join(" ")}`, DOC_REPOS, gh, MAX_RATIONALE_PRS).catch(() => [])
      : Promise.resolve([]),
    gh && wantsSecurity && channel === "web" ? searchPulls(OPEN_SECURITY_QUERY, DOC_REPOS, gh, MAX_RATIONALE_PRS).catch(() => []) : Promise.resolve([]),
  ]);
  const prItems = [...openSecurity, ...rationale]
    .filter((hit, i, all) => all.findIndex((h) => h.pull.html_url === hit.pull.html_url) === i)
    .map(({ repo, pull }) => normalizePull(repo, pull));

  const items = [...sections, ...prItems];
  const notes: string[] = [];
  if (wantsSecurity && channel === "slack") {
    notes.push("SECURITY IN FLIGHT: not included in Slack. If asked about open or unfixed security issues, say those are only discussed in the Meridian Insights web app.");
  } else if (wantsSecurity) {
    notes.push(openSecurity.length ? `SECURITY IN FLIGHT: ${openSecurity.length} open PR(s) below look security-related.` : "SECURITY IN FLIGHT: no open security-related PRs found in the four repos.");
  }
  if (!sections.some((s) => s.citation.status === "decision record") && /\bwhy\b/i.test(question)) {
    notes.push("RATIONALE: no decision record matched. If the sources don't explain why, say the reasoning isn't written down and suggest adding a decision record (docs/decisions/).");
  }

  const context = [...notes, ...items.map((item) => item.text)].join("\n\n");
  return { context, items, meta: meta(items.length, { docs: "live", ...(gh ? { github: "live" as const } : {}) }) };
}
