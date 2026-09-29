import type { HttpSource } from './config';

// Sources appended to the registry. Always empty in release builds and in
// Node; e2e builds (WXT_E2E_ECHO_URL set) swap this module for
// extra-sources.e2e.ts via a Vite alias in wxt.config.ts.
export const EXTRA_HTTP_SOURCES: HttpSource[] = [];
