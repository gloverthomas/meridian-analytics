import { expect, test } from "@playwright/test";

const diagram = {
  title: "Signal to SDK",
  nodes: [
    { id: "n1", label: "Reporting posts the signal" },
    { id: "n2", label: "Workflow opens a Todo" },
    { id: "n3", label: "A human moves it to In Progress" },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
  ],
};

test("a diagram request draws a numbered flow", async ({ page }) => {
  await page.route("**/api/v1/insights/chat/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        requestId: "req-flow",
        reply: "**The signal opens a ticket. A human starts the plan.**",
        citations: [
          {
            id: "doc:walk",
            kind: "doc",
            title: "Walk the signal to SDK path in full",
            url: "https://github.com/gloverthomas/meridian-analytics/blob/main/docs/handbook/28-codebase-file-walk.md",
          },
        ],
        relatedQuestions: ["How does the Cursor SDK facilitate the workflow?"],
        provider: "grok:test",
        retrievalMeta: { connectors: ["docs"], connectorModes: { docs: "live" }, window: "current docs on main", truncated: false, itemCount: 1 },
        latencyMs: 40,
        diagram,
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("textbox").fill("Can you visualise this with a diagram?");
  await page.keyboard.press("Enter");

  const figure = page.getByRole("figure", { name: "Signal to SDK" });
  await expect(figure).toBeVisible();
  await expect(figure.getByText("Reporting posts the signal")).toBeVisible();
  await expect(figure.getByText("Workflow opens a Todo")).toBeVisible();
  await expect(figure.getByText("A human moves it to In Progress")).toBeVisible();
  await expect(page.getByRole("article", { name: "Meridian Insights answer" })).toContainText("The signal opens a ticket");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
