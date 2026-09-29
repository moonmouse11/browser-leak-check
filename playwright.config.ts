import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  // Every test hits the same free third-party services (ipify, bash.ws);
  // one worker keeps them from running concurrently against each other.
  // The Firefox suite also needs it: its echo server has a fixed port.
  workers: 1,
  reporter: 'list',
  timeout: 30_000,
  projects: [
    {
      // Chrome's new headless mode (see e2e/fixtures.ts), so no display is
      // needed. Set PWHEADED=1 to watch it. npm run test:e2e
      name: 'chromium',
      testDir: './e2e',
    },
    {
      // Firefox ESR through Selenium + geckodriver - Playwright can't load
      // extensions into Firefox. Needs Dockerfile.test's browsers:
      // npm run test:docker (or npm run test:e2e:firefox inside it).
      name: 'firefox',
      testDir: './e2e-firefox',
      testMatch: /.*\.spec\.ts/,
      timeout: 60_000,
    },
  ],
});
