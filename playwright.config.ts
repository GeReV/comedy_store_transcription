// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    use: {
        baseURL: "http://localhost:3000",
    },
    webServer: {
        command: "npx serve static -p 3000",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env["CI"],
    },
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ],
});
