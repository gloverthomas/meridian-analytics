import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { chatResponse, jsonRes } from "./test/fixtures";

const ORGS = { requestId: "r", orgs: [{ id: "org_liquid_coffee", name: "Liquid Coffee Co.", role: "Viewer" }] };
const PROMPTS = { requestId: "r", prompts: [{ id: "liq-24", label: "Open KAN-5 status", query: "What's the status of KAN-5?" }] };

const fetchMock = vi.fn<typeof fetch>();

function route(handlers: Record<string, () => Response>) {
  fetchMock.mockImplementation(async (input) => {
    const path = String(input);
    const handler = handlers[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler();
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("shows the hero, sends a pill, and renders the cited answer", async () => {
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/chat/stream": () => jsonRes(chatResponse()),
    });
    render(<App />);

    expect(await screen.findByRole("heading", { name: /What do you want to know/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Switch organisation/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Open KAN-5 status/ }));

    expect(await screen.findByRole("article", { name: "Meridian Insights answer" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Conversation" })).getByText("What's the status of KAN-5?")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Chat history" })).getByText("What's the status of KAN-5?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /KAN-5 AI Assistant parity/ })).toHaveAttribute("href", "https://linear.app/x/KAN-5");
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a follow-up…")).toBeInTheDocument();
  });

  it("streams the answer as it's written, then swaps in the cited answer", async () => {
    let push!: (line: object) => void;
    let close!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        push = (line) => controller.enqueue(enc.encode(`${JSON.stringify(line)}\n`));
        close = () => controller.close();
      },
    });
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/progress": () => jsonRes({ requestId: "r", steps: ["Reading KAN-5 in Linear…"] }),
      "/api/v1/insights/chat/stream": () => new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Open KAN-5 status/ }));

    push({ type: "delta", text: "**KAN-5 is " });
    push({ type: "delta", text: "In Progress.** [linear:LI" });
    const live = await screen.findByRole("article", { name: "Meridian Insights answer, being written" });
    await waitFor(() => expect(live).toHaveTextContent("KAN-5 is In Progress."));
    expect(live).not.toHaveTextContent("[linear:");
    expect(within(live).getByText("Writing…")).toBeInTheDocument();

    push({ type: "done", response: chatResponse() });
    close();
    expect(await screen.findByRole("article", { name: "Meridian Insights answer" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Meridian Insights answer, being written" })).toBeNull();
  });

  it("shows an error card when the stream reports a failure", async () => {
    const lines = `${JSON.stringify({ type: "delta", text: "Partial" })}\n${JSON.stringify({ type: "error", error: "internal_error", requestId: "r" })}\n`;
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/progress": () => jsonRes({ requestId: "r", steps: [] }),
      "/api/v1/insights/chat/stream": () => new Response(lines, { headers: { "Content-Type": "application/x-ndjson" } }),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Open KAN-5 status/ }));
    expect(await screen.findByText(/couldn't answer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("Partial")).toBeNull();
  });

  it("sends typed questions with Enter, supports Shift+Enter, and can start over", async () => {
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/chat/stream": () => jsonRes(chatResponse({ provider: "fixture", retrievalMeta: { ...chatResponse().retrievalMeta, connectorModes: { linear: "sample" } } })),
    });
    render(<App />);
    const box = await screen.findByRole("textbox");
    expect(screen.getByRole("button", { name: /Send question/ })).toBeDisabled();

    await userEvent.type(box, "Line one{Shift>}{Enter}{/Shift}line two{Enter}");
    expect(await screen.findByText("Sample data")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls.find(([p]) => p === "/api/v1/insights/chat/stream")!;
    expect(JSON.parse(String(init!.body)).message).toBe("Line one\nline two");

    // Top-right "New conversation" returns to the hero; the chat stays in the sidebar history.
    await userEvent.click(screen.getByRole("button", { name: /New conversation/ }));
    expect(await screen.findByRole("heading", { name: /What do you want to know/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New conversation/ })).toBeDisabled();
    const history = screen.getByRole("complementary", { name: "Chat history" });
    await userEvent.click(within(history).getByRole("button", { name: /^Line one line two/ }));
    expect(await screen.findByText("Sample data")).toBeInTheDocument();

    await userEvent.click(within(history).getByRole("button", { name: /Delete/ }));
    expect(await screen.findByRole("heading", { name: /What do you want to know/ })).toBeInTheDocument();
    expect(within(history).getByText(/saved in this browser only/)).toBeInTheDocument();
  });

  it("collapses and reopens the history sidebar, remembering the choice", async () => {
    route({ "/api/v1/orgs": () => jsonRes(ORGS), "/api/v1/suggested-prompts": () => jsonRes(PROMPTS) });
    const { container, unmount } = render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Hide chat history" }));
    expect(container.querySelector(".shell")).toHaveAttribute("data-sidebar", "collapsed");
    expect(localStorage.getItem("liquid-insights:sidebar-collapsed")).toBe("1");
    unmount();

    const again = render(<App />);
    await screen.findByRole("heading", { name: /What do you want to know/ });
    expect(again.container.querySelector(".shell")).toHaveAttribute("data-sidebar", "collapsed");
    await userEvent.click(screen.getByRole("button", { name: "Show chat history" }));
    expect(again.container.querySelector(".shell")).toHaveAttribute("data-sidebar", "expanded");
  });

  it("shows the server's real progress steps while waiting, then the answer", async () => {
    let release!: () => void;
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/progress": () => jsonRes({ requestId: "r", steps: ["Pulling product analytics from PostHog…", "Asking Grok to write it up…"] }),
    });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      String(input) === "/api/v1/insights/chat/stream" ? new Promise<Response>((r) => (release = () => r(jsonRes(chatResponse())))) : base(input, init),
    );
    render(<App />);
    await userEvent.type(await screen.findByRole("textbox"), "Is AI Assistant usage going up?{Enter}");
    expect(await screen.findByText("Pulling product analytics from PostHog…")).toBeInTheDocument();
    release();
    expect(await screen.findByRole("article", { name: "Meridian Insights answer" })).toBeInTheDocument();
    expect(screen.queryByText("Pulling product analytics from PostHog…")).toBeNull();
  });

  it("offers to re-ask a question that was saved without an answer", async () => {
    localStorage.setItem(
      "liquid-insights:conversations:v1",
      JSON.stringify([{ id: "c1", title: "Unanswered", createdAt: 1, updatedAt: 2, entries: [{ id: "u", role: "user", content: "Unanswered" }] }]),
    );
    route({
      "/api/v1/orgs": () => jsonRes(ORGS),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
      "/api/v1/insights/chat/stream": () => jsonRes(chatResponse()),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /^Unanswered/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Ask again" }));
    expect(await screen.findByRole("article", { name: "Meridian Insights answer" })).toBeInTheDocument();
    localStorage.clear();
  });


  it("shows the access gate on 401 and unlocks with the right code", async () => {
    let unlocked = false;
    route({
      "/api/v1/orgs": () => (unlocked ? jsonRes(ORGS) : jsonRes({ requestId: "r", error: "unauthorized" }, 401)),
      "/api/v1/suggested-prompts": () => (unlocked ? jsonRes(PROMPTS) : jsonRes({ requestId: "r", error: "unauthorized" }, 401)),
      "/api/v1/session": () => {
        unlocked = true;
        return new Response(null, { status: 204 });
      },
    });
    render(<App />);
    const input = await screen.findByLabelText("Access code");
    await userEvent.type(input, "coffee-demo{Enter}");
    expect(await screen.findByRole("heading", { name: /What do you want to know/ })).toBeInTheDocument();
  });

  it("shows a wrong-code message", async () => {
    route({
      "/api/v1/orgs": () => jsonRes({ requestId: "r", error: "unauthorized" }, 401),
      "/api/v1/suggested-prompts": () => jsonRes({ requestId: "r", error: "unauthorized" }, 401),
      "/api/v1/session": () => jsonRes({ requestId: "r", error: "invalid_access_code" }, 401),
    });
    render(<App />);
    await userEvent.type(await screen.findByLabelText("Access code"), "nope{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't right");
  });

  it("fails closed with a clear message when auth is not configured, and retries on error", async () => {
    route({ "/api/v1/orgs": () => jsonRes({ requestId: "r", error: "auth_not_configured" }, 503), "/api/v1/suggested-prompts": () => jsonRes(PROMPTS) });
    const { unmount } = render(<App />);
    expect(await screen.findByRole("heading", { name: "Not set up yet" })).toBeInTheDocument();
    unmount();

    let calls = 0;
    route({
      "/api/v1/orgs": () => (++calls === 1 ? jsonRes({ requestId: "r", error: "internal_error" }, 500) : jsonRes(ORGS)),
      "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /What do you want to know/ })).toBeInTheDocument());
  });

  describe("ticket moves", () => {
    const proposal = {
      kind: "linear_transition" as const,
      issueId: "KAN-18",
      issueTitle: "Notifications dead in Reporting",
      url: "https://linear.app/x/KAN-18",
      fromState: "Todo",
      toState: "In Progress",
      token: "signed-token",
      expiresAt: Date.now() + 300_000,
    };
    const proposed = chatResponse({ provider: "action", reply: "**Ready to move KAN-18 from Todo to In Progress.** [linear:KAN-5]", relatedQuestions: [], proposedAction: proposal });
    const moved = chatResponse({ provider: "action", reply: "**Moved KAN-18 to In Progress.**", relatedQuestions: [] });

    it("shows a confirm card, and only moves the ticket after Confirm", async () => {
      let transitions = 0;
      route({
        "/api/v1/orgs": () => jsonRes(ORGS),
        "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
        "/api/v1/insights/chat/stream": () => jsonRes(proposed),
        "/api/v1/actions/linear-transition": () => {
          transitions++;
          return jsonRes(moved);
        },
      });
      render(<App />);
      await userEvent.type(await screen.findByRole("textbox"), "Move KAN-18 to In Progress{Enter}");
      const card = await screen.findByRole("region", { name: "Confirm moving KAN-18" });
      expect(within(card).getByText("Todo")).toBeInTheDocument();
      expect(transitions).toBe(0);

      await userEvent.click(within(card).getByRole("button", { name: "Move to In Progress" }));
      expect(await screen.findByText("Moved KAN-18 to In Progress.")).toBeInTheDocument();
      expect(transitions).toBe(1);
      const call = fetchMock.mock.calls.find(([p]) => p === "/api/v1/actions/linear-transition")!;
      expect(JSON.parse(String(call[1]!.body))).toEqual({ token: "signed-token" });
      // The card is retired so it can't be clicked twice.
      expect(screen.queryByRole("region", { name: "Confirm moving KAN-18" })).toBeNull();
    });

    it("Cancel retires the card without calling Linear", async () => {
      route({ "/api/v1/orgs": () => jsonRes(ORGS), "/api/v1/suggested-prompts": () => jsonRes(PROMPTS), "/api/v1/insights/chat/stream": () => jsonRes(proposed) });
      render(<App />);
      await userEvent.type(await screen.findByRole("textbox"), "Move KAN-18 to In Progress{Enter}");
      const card = await screen.findByRole("region", { name: "Confirm moving KAN-18" });
      await userEvent.click(within(card).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("region", { name: "Confirm moving KAN-18" })).toBeNull();
      expect(fetchMock.mock.calls.some(([p]) => p === "/api/v1/actions/linear-transition")).toBe(false);
    });

    it("an expired confirmation becomes a Try again card; a server error stays inline", async () => {
      let status = 503;
      route({
        "/api/v1/orgs": () => jsonRes(ORGS),
        "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
        "/api/v1/insights/chat/stream": () => jsonRes(proposed),
        "/api/v1/actions/linear-transition": () => jsonRes({ requestId: "r", error: status === 410 ? "confirmation_expired" : "internal_error" }, status),
      });
      render(<App />);
      await userEvent.type(await screen.findByRole("textbox"), "Move KAN-18 to In Progress{Enter}");
      const card = await screen.findByRole("region", { name: "Confirm moving KAN-18" });
      await userEvent.click(within(card).getByRole("button", { name: "Move to In Progress" }));
      expect(await within(card).findByRole("alert")).toHaveTextContent(/couldn't answer/);

      status = 410;
      await userEvent.click(within(card).getByRole("button", { name: "Move to In Progress" }));
      expect(await screen.findByText(/confirmation expired/)).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Confirm moving KAN-18" })).toBeNull();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("Approve & implement goes to the workflow endpoint, never the plain move", async () => {
      const implement = { ...proposal, kind: "workflow_implement" as const, issueId: "KAN-5", toState: "In Review", token: "impl-token" };
      route({
        "/api/v1/orgs": () => jsonRes(ORGS),
        "/api/v1/suggested-prompts": () => jsonRes(PROMPTS),
        "/api/v1/insights/chat/stream": () => jsonRes(chatResponse({ reply: "**Plan for KAN-5.**", relatedQuestions: [], proposedAction: implement })),
        "/api/v1/actions/workflow-implement": () => jsonRes(chatResponse({ provider: "action", reply: "**Approved the Cursor plan for KAN-5.**", relatedQuestions: [] })),
      });
      render(<App />);
      await userEvent.type(await screen.findByRole("textbox"), "What's the Cursor plan for KAN-5?{Enter}");
      const card = await screen.findByRole("region", { name: "Confirm approving KAN-5" });
      await userEvent.click(within(card).getByRole("button", { name: "Approve & implement" }));
      expect(await screen.findByText("Approved the Cursor plan for KAN-5.")).toBeInTheDocument();
      const call = fetchMock.mock.calls.find(([p]) => p === "/api/v1/actions/workflow-implement")!;
      expect(JSON.parse(String(call[1]!.body))).toEqual({ token: "impl-token" });
      expect(fetchMock.mock.calls.some(([p]) => p === "/api/v1/actions/linear-transition")).toBe(false);
    });
  });
});
