import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskCatalog } from "./AskCatalog";

afterEach(cleanup);

describe("AskCatalog", () => {
  it("is collapsed by default, expands, and asks a question on click", async () => {
    const onAsk = vi.fn();
    render(<AskCatalog onAsk={onAsk} />);
    const toggle = screen.getByRole("button", { name: "What can I ask?" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "Cursor workflow" })).toBeNull();

    await userEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "Cursor workflow" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "How are our evals tracking?" }));
    expect(onAsk).toHaveBeenCalledWith("How are our evals tracking?");
  });
});
