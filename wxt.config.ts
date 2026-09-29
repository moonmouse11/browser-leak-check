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
    // storage.local keeps the user's source selection, storage.session the
    // last check so the report doesn't re-contact every service. Shows no
    // install warning. Still no host_permissions: every source sends CORS.
    permissions: ['storage'],
    browser_specific_settings: {
      gecko: { id: 'leak-check@localhost' },
    },
  },
});
