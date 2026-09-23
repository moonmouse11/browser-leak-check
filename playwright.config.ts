import { defineConfig } from '@playwright/test';

// Extension E2E tests need a real Chrome window (--load-extension is not
// reliable headless), so these run under a display (e.g. `xvfb-run` in CI).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  timeout: 30_000,
});
