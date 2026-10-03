/** Publishing the handbook + decision records to Linear (GitHub and Linear faked). */
import { describe, expect, it } from "vitest";
import { banner, collectSources, parseBanner, planPublish, publish, renderContent, rewriteLinks, sourceUrl, type ExistingDoc, type PublishSource } from "../../server/handbook/publish.js";
import { jsonResponse, mockFetch } from "../helpers.js";

const INS = "gloverthomas/meridian-analytics";
const WF = "gloverthomas/liquid-workflow";

const src = (path: string, title: string, body: string, sortOrder = 0, repo = INS): PublishSource => ({ repo, path, title, body, sortOrder });

describe("links and banners", () => {
  it("rewrites relative links to the Linear copy when published, else to GitHub; keeps absolute links", () => {
    const published = new Map([[sourceUrl(INS, "docs/handbook/01-system-map.md"), "https://linear.app/doc/map"]]);
    const md = "[map](01-system-map.md) [readme](../../README.md#run) [adr](../decisions/0001-x.md) [ext](https://x.dev) [anchor](#here)";
    expect(rewriteLinks(md, INS, "docs/handbook/00-start-here.md", published)).toBe(
      `[map](https://linear.app/doc/map) [readme](https://github.com/${INS}/blob/main/README.md#run) [adr](https://github.com/${INS}/blob/main/docs/decisions/0001-x.md) [ext](https://x.dev) [anchor](#here)`,
    );
  });

  it("round-trips the banner's source and hash, and ignores docs without one", () => {
    expect(parseBanner(`${banner(WF, "docs/decisions/0001-a.md", "abcdef0123")}\n\nbody`)).toEqual({ url: sourceUrl(WF, "docs/decisions/0001-a.md"), hash: "abcdef0123" });
    expect(parseBanner("A doc the team wrote in Linear")).toBeNull();
    // As Linear stores it after saving: links wrapped in angle brackets.
    const stored = banner(WF, "docs/decisions/0001-a.md", "abcdef0123").replace(/\]\((https:[^)]+)\)/, "](<$1>)");
    expect(stored).toContain("](<https://");
    expect(parseBanner(stored)).toEqual({ url: sourceUrl(WF, "docs/decisions/0001-a.md"), hash: "abcdef0123" });
  });

  it("hashes content so unchanged docs aren't rewritten", () => {
    const a = renderContent(src("docs/handbook/06-glossary.md", "06 · Glossary", "- BFF"), new Map());
    const b = renderContent(src("docs/handbook/06-glossary.md", "06 · Glossary", "- BFF"), new Map());
    const c = renderContent(src("docs/handbook/06-glossary.md", "06 · Glossary", "- BFF, changed"), new Map());
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    expect(a.content.startsWith("> 📌 Published from GitHub:")).toBe(true);
  });
});

describe("collectSources", () => {
  it("orders handbook pages first, then decisions per repo, skipping READMEs", async () => {
    const fetch = mockFetch((url) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/contents/docs/handbook")) return jsonResponse([{ name: "01-system-map.md", type: "file", path: "docs/handbook/01-system-map.md" }, { name: "00-start-here.md", type: "file", path: "docs/handbook/00-start-here.md" }]);
      if (path.endsWith("liquid-workflow/contents/docs/decisions")) return jsonResponse([{ name: "README.md", type: "file", path: "docs/decisions/README.md" }, { name: "0002-b.md", type: "file", path: "docs/decisions/0002-b.md" }]);
      if (path.endsWith("/contents/docs/decisions")) return jsonResponse([]);
      if (path.endsWith("00-start-here.md")) return new Response("# Start here\n\nHello");
      if (path.endsWith("01-system-map.md")) return new Response("# System map\n\nBoxes");
      if (path.endsWith("0002-b.md")) return new Response("# 0002 — Linear drives it\n\nBody");
      return new Response("missing", { status: 404 });
    });
    const sources = await collectSources({ token: null, fetch });
    expect(sources.map((s) => [s.title, s.sortOrder])).toEqual([
      ["00 · Start here", 0],
      ["01 · System map", 1],
      ["Decision · Workflow 0002 — Linear drives it", 102],
    ]);
    expect(sources[0].body.trim()).toBe("Hello");
  });
});

type Body = { query: string; variables: { id?: string; input: { title: string; content: string } & Record<string, unknown> } };

/** Stateful fake Linear with one team doc we don't own and one we published earlier. */
function fakeLinear(initial: ExistingDoc[]) {
  const docs = [...initial];
  const writes: Body[] = [];
  let n = 0;
  const fetch = mockFetch((url, init) => {
    if (url !== "https://api.linear.app/graphql") return undefined;
    const body = JSON.parse(String(init?.body)) as Body;
    if (body.query.includes("documentCreate")) {
      writes.push(body);
      const doc = { id: `new-${++n}`, title: body.variables.input.title, url: `https://linear.app/doc/new-${n}`, content: body.variables.input.content };
      docs.push(doc);
      return jsonResponse({ data: { documentCreate: { document: doc } } });
    }
    if (body.query.includes("documentUpdate")) {
      writes.push(body);
      const doc = docs.find((d) => d.id === body.variables.id)!;
      Object.assign(doc, body.variables.input);
      return jsonResponse({ data: { documentUpdate: { success: true } } });
    }
    if (body.query.includes("documents(")) return jsonResponse({ data: { documents: { nodes: docs } } });
    return undefined;
  });
  return { fetch, writes, docs };
}

describe("publish", () => {
  const start = src("docs/handbook/00-start-here.md", "00 · Start here", "See [map](01-system-map.md).", 0);
  const map = src("docs/handbook/01-system-map.md", "01 · System map", "Boxes.", 1);
  const teamDoc: ExistingDoc = { id: "team-1", title: "On-call notes", url: "https://linear.app/doc/team-1", content: "Written in Linear" };

  it("dry run writes nothing", async () => {
    const linear = fakeLinear([teamDoc]);
    const result = await publish([start, map], "team", { apiKey: "k", fetch: linear.fetch }, false);
    expect(result.created).toEqual(["00 · Start here", "01 · System map"]);
    expect(linear.writes).toHaveLength(0);
  });

  it("creates missing docs, links pages to each other's Linear copies, and leaves team docs alone", async () => {
    const linear = fakeLinear([teamDoc]);
    const result = await publish([start, map], "team", { apiKey: "k", fetch: linear.fetch }, true);
    expect(result).toMatchObject({ created: ["00 · Start here", "01 · System map"], updated: [], orphans: [] });
    const startDoc = linear.docs.find((d) => d.title === "00 · Start here")!;
    const mapDoc = linear.docs.find((d) => d.title === "01 · System map")!;
    expect(startDoc.content).toContain(`[map](${mapDoc.url})`);
    expect(linear.writes.every((w) => w.variables.id !== "team-1")).toBe(true);
    expect(linear.docs.find((d) => d.id === "team-1")!.content).toBe("Written in Linear");

    // Second run: nothing changed → no writes.
    const before = linear.writes.length;
    const again = await publish([start, map], "team", { apiKey: "k", fetch: linear.fetch }, true);
    expect(again).toMatchObject({ created: [], updated: [], unchanged: 2 });
    expect(linear.writes.length).toBe(before);
  });

  it("updates only what changed and reports orphans without deleting them", async () => {
    const linear = fakeLinear([teamDoc]);
    await publish([start, map], "team", { apiKey: "k", fetch: linear.fetch }, true);
    const changed = { ...map, body: "Boxes and arrows." };
    const result = await publish([changed], "team", { apiKey: "k", fetch: linear.fetch }, true);
    expect(result.updated).toEqual(["01 · System map"]);
    expect(result.orphans).toEqual(["00 · Start here"]);
    expect(linear.writes.some((w) => w.query.includes("Delete"))).toBe(false);
  });

  it("plans from existing banners", () => {
    const existing: ExistingDoc = { id: "d1", title: "01 · System map", url: "u", content: renderContent(map, new Map()).content };
    const plan = planPublish([start, map], [existing], new Map());
    expect(plan.create.map((s) => s.title)).toEqual(["00 · Start here"]);
    expect(plan.unchanged.map((s) => s.title)).toEqual(["01 · System map"]);
  });
});
