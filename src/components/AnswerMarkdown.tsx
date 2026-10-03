/**
 * Safe, tiny markdown → React (no innerHTML): paragraphs, bullet/numbered
 * lists, **bold**, _italic_, `code`, and `[source-id]` citation tokens that
 * become numbered footnote links to the Sources list.
 */
import type { ReactNode } from "react";
import { CITATION_TOKEN_SOURCE } from "../../shared/citations";
import { parseBlocks } from "../lib/markdown";

interface AnswerMarkdownProps {
  text: string;
  /** Citation id → 1-based footnote number. Unknown ids are dropped. */
  citationIndex: ReadonlyMap<string, number>;
  /** DOM id prefix for footnote anchors, unique per answer. */
  anchorPrefix: string;
}

// Bold, code, italic, or a citation token (non-capturing, so split() keeps whole tokens).
const INLINE = new RegExp(`(\\*\\*[^*]+\\*\\*|\`[^\`]+\`|_[^_\\s][^_]*_|${CITATION_TOKEN_SOURCE.replace("(", "(?:")})`, "g");

function renderInline(text: string, props: AnswerMarkdownProps, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={k}>{part.slice(1, -1)}</code>;
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
    if (part.startsWith("[") && part.endsWith("]")) {
      const n = props.citationIndex.get(part.slice(1, -1));
      if (!n) return null;
      return (
        <a key={k} className="cite" href={`#${props.anchorPrefix}-${n}`} aria-label={`Source ${n}`}>
          {n}
        </a>
      );
    }
    return part;
  });
}

export function AnswerMarkdown(props: AnswerMarkdownProps) {
  return (
    <div className="md">
      {parseBlocks(props.text).map((block, i) => {
        if (block.kind === "p") return <p key={i}>{renderInline(block.text, props, `p${i}`)}</p>;
        const List = block.kind;
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item, props, `l${i}-${j}`)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
