import { citationTokenRegex } from "../../shared/citations.js";
import { sanitizeFlow, type FlowDiagram } from "../../shared/flow.js";
/**
 * Validates Grok's JSON and enforces the citation contract: only ids that were
 * actually retrieved survive, both in the citations list and inline in the reply.
 */

export interface ParsedGrokAnswer {
  reply: string;
  citationIds: string[];
  relatedQuestions: string[];
  /** Present only when the model returned a usable flow. */
  diagram: FlowDiagram | null;
}

const MAX_REPLY_CHARS = 6_000;
const MAX_QUESTION_CHARS = 160;
const MAX_RELATED = 3;

function extractJsonObject(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function asId(value: unknown): string | null {
  if (typeof value === "string") return value.replace(/^\[|\]$/g, "").trim();
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return asId((value as { id: string }).id);
  }
  return null;
}

/** Returns null when the payload is unusable (caller may repair once, then fall back). */
export function parseGrokResponse(raw: string, knownIds: ReadonlySet<string>): ParsedGrokAnswer | null {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;

  const rawReply = typeof record.reply === "string" ? record.reply.trim() : "";
  if (!rawReply) return null;

  // Drop hallucinated inline tokens; keep known ones for the UI to render as source links.
  const inlineIds: string[] = [];
  const reply = rawReply
    .replace(citationTokenRegex(), (token, id: string) => {
      if (!knownIds.has(id)) return "";
      inlineIds.push(id);
      return token;
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .slice(0, MAX_REPLY_CHARS);

  const listed = (Array.isArray(record.citations) ? record.citations : []).map(asId).filter((id): id is string => Boolean(id && knownIds.has(id)));

  const relatedQuestions = (Array.isArray(record.relatedQuestions) ? record.relatedQuestions : [])
    .filter((q): q is string => typeof q === "string")
    .map((q) => q.trim().slice(0, MAX_QUESTION_CHARS))
    .filter(Boolean)
    .slice(0, MAX_RELATED);

  // Footnote order = order of first appearance in the text; unreferenced sources follow.
  return { reply, citationIds: [...new Set([...inlineIds, ...listed])], relatedQuestions, diagram: sanitizeFlow(record.diagram) };
}
