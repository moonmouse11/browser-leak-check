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
    // e2e/ uses @playwright/test's own runner (`npm run test:e2e`), not
    // vitest - excluded here since both use a *.spec.ts naming convention.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
});
