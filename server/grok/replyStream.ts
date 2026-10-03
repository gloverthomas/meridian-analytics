/**
 * Pulls the "reply" string out of Grok's JSON answer *while it streams*, so the
 * viewer can read the answer as it's written. Grok emits
 * {"reply":"…","citations":[…],"relatedQuestions":[…]}; we decode the reply's
 * JSON string escapes incrementally and ignore everything else. The final
 * answer is still parsed and validated from the full text afterwards.
 */
const KEY = /"reply"\s*:\s*"/;
const SIMPLE_ESCAPES: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

export interface ReplyExtractor {
  /** Feed the next raw chunk; returns newly decoded reply text (possibly ""). */
  push(chunk: string): string;
}

export function createReplyExtractor(): ReplyExtractor {
  let buffer = "";
  let state: "seeking" | "inside" | "done" = "seeking";

  function decode(): string {
    let out = "";
    let i = 0;
    while (i < buffer.length) {
      const ch = buffer[i];
      if (ch === '"') {
        state = "done";
        buffer = "";
        return out;
      }
      if (ch !== "\\") {
        out += ch;
        i += 1;
        continue;
      }
      const next = buffer[i + 1];
      if (next === undefined) break; // escape split across chunks
      if (next === "u") {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += /^[0-9a-f]{4}$/i.test(hex) ? String.fromCharCode(Number.parseInt(hex, 16)) : "";
        i += 6;
        continue;
      }
      out += SIMPLE_ESCAPES[next] ?? next;
      i += 2;
    }
    buffer = buffer.slice(i);
    return out;
  }

  return {
    push(chunk) {
      if (state === "done") return "";
      buffer += chunk;
      if (state === "seeking") {
        const match = KEY.exec(buffer);
        if (!match) {
          // Keep only a tail long enough to hold a split key.
          buffer = buffer.slice(-32);
          return "";
        }
        buffer = buffer.slice(match.index + match[0].length);
        state = "inside";
      }
      return decode();
    },
  };
}
