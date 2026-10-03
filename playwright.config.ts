import { defineConfig, devices } from "@playwright/test";

const UI_PORT = 5183;
const API_PORT = "4210";

// Sample-data mode only: keys are forced empty so E2E can never call xAI, Linear or GitHub,
// even if a developer's .env.local has them (existing env vars win over .env files).
const E2E_ENV = {
  INSIGHTS_API_PORT: API_PORT,
  LIQUID_BFF_DEMO_TOKEN: "e2e-demo-token-0123456789abcdef",
  XAI_API_KEY: "",
  LINEAR_API_KEY: "",
  GITHUB_TOKEN: "",
  // Never write test questions into the real question log.
  POSTHOG_PROJECT_TOKEN: "",
  POSTHOG_PERSONAL_API_KEY: "",
  LINEAR_ACTIONS_API_KEY: "",
  SENTRY_AUTH_TOKEN: "",
  WORKFLOW_API_TOKEN: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${UI_PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx concurrently -k -n api,ui "NODE_ENV=test tsx server/index.ts" "vite --port ${UI_PORT} --strictPort"`,
    url: `http://localhost:${UI_PORT}`,
    env: E2E_ENV,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
