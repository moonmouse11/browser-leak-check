import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    // One jsdom per worker instead of per file: environment startup was
    // ~90% of the suite's wall time (audit finding).
    pool: 'vmThreads',
    isolate: false,
    // e2e/ and e2e-firefox/*.spec.ts use @playwright/test's own runner
    // (`npm run test:e2e`), not vitest - excluded here since both use a
    // *.spec.ts naming convention. e2e-firefox/*.test.ts stay in vitest.
    exclude: ['**/node_modules/**', 'e2e/**', 'e2e-firefox/**/*.spec.ts'],
  },
});
