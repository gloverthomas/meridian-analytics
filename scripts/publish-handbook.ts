/**
 * Publish the handbook + decision records from GitHub main to Linear.
 *
 *   npm run handbook:publish            # dry run: shows what would change
 *   npm run handbook:publish -- --apply # writes to Linear
 *
 * Needs LINEAR_ACTIONS_API_KEY (write) and optionally GITHUB_TOKEN, from the env or .env.local.
 */
import { collectSources, publish, teamIdForKey } from "../server/handbook/publish.js";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // optional
  }
}

const apply = process.argv.includes("--apply");
const apiKey = process.env.LINEAR_ACTIONS_API_KEY?.trim();
if (!apiKey) {
  process.stderr.write("LINEAR_ACTIONS_API_KEY is required (a Linear key with write access).\n");
  process.exit(1);
}

const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init);
const sources = await collectSources({ token: process.env.GITHUB_TOKEN?.trim() || null, fetch: fetchImpl });
const teamId = await teamIdForKey(process.env.LINEAR_TEAM_KEY?.trim() || "LIQ", { apiKey, fetch: fetchImpl });
const result = await publish(sources, teamId, { apiKey, fetch: fetchImpl }, apply);

const list = (label: string, items: string[]) => items.length && process.stdout.write(`${label} (${items.length}):\n${items.map((t) => `  - ${t}`).join("\n")}\n`);
process.stdout.write(`${apply ? "Published" : "DRY RUN (add --apply to write)"}: ${sources.length} sources\n`);
list(apply ? "Created" : "Would create", result.created);
list(apply ? "Updated" : "Would update", result.updated);
process.stdout.write(`Unchanged: ${result.unchanged}\n`);
list("Orphans (published before, source gone; not deleted)", result.orphans);
