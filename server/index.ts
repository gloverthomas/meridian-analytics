/**
 * Local BFF — loopback only, dev/test only. The Vite proxy injects the demo
 * bearer token; the browser never sees it.
 */
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { MAX_BODY_BYTES } from "./http.js";
import { logEvent } from "./log.js";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file); // does not override variables already set
  } catch {
    // file is optional
  }
}

if (!["development", "test"].includes(process.env.NODE_ENV ?? "")) {
  throw new Error("The local BFF only runs with NODE_ENV=development or test. Hosted deploys use api/index.ts.");
}

const config = loadConfig();
if (!config.demoTokenEnabled) {
  throw new Error("LIQUID_BFF_DEMO_TOKEN must be set (≥16 chars) — copy .env.example to .env.local.");
}

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.INSIGHTS_API_PORT ?? "4200", 10);
const app = createApp({ config });

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      // Let the app produce the 413; just stop buffering past the cap.
      if (total <= MAX_BODY_BYTES + 1) chunks.push(chunk);
    });
    req.on("end", () => resolve(chunks.length ? Buffer.concat(chunks) : null));
    req.on("error", reject);
  });
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${HOST}:${PORT}`}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(", "));
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await readBody(req) : null;
  return new Request(url, { method: req.method, headers, body: body ? new Uint8Array(body) : undefined });
}

async function sendWebResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) {
    res.end();
    return;
  }
  // Write chunks as they come so streamed answers (NDJSON) reach the browser live.
  res.flushHeaders();
  const reader = response.body.getReader();
  res.on("close", () => void reader.cancel().catch(() => undefined));
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const server = createServer(async (req, res) => {
  const requestId = randomUUID();
  try {
    const request = await toWebRequest(req);
    const path = new URL(request.url).pathname;
    const response = await app(request, { ip: req.socket.remoteAddress ?? "unknown", requestId, path });
    await sendWebResponse(response, res);
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ requestId, error: "internal_error" }));
  }
});

server.listen(PORT, HOST, () => {
  logEvent("server_started", {
    service: "meridian-analytics-bff",
    host: HOST,
    port: PORT,
    mode: config.xai.apiKey ? "grok" : "fixture",
  });
});
