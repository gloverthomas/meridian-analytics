/** Web-standard Request/Response helpers shared by the local server and the Vercel function. */

export interface RequestContext {
  /** Client IP as determined by the adapter (socket locally, platform header on Vercel). */
  ip: string;
  requestId: string;
  /** Path after adapter normalisation, e.g. `/api/v1/insights/chat`. */
  path: string;
}

export const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export function json(
  status: number,
  requestId: string,
  payload: object,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ requestId, ...payload }), {
    status,
    headers: { ...BASE_HEADERS, "X-Request-Id": requestId, ...extraHeaders },
  });
}

export function noContent(requestId: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...extraHeaders },
  });
}

export function errorResponse(status: number, requestId: string, error: string, message?: string): Response {
  return json(status, requestId, message ? { error, message } : { error });
}

export class BodyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export const MAX_BODY_BYTES = 64_000;

/** Reads a JSON object body with a hard byte cap. Throws BodyError on anything else. */
export async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyError(413, "request_too_large");

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new BodyError(415, "json_required");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) throw new BodyError(413, "request_too_large");
  if (!raw.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BodyError(400, "invalid_json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BodyError(400, "invalid_json");
  }
  return parsed as Record<string, unknown>;
}

export function parseCookies(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const raw of (header ?? "").split(";")) {
    const part = raw.trim();
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    cookies[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return cookies;
}

/**
 * Newline-delimited JSON stream. `run` gets a `send` that writes one event per
 * line; the stream closes when `run` settles. Writes after a client disconnect
 * are dropped rather than thrown.
 */
export function ndjsonStream(requestId: string, run: (send: (event: object) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: object) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await run(send);
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(body, {
    status: 200,
    headers: { ...BASE_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8", "X-Accel-Buffering": "no", "X-Request-Id": requestId },
  });
}
