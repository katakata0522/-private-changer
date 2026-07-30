const path = require("node:path");
const { defineConfig } = require("@playwright/test");

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.cjs",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    headless: true,
    launchOptions: executablePath
      ? {
          executablePath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--no-zygote",
            "--single-process",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--use-gl=disabled"
          ]
        }
      : {}
  },
  webServer: {
    command: "node tests/server.cjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 10_000
  },
  reporter: [["list"]]
});
