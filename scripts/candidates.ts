import type { HttpSource } from '../lib/config';

// IPv6-only IP-echo endpoints that are not in the registry yet, because
// their CORS support couldn't be verified from a machine without an IPv6
// route (multi-source-ip task 1.2). Same shape as registry entries: once
// `npm run check:sources -- --candidates` reports one ok from a dual-stack
// machine, it can be moved into HTTP_SOURCES in lib/config.ts as-is.
// Never bundled into the extension.
export const CANDIDATE_SOURCES: HttpSource[] = [
  {
    kind: 'http',
    id: 'ipify-v6',
    name: 'ipify (IPv6)',
    operator: 'ipify',
    url: 'https://api6.ipify.org?format=json',
    family: 'v6',
    format: { type: 'json', ip: 'ip' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'icanhazip-v6',
    name: 'icanhazip (IPv6)',
    operator: 'Cloudflare',
    url: 'https://ipv6.icanhazip.com',
    family: 'v6',
    format: { type: 'text' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ident-me-v6',
    name: 'ident.me (IPv6)',
    operator: 'ident.me',
    url: 'https://v6.ident.me/json',
    family: 'v6',
    format: { type: 'json', ip: 'ip', asn: 'asn', org: 'aso' },
    providesAsn: true,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'wtfismyip-v6',
    name: 'wtfismyip (IPv6)',
    operator: 'wtfismyip.com',
    url: 'https://ipv6.wtfismyip.com/json',
    family: 'v6',
    format: { type: 'json', ip: 'YourFuckingIPAddress', org: 'YourFuckingISP' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ipinfo-v6',
    name: 'ipinfo.io (IPv6)',
    operator: 'IPinfo',
    url: 'https://v6.ipinfo.io/json',
    family: 'v6',
    format: { type: 'json', ip: 'ip', asn: 'org', org: 'org' },
    providesAsn: true,
    ipDataVendor: true,
    recommended: false,
  },
];
