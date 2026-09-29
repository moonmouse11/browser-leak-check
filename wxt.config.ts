import { fileURLToPath } from 'node:url';
import { defineConfig } from 'wxt';

// Set only for e2e builds: the URL of the test-only echo server whose
// source entry the registry then gains (see lib/extra-sources.e2e.ts).
const e2eEchoUrl = process.env.WXT_E2E_ECHO_URL;

// See https://wxt.dev/api/config.html
export default defineConfig({
  // PLAN.md commits to Manifest V3 on both browsers (Firefox 109+ supports
  // it) - without this, WXT's Firefox target defaults to MV2.
  manifestVersion: 3,
  // E2E builds never land where release builds do, so one can't be
  // mistaken for the other (npm run check:release guards .output/).
  outDir: e2eEchoUrl ? '.output-e2e' : '.output',
  manifest: {
    name: 'Leak Check',
    description:
      'Check your public IPv4/IPv6, WebRTC and DNS leaks, and browser fingerprint surface.',
    // storage.local keeps the user's source selection, storage.session the
    // last check so the report doesn't re-contact every service. Shows no
    // install warning. Still no host_permissions: every source sends CORS.
    permissions: ['storage'],
    // Placeholder domain - Firefox requires an id for MV3 (see the build
    // warning without it). Revisit before any AMO submission.
    browser_specific_settings: {
      gecko: { id: 'leak-check@localhost' },
    },
  },
  // Swapping the module, rather than branching on the flag inside
  // lib/config.ts, keeps the echo entry out of release bundles entirely:
  // WXT doesn't minify, so a dead branch would still ship its strings.
  vite: () =>
    e2eEchoUrl
      ? {
          resolve: {
            alias: [
              {
                find: /^\.\/extra-sources$/,
                replacement: fileURLToPath(new URL('./lib/extra-sources.e2e.ts', import.meta.url)),
              },
            ],
          },
        }
      : {},
});
