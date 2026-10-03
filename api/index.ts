/**
 * Vercel Function entry. vercel.json rewrites `/api/:path*` here with the
 * original path in `__path`, so every route shares one warm instance and the
 * exact same handler as the local BFF.
 */
import { randomUUID } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import { createApp } from "../server/app.js";
import { loadConfig } from "../server/config.js";

// waitUntil keeps Slack answers running after the 200 that Slack needs within 3 seconds.
const app = createApp({ config: loadConfig(), waitUntil });

function resolvePath(url: URL): string {
  const rewritten = url.searchParams.get("__path");
  if (rewritten !== null) return `/api/${rewritten.replace(/^\/+/, "")}`;
  return url.pathname;
}

function clientIp(request: Request): string {
  // Set by Vercel's edge; not client-controllable on this platform.
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  return app(request, { ip: clientIp(request), requestId: randomUUID(), path: resolvePath(url) });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = handle;
