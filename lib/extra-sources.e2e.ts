import type { HttpSource } from './config';

// Only ever bundled into e2e builds (see wxt.config.ts): a local server the
// Firefox e2e suite runs, which records the headers the browser sends -
// the Origin in particular - so they can be asserted on.
export const EXTRA_HTTP_SOURCES: HttpSource[] = [
  {
    kind: 'http',
    id: 'e2e-echo',
    name: 'e2e echo server',
    operator: 'this test run',
    url: import.meta.env.WXT_E2E_ECHO_URL,
    family: 'dual',
    format: { type: 'text' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
];
