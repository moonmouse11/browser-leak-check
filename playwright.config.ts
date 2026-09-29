import { defineConfig } from '@playwright/test';

// Extension E2E tests run in Chrome's new headless mode (see
// e2e/fixtures.ts), so they need no display. Set PWHEADED=1 to watch them.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Every test hits the same free third-party services (ipify, bash.ws);
  // one worker keeps them from running concurrently against each other.
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
});
