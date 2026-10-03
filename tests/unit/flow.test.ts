import { describe, expect, it } from "vitest";
import { diagramFromDocs, flowLayers, sanitizeFlow } from "../../shared/flow.js";

describe("sanitizeFlow", () => {
  it("keeps a short sequence and drops self-loops, duplicate ids, and a single node", () => {
    expect(
      sanitizeFlow({
        title: "  Signal path  ",
        nodes: [
          { id: "n1", label: "Reporting posts /signal" },
          { id: "n1", label: "duplicate" },
          { id: "n2", label: "Workflow opens a Todo" },
          { id: "Bad Id", label: "skipped" },
        ],
        edges: [
          { from: "n1", to: "n1" },
          { from: "n1", to: "n2" },
          { from: "n1", to: "missing" },
        ],
      }),
    ).toEqual({
      title: "Signal path",
      nodes: [
        { id: "n1", label: "Reporting posts /signal" },
        { id: "n2", label: "Workflow opens a Todo" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    });
    expect(sanitizeFlow({ title: "Only one", nodes: [{ id: "n1", label: "alone" }], edges: [] })).toBeNull();
  });
});

describe("diagramFromDocs", () => {
  it("chains the first numbered sequence of at least three steps", () => {
    const context = ["Intro", "1. one", "2. two", "", "1. Reporting posts the signal", "2. Workflow opens a Todo", "3. A human moves it to In Progress", "4. Approve implement starts the plan"].join("\n");
    const diagram = diagramFromDocs(context, "Handbook › Walk the signal to SDK path in full");
    expect(diagram?.title).toBe("Handbook › Walk the signal to SDK path in full");
    expect(diagram?.nodes.map((node) => node.label)).toEqual([
      "Reporting posts the signal",
      "Workflow opens a Todo",
      "A human moves it to In Progress",
      "Approve implement starts the plan",
    ]);
    expect(diagram?.edges).toEqual([
      { from: "n1", to: "n2" },
      { from: "n2", to: "n3" },
      { from: "n3", to: "n4" },
    ]);
    expect(diagramFromDocs("1. only\n2. two steps", "Short")).toBeNull();
    const flat = "How the write gate works. 1. Reporting posts the signal 2. Workflow opens a Todo 3. A human moves it to In Progress";
    expect(diagramFromDocs(flat, "Write gate")?.nodes.map((node) => node.label)).toEqual([
      "Reporting posts the signal",
      "Workflow opens a Todo",
      "A human moves it to In Progress",
    ]);
  });
});

describe("flowLayers", () => {
  it("puts a straight sequence on its own rows and a fork on one row", () => {
    const straight = sanitizeFlow({
      title: "Path",
      nodes: [
        { id: "n1", label: "A" },
        { id: "n2", label: "B" },
        { id: "n3", label: "C" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
      ],
    })!;
    expect(flowLayers(straight).map((row) => row.map((node) => node.id))).toEqual([["n1"], ["n2"], ["n3"]]);

    const fork = sanitizeFlow({
      title: "Fork",
      nodes: [
        { id: "n1", label: "A" },
        { id: "n2", label: "B" },
        { id: "n3", label: "C" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n1", to: "n3" },
      ],
    })!;
    expect(flowLayers(fork).map((row) => row.map((node) => node.id))).toEqual([["n1"], ["n2", "n3"]]);
  });
});
