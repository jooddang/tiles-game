import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "replay-contract.spec.ts",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
  },
  webServer: {
    command: "vite --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174/games/tiles-game/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
