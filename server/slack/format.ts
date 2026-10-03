/**
 * An Insights answer → a Slack message (Block Kit). Markdown becomes mrkdwn,
 * inline [id] citations become numbered links, the pipeline becomes an emoji
 * checklist, charts become one-line summaries with a link to the web app, and
 * action proposals become buttons with a confirm dialog.
 */
import type { ChartSpec, Citation, FlowDiagram, PipelineTimeline, ProposedAction, TimelineStep } from "../../shared/contracts.js";
import { flowLayers } from "../../shared/flow.js";
import type { InsightAnswer } from "../insights.js";
import { citationTokenRegex } from "../../shared/citations.js";

export const ACTION_IDS = { approve: "insights_approve", cancel: "insights_cancel", ask: "insights_ask" } as const;
export const PROPOSAL_BLOCK_ID = "insights_proposal";
const SECTION_MAX = 2_900;
const BUTTON_TEXT_MAX = 75;
const MAX_SOURCES = 8;

export interface SlackFormatOptions {
  publicUrl: string;
  /** Approve/Move buttons are shown only when someone is allowed to press them. */
  actionsEnabled: boolean;
  /** For follow-up buttons: shows "<@U…> asked: …" above the answer. */
  askedBy?: { user: string; question: string };
}

export interface SlackRendered {
  text: string;
  blocks: unknown[];
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const CITATION = citationTokenRegex();

/** Markdown (as Grok writes it) → Slack mrkdwn. Citations become <url|[n]> when known, else disappear. */
export function toMrkdwn(markdown: string, citations: Citation[] = []): string {
  const index = new Map(citations.map((c, i) => [c.id, { n: i + 1, url: c.url }]));
  return escape(markdown)
    .split("\n")
    .map((line) => {
      const heading = line.match(/^#{1,6}\s+(.*)$/);
      if (heading) return `*${heading[1].replace(/\*\*/g, "")}*`;
      return line.replace(/^\s*[-*•]\s+/, "• ");
    })
    .join("\n")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(CITATION, (_m, id: string) => {
      const hit = index.get(id);
      return hit ? `<${hit.url}|[${hit.n}]>` : "";
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ");
}

/** Plain fallback text (notifications, screen readers): no markup, no citation tokens. */
export function plainText(markdown: string): string {
  return clip(markdown.replace(CITATION, "").replace(/\*\*/g, "").replace(/\s+\n/g, "\n").trim(), 3_000);
}

function sections(mrkdwn: string): unknown[] {
  const out: unknown[] = [];
  let current = "";
  for (const para of mrkdwn.split(/\n(?=\S)/)) {
    if (current && current.length + para.length + 1 > SECTION_MAX) {
      out.push({ type: "section", text: { type: "mrkdwn", text: current } });
      current = "";
    }
    current = current ? `${current}\n${para}` : clip(para, SECTION_MAX);
  }
  if (current) out.push({ type: "section", text: { type: "mrkdwn", text: current } });
  return out;
}

const STEP_ICON: Record<TimelineStep["status"], string> = { done: "✅", current: "🔵", failed: "❌", pending: "⚪", skipped: "➖" };

function timelineBlocks(t: PipelineTimeline): unknown[] {
  const lines = t.steps.map((s) => {
    const label = s.url ? `<${s.url}|${escape(s.label)}>` : escape(s.label);
    return `${STEP_ICON[s.status]} *${label}*${s.status === "current" ? " ← now" : ""} — ${escape(s.detail)}`;
  });
  return [{ type: "section", text: { type: "mrkdwn", text: clip(`*${escape(t.issueId)} pipeline* · ${escape(t.state)}\n${lines.join("\n")}`, SECTION_MAX) } }];
}

/** Charts can't render in Slack: say what they show and link to the web app. */
export function chartSummary(chart: ChartSpec): string {
  const series = chart.series[0];
  if (chart.kind === "ranked" && series) {
    const top = chart.categories
      .map((c, i) => [c, series.values[i] ?? 0] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, v]) => `${c} ${v}`)
      .join(", ");
    return `${chart.title}: ${top}`;
  }
  const totals = chart.series.map((s) => `${s.name} ${s.values.reduce((a, v) => a + v, 0)}`).join(" · ");
  return `${chart.title}: ${totals} ${chart.unit}`;
}

function proposalBlocks(p: ProposedAction, opts: SlackFormatOptions): unknown[] {
  const implement = p.kind === "workflow_implement";
  const summary = `*${escape(p.issueId)}* ${escape(p.issueTitle)}\n${escape(p.fromState)} → *${escape(p.toState)}*${implement ? "\n_Records your approval with the workflow and moves the ticket to In Review. Cursor then implements after its eval and CI gates; PRs still need a human to merge._" : ""}`;
  if (!opts.actionsEnabled) {
    return [
      { type: "section", text: { type: "mrkdwn", text: summary } },
      { type: "context", elements: [{ type: "mrkdwn", text: `To ${implement ? "approve" : "move it"}, use <${opts.publicUrl}|Meridian Insights> (no Slack approvers are set up).` }] },
    ];
  }
  const label = implement ? "Approve & implement" : `Move to ${p.toState}`;
  return [
    { type: "section", text: { type: "mrkdwn", text: summary } },
    {
      type: "actions",
      block_id: PROPOSAL_BLOCK_ID,
      elements: [
        {
          type: "button",
          action_id: ACTION_IDS.approve,
          style: "primary",
          text: { type: "plain_text", text: label },
          value: JSON.stringify({ k: p.kind, t: p.token }),
          confirm: {
            title: { type: "plain_text", text: implement ? "Approve the plan?" : "Move the ticket?" },
            text: { type: "mrkdwn", text: `${escape(p.issueId)}: ${escape(p.fromState)} → ${escape(p.toState)}. This changes Linear${implement ? " and starts the Cursor implement run" : ""}.` },
            confirm: { type: "plain_text", text: label },
            deny: { type: "plain_text", text: "Not yet" },
          },
        },
        { type: "button", action_id: ACTION_IDS.cancel, text: { type: "plain_text", text: "Cancel" }, value: "cancel" },
      ],
    },
  ];
}

function sourcesBlock(citations: Citation[]): unknown[] {
  if (!citations.length) return [];
  const lines = citations.slice(0, MAX_SOURCES).map((c, i) => `${i + 1}. <${c.url}|${escape(clip(c.title, 90))}>${c.status ? ` · ${escape(c.status)}` : ""}`);
  const more = citations.length > MAX_SOURCES ? `\n+${citations.length - MAX_SOURCES} more` : "";
  return [{ type: "context", elements: [{ type: "mrkdwn", text: `*Sources*\n${lines.join("\n")}${more}` }] }];
}

function followUpBlock(questions: string[]): unknown[] {
  const qs = questions.filter((q) => q.length <= 2_000).slice(0, 3);
  if (!qs.length) return [];
  return [
    {
      type: "actions",
      elements: qs.map((q, i) => ({
        type: "button",
        action_id: `${ACTION_IDS.ask}_${i}`,
        text: { type: "plain_text", text: clip(q, BUTTON_TEXT_MAX) },
        value: q,
      })),
    },
  ];
}

export function askedByBlock(user: string, question: string): unknown {
  return { type: "context", elements: [{ type: "mrkdwn", text: `<@${user}> asked: _${escape(clip(question, 280))}_` }] };
}

function diagramBlock(diagram: FlowDiagram): unknown {
  const lines = flowLayers(diagram)
    .map((row) => row.map((node) => node.label).join(" · "))
    .join(" → ");
  return { type: "section", text: { type: "mrkdwn", text: `*${escape(diagram.title)}*\n${escape(clip(lines, 500))}` } };
}

function badge(answer: InsightAnswer): string {
  if (answer.provider === "digest") return "Sources only";
  return Object.values(answer.retrievalMeta.connectorModes).includes("sample") ? "Sample data" : "Live data";
}

export function formatAnswer(answer: InsightAnswer, opts: SlackFormatOptions): SlackRendered {
  const blocks: unknown[] = [];
  if (opts.askedBy) blocks.push(askedByBlock(opts.askedBy.user, opts.askedBy.question));
  blocks.push(...sections(toMrkdwn(answer.reply, answer.citations)));
  if (answer.timeline) blocks.push(...timelineBlocks(answer.timeline));
  if (answer.diagram) blocks.push(diagramBlock(answer.diagram));
  if (answer.charts?.length) {
    const lines = answer.charts.map((c) => `📊 ${escape(chartSummary(c))}`);
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${lines.join("\n")}\n<${opts.publicUrl}|See the charts in Meridian Insights>` }] });
  }
  if (answer.proposedAction) blocks.push(...proposalBlocks(answer.proposedAction, opts));
  blocks.push(...sourcesBlock(answer.citations));
  blocks.push(...followUpBlock(answer.relatedQuestions));
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Meridian Insights · ${badge(answer)}` }] });
  return { text: plainText(answer.reply), blocks };
}

/** While Grok is still writing: the text so far with a cursor, no blocks. */
export function formatPartial(markdown: string): string {
  const withoutPartialCite = markdown.replace(/\[[a-z]*(:[^\]\s]*)?$/i, "");
  const bold = (withoutPartialCite.match(/\*\*/g)?.length ?? 0) % 2 === 1 ? `${withoutPartialCite}**` : withoutPartialCite;
  return `${toMrkdwn(bold).trimEnd()} ▍`;
}
