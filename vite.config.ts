/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const API_PORT = process.env.INSIGHTS_API_PORT ?? "4200";
const API_TARGET = `http://127.0.0.1:${API_PORT}`;

export default defineConfig(({ mode }) => {
  // Loaded into the Vite *server* process only (no VITE_ prefix → never in the bundle).
  const env = loadEnv(mode, process.cwd(), "");
  const bffToken = env.LIQUID_BFF_DEMO_TOKEN || process.env.LIQUID_BFF_DEMO_TOKEN;
  const apiProxy = {
    "/api": {
      target: API_TARGET,
      changeOrigin: false,
      headers: bffToken ? { Authorization: `Bearer ${bffToken}` } : {},
    },
  };

  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy: apiProxy },
    preview: { port: 4173, strictPort: true, proxy: apiProxy },
    test: {
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
        exclude: ["src/main.tsx", "server/index.ts", "**/*.test.*", "src/test/**"],
        thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
      },
      projects: [
        {
          extends: true,
          test: {
            name: "client",
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            include: ["src/**/*.test.{ts,tsx}"],
            css: false,
          },
        },
        {
          extends: true,
          test: {
            name: "server",
            environment: "node",
            include: ["tests/**/*.test.ts"],
          },
        },
      ],
    },
  };
});
