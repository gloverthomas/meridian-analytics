import { expect, test } from "@playwright/test";

test("hero loads with suggested prompts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What do you want");
  await expect(page.getByRole("button", { name: /Open KAN-5 status/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Switch organisation/ })).toHaveCount(0);
});

test("KAN-5 pill → cited answer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Open KAN-5 status/ }).click();

  const answer = page.getByRole("article", { name: "Meridian Insights answer" });
  await expect(answer).toBeVisible();
  await expect(answer.getByText("Sample data", { exact: true })).toBeVisible();
  const sources = answer.getByRole("region", { name: "Sources" });
  await expect(sources.getByRole("link").filter({ hasText: "KAN-5" }).first()).toHaveAttribute("href", /KAN-5$/);
  // Footnote links jump to their source.
  await expect(answer.getByRole("link", { name: "Source 1" })).toBeVisible();
});

test("typed follow-up keeps the thread and has no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox").fill("Is assistant-unit passing on Core and Reporting main?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Meridian Insights answer" })).toContainText("green");

  await page.getByPlaceholder("Ask a follow-up…").fill("What merged recently?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("article", { name: "Meridian Insights answer" })).toHaveCount(2);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("API refuses requests without the proxy-injected token", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:4210/api/v1/organisation");
  expect(res.status()).toBe(401);
});
