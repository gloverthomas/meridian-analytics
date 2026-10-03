/**
 * One chat turn: plan → retrieve → Grok synthesis (with one JSON repair) →
 * citation mapping. Falls back to a canned sample answer or a deterministic
 * digest — never to an answer that contradicts the retrieved sources.
 */
import type { ChartSpec, ChatTurn, Citation, PipelineTimeline, ProposedAction, Provider, RetrievalMeta } from "../shared/contracts.js";
import { ASK_CATALOG, isHelpQuestion } from "../shared/askCatalog.js";
import { proposeImplement } from "./actions/workflowImplement.js";
import { runWorkflowQuestion } from "./workflowQuestions.js";
import { runDocsQuestion } from "./docsQuestions.js";
import type { QuestionChannel } from "./telemetry.js";
import { detectTicketAction, proposeTransition } from "./actions/linearTransition.js";
import type { Config } from "./config.js";
import { fixtureAnswerFor } from "./fixtures/responses.js";
import type { GrokClient, GrokMessage } from "./grok/client.js";
import { parseGrokResponse, type ParsedGrokAnswer } from "./grok/parseResponse.js";
import { diagramFromDocs, type FlowDiagram } from "../shared/flow.js";
import { createReplyExtractor } from "./grok/replyStream.js";
import { errorCode, logEvent } from "./log.js";
import { ANSWER_STYLES, DIAGRAM_INSTRUCTION, GROK_INSIGHTS_SYSTEM_PROMPT, REPAIR_INSTRUCTION } from "./prompts/system.js";
import { runRetrieval, type RetrievalDeps } from "./retrieval/index.js";
import { isDiagramRequest, planRetrieval, questionForRetrieval, type RetrievalPlan } from "./retrieval/router.js";
import type { RetrievedItem } from "./retrieval/types.js";

export interface InsightAnswer {
  reply: string;
  citations: Citation[];
  relatedQuestions: string[];
  provider: Provider;
  retrievalMeta: RetrievalMeta;
  proposedAction?: ProposedAction;
  charts?: ChartSpec[];
  timeline?: PipelineTimeline;
  diagram?: FlowDiagram;
}

export interface InsightDeps extends RetrievalDeps {
  grok: GrokClient | null;
  requestId?: string;
  /** Where the question came from; decides what's safe to include (e.g. open security work is web-only). */
  channel?: QuestionChannel;
  /** Streaming only: receives the answer text as Grok writes it (before validation). */
  onReplyDelta?: (text: string) => void;
}

const DIGEST_ITEMS = 6;
const WORKFLOW_INTENTS = new Set(["workflow_plan", "evals", "pipeline"]);
const FALLBACK_CITATIONS = 3;
const DEFAULT_FOLLOW_UPS = ["What's going on with KAN-5?", "What merged on Reporting this week?", "Is assistant-unit passing on Core main?"];

function diagramTitle(items: RetrievedItem[]): string {
  const raw = items[0]?.citation.title ?? "How it fits together";
  return raw.split("›").pop()?.trim() || raw;
}

function knowledgeDiagram(plan: RetrievalPlan, context: string, items: RetrievedItem[]): FlowDiagram | null {
  if (plan.intent !== "how_it_works") return null;
  return diagramFromDocs(context, diagramTitle(items));
}

function buildMessages(message: string, history: ChatTurn[], context: string, meta: RetrievalMeta, plan: RetrievalPlan): GrokMessage[] {
  const sampleNote = Object.entries(meta.connectorModes)
    .map(([connector, mode]) => `${connector}=${mode}`)
    .join(", ");
  const retrieval = context || "(no matching items were retrieved)";
  const diagram = plan.intent === "how_it_works" || isDiagramRequest(message) ? `\n\n${DIAGRAM_INSTRUCTION}` : "";
  return [
    { role: "system", content: GROK_INSIGHTS_SYSTEM_PROMPT },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    {
      role: "user",
      content: `RETRIEVAL (connectors: ${sampleNote}; window: ${meta.window}; truncated: ${meta.truncated})\n<<<\n${retrieval}\n>>>\n\n${ANSWER_STYLES[plan.style]}${diagram}\n\nQUESTION: ${message}`,
    },
  ];
}

async function synthesize(grok: GrokClient, messages: GrokMessage[], knownIds: Set<string>, onReplyDelta?: (text: string) => void): Promise<ParsedGrokAnswer | null> {
  let first: string;
  if (onReplyDelta && grok.stream) {
    const reply = createReplyExtractor();
    first = await grok.stream(messages, (chunk) => {
      const text = reply.push(chunk);
      if (text) onReplyDelta(text);
    });
  } else {
    first = await grok.complete(messages);
  }
  const parsed = parseGrokResponse(first, knownIds);
  if (parsed) return parsed;
  const repaired = await grok.complete([...messages, { role: "assistant", content: first.slice(0, 2_000) }, { role: "user", content: REPAIR_INSTRUCTION }]);
  return parseGrokResponse(repaired, knownIds);
}

function citationsFor(ids: string[], items: RetrievedItem[]): Citation[] {
  const byId = new Map(items.map((item) => [item.citation.id, item.citation]));
  const cited = ids.map((id) => byId.get(id)).filter((c): c is Citation => Boolean(c));
  // Contract: ≥1 citation whenever retrieval returned data.
  return cited.length ? cited : items.slice(0, FALLBACK_CITATIONS).map((item) => item.citation);
}

export function digestAnswer(items: RetrievedItem[], reason: "unconfigured" | "failed"): Pick<InsightAnswer, "reply" | "citations" | "relatedQuestions"> {
  if (!items.length) {
    return {
      reply: "**I couldn't find anything in Linear or GitHub for that.** Try a ticket id like KAN-5, a repo name, or one of the suggested prompts.",
      citations: [],
      relatedQuestions: DEFAULT_FOLLOW_UPS,
    };
  }
  const lead =
    reason === "unconfigured"
      ? "**Grok isn't connected, so here are the most relevant sources I found (not a summary):**"
      : "**Grok didn't respond in time, so here are the most relevant sources I found (not a summary):**";
  const top = items.slice(0, DIGEST_ITEMS);
  const bullets = top.map((item) => `- **${item.citation.title}**${item.citation.status ? ` (${item.citation.status})` : ""} [${item.citation.id}]`);
  return { reply: [lead, ...bullets].join("\n"), citations: top.map((item) => item.citation), relatedQuestions: DEFAULT_FOLLOW_UPS };
}

function fallbackAnswer(plan: RetrievalPlan, items: RetrievedItem[], meta: RetrievalMeta, reason: "unconfigured" | "failed"): Omit<InsightAnswer, "retrievalMeta"> {
  const allSample = Object.values(meta.connectorModes).every((mode) => mode !== "live");
  const fixture = allSample ? fixtureAnswerFor(plan.intent, plan.issueIds) : null;
  const retrievedIds = new Set(items.map((item) => item.citation.id));
  if (fixture && fixture.requires.every((id) => retrievedIds.has(id))) {
    const parsed = parseGrokResponse(JSON.stringify({ reply: fixture.reply, citations: fixture.requires }), retrievedIds);
    if (parsed) {
      return { reply: parsed.reply, citations: citationsFor(parsed.citationIds, items), relatedQuestions: fixture.relatedQuestions, provider: "fixture" };
    }
  }
  return { ...digestAnswer(items, reason), provider: "digest" };
}

/** The in-chat version of the "What can I ask?" panel. Deterministic: no retrieval, no Grok. */
export function helpAnswer(): InsightAnswer {
  const lines = ASK_CATALOG.map((t) => `- **${t.title}** (${t.sources}): ${t.blurb} Try "${t.examples[0]}"`);
  return {
    reply: `**You can ask about tickets, code, errors, product usage and the Cursor workflow.** Every answer cites its sources.\n${lines.join("\n")}\n\nAdd a time window ("last 2 weeks") or a ticket id (KAN-5) to narrow things down.`,
    citations: [],
    relatedQuestions: ["How are our evals tracking?", "What issues have we had from our code base this week?", "Where is KAN-5 in the pipeline?"],
    provider: "digest",
    retrievalMeta: { connectors: [], connectorModes: {}, window: "n/a", truncated: false, itemCount: 0 },
  };
}

export async function answerQuestion(message: string, history: ChatTurn[], config: Config, deps: InsightDeps): Promise<InsightAnswer> {
  if (isHelpQuestion(message)) return helpAnswer();
  // Requests to change a ticket never reach Grok: rules detect them and the viewer must confirm.
  const action = detectTicketAction(message);
  if (action) return proposeTransition(action, config, deps);

  const asked = questionForRetrieval(message, history);
  const plan = planRetrieval(asked, config.github.repos);
  const workflowIntent = WORKFLOW_INTENTS.has(plan.intent);
  const workflow = workflowIntent ? await runWorkflowQuestion(plan, config, deps.fetch, (deps.now ?? Date.now)()) : null;
  const docs = plan.intent === "how_it_works" ? await runDocsQuestion(asked, config, deps.fetch, deps.channel ?? "web", deps.cache) : null;
  const { context, items, meta, charts } = workflow ?? (docs ? { ...docs, charts: [] } : await runRetrieval(plan, config, deps));
  // Plan answers offer "Approve & implement" when the plan's eval passed (still confirm-gated).
  const proposal = workflow?.plan?.evalPassed ? await proposeImplement(workflow.plan.issueId, config, deps).catch(() => null) : null;
  const chartPart = {
    ...(charts.length ? { charts } : {}),
    ...(workflow?.timeline ? { timeline: workflow.timeline } : {}),
    ...(proposal ? { proposedAction: proposal } : {}),
  };

  // Workflow questions with nothing to cite (service down / no runs) say why, rather than "found nothing".
  const docsNoData =
    docs && !items.length
      ? {
          reply: context.startsWith("DOCS UNAVAILABLE")
            ? "**I couldn't read the docs right now.** Try again in a minute."
            : "**I couldn't find docs that cover that.** Try naming the area (e.g. the write gate, eval harness, Slack approvals, the workflow API), or if it isn't written down yet, add a decision record in `docs/decisions/`.",
          citations: [],
          relatedQuestions: ["How does the human write gate work?", "Why did we build a deterministic eval harness?", "How is the workflow API secured?"],
          provider: "digest" as const,
        }
      : null;
  const workflowNoData =
    docsNoData ??
    (workflowIntent && !items.length
      ? {
          reply: `**${context.replace(/^\[workflow:none\]\s*|^WORKFLOW SERVICE UNAVAILABLE:\s*/, "").split(/(?<=\.)\s/)[0]}**\n\n${context.includes("UNAVAILABLE") ? "Start it with `NODE_ENV=development npm start` in liquid-workflow, then ask again." : ""}`.trim(),
          citations: [],
          relatedQuestions: ["How are our evals tracking?", "Which tickets are still in progress?", "Move KAN-18 to In Progress"],
          provider: "digest" as const,
        }
      : null);

  if (deps.grok && items.length) {
    try {
      const knownIds = new Set(items.map((item) => item.citation.id));
      const parsed = await synthesize(deps.grok, buildMessages(message, history, context, meta, plan), knownIds, deps.onReplyDelta);
      if (parsed) {
        const diagram = parsed.diagram ?? knowledgeDiagram(plan, context, items);
        return {
          reply: parsed.reply,
          citations: citationsFor(parsed.citationIds, items),
          relatedQuestions: parsed.relatedQuestions.length ? parsed.relatedQuestions : DEFAULT_FOLLOW_UPS,
          provider: `grok:${deps.grok.model}`,
          retrievalMeta: meta,
          ...(diagram ? { diagram } : {}),
          ...chartPart,
        };
      }
      logEvent("grok_fallback", { requestId: deps.requestId, grok_error: "invalid_json_after_repair" });
    } catch (error) {
      logEvent("grok_fallback", { requestId: deps.requestId, grok_error: errorCode(error) });
    }
    const diagram = knowledgeDiagram(plan, context, items);
    return { ...(workflowNoData ?? fallbackAnswer(plan, items, meta, "failed")), retrievalMeta: meta, ...(diagram ? { diagram } : {}), ...chartPart };
  }

  const diagram = knowledgeDiagram(plan, context, items);
  return { ...(workflowNoData ?? fallbackAnswer(plan, items, meta, deps.grok ? "failed" : "unconfigured")), retrievalMeta: meta, ...(diagram ? { diagram } : {}), ...chartPart };
}
