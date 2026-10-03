import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FlowDiagram as Flow } from "../../shared/contracts";
import { FlowDiagram } from "./FlowDiagram";

afterEach(cleanup);

const diagram: Flow = {
  title: "Signal to SDK",
  nodes: [
    { id: "n1", label: "Reporting posts /signal" },
    { id: "n2", label: "Workflow opens a Todo" },
    { id: "n3", label: "Human moves to In Progress" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
  ],
};

describe("FlowDiagram", () => {
  it("renders each stage in order under the flow title", () => {
    render(<FlowDiagram diagram={diagram} />);
    const figure = screen.getByRole("figure", { name: "Signal to SDK" });
    expect(figure.textContent).toContain("Flow");
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "1Reporting posts /signal",
      "2Workflow opens a Todo",
      "3Human moves to In Progress",
    ]);
  });
});
