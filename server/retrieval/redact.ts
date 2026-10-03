/** Scrubs text before it reaches Grok: emails, credential-shaped strings, and control chars. */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRETS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxai-[A-Za-z0-9]{20,}\b/g,
  /\blin_api_[A-Za-z0-9]{20,}\b/g,
  /\bsk-[A-Za-z0-9-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/g,
];

export function redact(text: string): string {
  let out = text.replace(EMAIL, "[email]");
  for (const pattern of SECRETS) out = out.replace(pattern, "[secret]");
  return out;
}

/** Collapses whitespace, redacts, and hard-caps length with an ellipsis. */
export function clip(text: string | null | undefined, maxChars: number): string {
  const flat = redact(String(text ?? ""))
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars - 1).trimEnd()}…` : flat;
}
