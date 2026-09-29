import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  // PLAN.md commits to Manifest V3 on both browsers (Firefox 109+ supports
  // it) - without this, WXT's Firefox target defaults to MV2.
  manifestVersion: 3,
  manifest: {
    name: 'Leak Check',
    description:
      'Check your public IPv4/IPv6, WebRTC and DNS leaks, and browser fingerprint surface.',
    // Placeholder domain - Firefox requires an id for MV3 (see the build
    // warning without it). Revisit before any AMO submission.
    browser_specific_settings: {
      gecko: { id: 'leak-check@localhost' },
    },
  },
});
