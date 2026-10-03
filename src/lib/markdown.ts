/** Line-level markdown parsing for answers; inline formatting is handled by AnswerMarkdown. */

export type Block = { kind: "p"; text: string } | { kind: "ul" | "ol"; items: string[] };

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const ordered = line.match(/^\d+[.)]\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const kind = ordered ? "ol" : bullet ? "ul" : null;
    if (kind) {
      const last = blocks.at(-1);
      const item = (ordered ?? bullet)![1];
      if (last && last.kind === kind) blocks[blocks.length - 1] = { kind, items: [...last.items, item] };
      else blocks.push({ kind, items: [item] });
      continue;
    }
    // Headings are flattened to bold paragraphs to keep answers compact.
    blocks.push({ kind: "p", text: heading ? `**${heading[1]}**` : line });
  }
  return blocks;
}

/**
 * Makes half-written markdown render cleanly: hides a citation token still being
 * written ("[linear:KAN-2") and closes a bold phrase that's still open.
 */
export function tidyStreaming(raw: string): string {
  const text = raw.replace(/\[[a-z]*(:[^\]\s]*)?$/i, "");
  if ((text.match(/\*\*/g)?.length ?? 0) % 2 === 0) return text;
  return text.endsWith("**") ? text.slice(0, -2) : `${text}**`;
}
