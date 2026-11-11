import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: process.env.TEST_BASE_URL ?? 'http://127.0.0.1:4173', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
  },
});
