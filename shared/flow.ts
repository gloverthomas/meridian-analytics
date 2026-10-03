/**
 * A knowledge-answer flow. Nodes and edges come from Grok or from a numbered
 * list in the handbook. The UI draws them; it does not trust raw markup.
 */

export interface FlowNode {
  id: string;
  label: string;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowDiagram {
  title: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const MAX_FLOW_NODES = 10;
export const MAX_FLOW_LABEL = 80;
export const MAX_FLOW_TITLE = 90;

const ID = /^[a-z][a-z0-9-]{0,23}$/;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[`*]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Drops a malformed diagram so a bad model field cannot blank the answer. */
export function sanitizeFlow(value: unknown): FlowDiagram | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const title = cleanText(record.title, MAX_FLOW_TITLE);
  if (!title) return null;
  const seen = new Set<string>();
  const nodes: FlowNode[] = [];
  for (const raw of Array.isArray(record.nodes) ? record.nodes : []) {
    if (!raw || typeof raw !== "object") continue;
    const node = raw as Record<string, unknown>;
    const id = typeof node.id === "string" ? node.id.trim().toLowerCase() : "";
    const label = cleanText(node.label, MAX_FLOW_LABEL);
    if (!ID.test(id) || !label || seen.has(id)) continue;
    seen.add(id);
    nodes.push({ id, label });
    if (nodes.length >= MAX_FLOW_NODES) break;
  }
  if (nodes.length < 2) return null;
  const edges: FlowEdge[] = [];
  const edgeKey = new Set<string>();
  for (const raw of Array.isArray(record.edges) ? record.edges : []) {
    if (!raw || typeof raw !== "object") continue;
    const edge = raw as Record<string, unknown>;
    const from = typeof edge.from === "string" ? edge.from.trim().toLowerCase() : "";
    const to = typeof edge.to === "string" ? edge.to.trim().toLowerCase() : "";
    const key = `${from}>${to}`;
    if (!seen.has(from) || !seen.has(to) || from === to || edgeKey.has(key)) continue;
    edgeKey.add(key);
    edges.push({ from, to });
    if (edges.length >= MAX_FLOW_NODES) break;
  }
  if (!edges.length) return null;
  return { title, nodes, edges };
}

/** First numbered sequence of at least three steps. Docs context is often one flattened line. */
export function diagramFromDocs(context: string, title: string): FlowDiagram | null {
  const steps: string[] = [];
  for (const match of context.matchAll(/(?:^|\s)(\d+)\.\s+([\s\S]*?)(?=\s\d+\.\s+|$)/g)) {
    const n = Number(match[1]);
    if (n !== steps.length + 1) {
      if (steps.length >= 3) break;
      steps.length = 0;
      if (n !== 1) continue;
    }
    const label = cleanText(match[2], MAX_FLOW_LABEL);
    if (label) steps.push(label);
    if (steps.length >= MAX_FLOW_NODES) break;
  }
  if (steps.length < 3) return null;
  const nodes = steps.map((label, i) => ({ id: `n${i + 1}`, label }));
  return sanitizeFlow({
    title: cleanText(title, MAX_FLOW_TITLE) || "How it fits together",
    nodes,
    edges: nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id })),
  });
}

/** Layers for a top-to-bottom flow. A straight sequence is one node per row. */
export function flowLayers(diagram: FlowDiagram): FlowNode[][] {
  const depth = new Map<string, number>(diagram.nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < diagram.nodes.length; pass++) {
    let changed = false;
    for (const edge of diagram.edges) {
      const next = Math.min((depth.get(edge.from) ?? 0) + 1, diagram.nodes.length - 1);
      if (next > (depth.get(edge.to) ?? 0)) {
        depth.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const rows: FlowNode[][] = [];
  for (const node of diagram.nodes) {
    const row = depth.get(node.id) ?? 0;
    (rows[row] ??= []).push(node);
  }
  return rows.filter((row) => row.length > 0);
}
