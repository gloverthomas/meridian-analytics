import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chatResponse } from "../test/fixtures";
import { parseBlocks } from "../lib/markdown";
import { statusTone } from "../lib/status";
import { AnswerMarkdown } from "./AnswerMarkdown";
import { CitationList } from "./CitationList";
import { PromptPills } from "./PromptPills";
import { SourcesAccordion } from "./SourcesAccordion";

describe("AnswerMarkdown", () => {
  const index = new Map([["linear:KAN-5", 1]]);

  it("renders paragraphs, lists, bold, code and italic without raw HTML", () => {
    const { container } = render(
      <AnswerMarkdown
        text={"**Lead** sentence\n- one `code`\n- two\n1. first\n## Heading\n_note_ <img src=x onerror=alert(1)>"}
        citationIndex={index}
        anchorPrefix="a"
      />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("Lead");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(1);
    expect(container.querySelector("code")?.textContent).toBe("code");
    expect(screen.getByText("Heading").tagName).toBe("STRONG");
    expect(container.querySelector("em")?.textContent).toBe("note");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("turns known citation tokens into footnote links and drops unknown ones", () => {
    render(<AnswerMarkdown text="See [linear:KAN-5] and [github:PR:o/x#9]." citationIndex={index} anchorPrefix="src-a1" />);
    const link = screen.getByRole("link", { name: "Source 1" });
    expect(link).toHaveAttribute("href", "#src-a1-1");
    expect(screen.queryByText(/github:PR/)).toBeNull();
  });

  it("groups consecutive list items", () => {
    expect(parseBlocks("- a\n- b\ntext\n1) c")).toEqual([
      { kind: "ul", items: ["a", "b"] },
      { kind: "p", text: "text" },
      { kind: "ol", items: ["c"] },
    ]);
  });
});

describe("CitationList", () => {
  it("renders numbered, linked sources with status", () => {
    render(<CitationList citations={chatResponse().citations} anchorPrefix="p" />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://linear.app/x/KAN-5");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[0]).toHaveAttribute("id", "p-1");
    expect(within(links[1]).getByText("merged")).toHaveAttribute("data-tone", "good");
  });

  it("does not link non-http urls", () => {
    render(<CitationList citations={[{ id: "x:1", kind: "linear_issue", title: "Bad", url: "javascript:alert(1)" }]} anchorPrefix="p" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Bad")).toBeInTheDocument();
  });

  it("renders nothing without citations", () => {
    const { container } = render(<CitationList citations={[]} anchorPrefix="p" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("maps statuses to tones", () => {
    expect(statusTone("success")).toBe("good");
    expect(statusTone("failure")).toBe("bad");
    expect(statusTone("In Review")).toBe("wait");
    expect(statusTone(undefined)).toBe("neutral");
  });
});

describe("PromptPills", () => {
  it("calls onPick with the full query", async () => {
    const onPick = vi.fn();
    render(<PromptPills items={[{ id: "a", label: "Open KAN-5 status", query: "What's up with KAN-5?" }]} onPick={onPick} label="Try asking" />);
    await userEvent.click(screen.getByRole("button", { name: /Open KAN-5 status/ }));
    expect(onPick).toHaveBeenCalledWith("What's up with KAN-5?");
  });

  it("disables pills and renders nothing when empty", () => {
    const { rerender, container } = render(<PromptPills items={[{ id: "a", label: "A", query: "q" }]} onPick={vi.fn()} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
    rerender(<PromptPills items={[]} onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SourcesAccordion", () => {
  it("summarises retrieval without raw JSON", async () => {
    render(<SourcesAccordion response={chatResponse({ retrievalMeta: { ...chatResponse().retrievalMeta, truncated: true } })} />);
    await userEvent.click(screen.getByText("How this was built"));
    expect(screen.getByText("Grok · grok-4-fast-non-reasoning")).toBeVisible();
    expect(screen.getByText("Linear (live), GitHub (live)")).toBeVisible();
    expect(screen.getByText(/trimmed to fit/)).toBeVisible();
    expect(screen.getByText("2.3s")).toBeVisible();
  });

  it("labels sample and digest providers", () => {
    const { rerender } = render(<SourcesAccordion response={chatResponse({ provider: "fixture" })} />);
    expect(screen.getByText("Sample answer (Grok not used)")).toBeInTheDocument();
    rerender(<SourcesAccordion response={chatResponse({ provider: "digest" })} />);
    expect(screen.getByText("Source list (Grok not used)")).toBeInTheDocument();
  });
});
