import { EXTRA_HTTP_SOURCES } from './extra-sources';

// The source registry: the only place any third-party service this
// extension may contact is listed. The selection UI, the checks, the
// disclosure copy and the e2e network allowlist all derive from it - see
// openspec/changes/multi-source-ip/design.md. Adding or removing a service
// is a one-entry change; a service added by an update starts deselected.

// Fields every selectable source shares, whatever kind of check it serves.
interface SourceBase {
  id: string;
  name: string;
  operator: string;
  // The operator's business is selling IP geolocation / intelligence data,
  // so queries may well be retained - shown as a label in the selection UI.
  ipDataVendor: boolean;
  // Preselected on the first-run screen and by "reset to recommended".
  recommended: boolean;
}

// How to pull the address (and, where the service reports them, the ASN
// and network owner) out of a response body. JSON paths are dot-separated.
export type ResponseFormat =
  | { type: 'json'; ip: string; asn?: string; org?: string }
  | { type: 'text' }
  | { type: 'cf-trace' };

export interface HttpSource extends SourceBase {
  kind: 'http';
  url: string;
  // What the endpoint is meant to answer over; the family actually shown
  // is derived from the returned address, since a 'dual' endpoint answers
  // over whichever family the browser picks.
  family: 'v4' | 'v6' | 'dual';
  format: ResponseFormat;
  // Kept in sync with `format` by a unit test, so the "ASN" label in the
  // selection UI can't drift from what the parser actually reads.
  providesAsn: boolean;
}

export interface StunSource extends SourceBase {
  kind: 'stun';
  url: string;
}

export interface DnsSource extends SourceBase {
  kind: 'dns';
  url: string;
}

// A service's own Cloudflare trace endpoint: answers "what egress IP does
// THIS service see" plus edge node, WARP and protocol versions. Selectable
// like IP-echo sources, because querying it discloses the user's IP to
// that service's operator (see check-catalog design.md decision 3).
export interface TraceSource extends SourceBase {
  kind: 'trace';
  url: string;
}

// The endpoints below are registry-listed and labeled but NOT individually
// selectable: the user consents by running the check card, and they see no
// more than a normal site visit would disclose.

// An official statuspage v2 status endpoint (`/api/v2/status.json`).
export interface StatusSource extends SourceBase {
  kind: 'status';
  url: string;
}

// An RDAP bootstrap service; redirects to the authoritative RIR server.
export interface RdapSource extends SourceBase {
  kind: 'rdap';
  url: string;
}

// A connectivity probe target (favicon or a known lightweight endpoint).
// Queried with no-cors, so reachability is all it answers.
export interface ProbeSource extends SourceBase {
  kind: 'probe';
  url: string;
  // The statuspage source covering this service, when one exists - lets
  // the connectivity check attribute an unreachable site to an incident.
  statusOf?: string;
}

// The bandwidth measurement endpoint (speed.cloudflare.com __down/__up).
export interface BandwidthSource extends SourceBase {
  kind: 'bandwidth';
  url: string;
}

export type Source = HttpSource | StunSource | DnsSource | TraceSource;

// Everything the extension may contact, selectable or not - the README
// disclosure test iterates this list.
export type ContactedSource = Source | StatusSource | RdapSource | ProbeSource | BandwidthSource;

// Every service here was verified on 2026-09-29 to answer a request from
// an extension Origin with Access-Control-Allow-Origin - the extension has
// no host_permissions, so a service without CORS can't be used at all.
// IPv6-only endpoints are not listed yet: they couldn't be verified from a
// network without an IPv6 route (multi-source-ip task 1.2).
export const HTTP_SOURCES: HttpSource[] = [
  {
    kind: 'http',
    id: 'ipify',
    name: 'ipify',
    operator: 'ipify',
    url: 'https://api.ipify.org?format=json',
    family: 'v4',
    format: { type: 'json', ip: 'ip' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'http',
    id: 'ipify-64',
    name: 'ipify (dual-stack)',
    operator: 'ipify',
    url: 'https://api64.ipify.org?format=json',
    family: 'dual',
    format: { type: 'json', ip: 'ip' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'icanhazip',
    name: 'icanhazip',
    operator: 'Cloudflare',
    url: 'https://ipv4.icanhazip.com',
    family: 'v4',
    format: { type: 'text' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'http',
    id: 'cloudflare-trace',
    name: 'Cloudflare trace',
    operator: 'Cloudflare',
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    family: 'dual',
    format: { type: 'cf-trace' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'http',
    id: 'cloudflare-1111',
    name: 'Cloudflare trace (1.1.1.1)',
    operator: 'Cloudflare',
    url: 'https://1.1.1.1/cdn-cgi/trace',
    family: 'v4',
    format: { type: 'cf-trace' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ident-me',
    name: 'ident.me',
    operator: 'ident.me',
    url: 'https://v4.ident.me/json',
    family: 'v4',
    format: { type: 'json', ip: 'ip', asn: 'asn', org: 'aso' },
    providesAsn: true,
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'http',
    id: 'ipinfo',
    name: 'ipinfo.io',
    operator: 'IPinfo',
    url: 'https://ipinfo.io/json',
    family: 'dual',
    format: { type: 'json', ip: 'ip', asn: 'org', org: 'org' },
    providesAsn: true,
    ipDataVendor: true,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ifconfig-me',
    name: 'ifconfig.me',
    operator: 'ifconfig.me',
    url: 'https://ifconfig.me/all.json',
    family: 'dual',
    // Not `forwarded`: that holds ifconfig.me's own front-end proxy too.
    format: { type: 'json', ip: 'ip_addr' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'seeip',
    name: 'SeeIP',
    operator: 'SeeIP',
    url: 'https://api.seeip.org/jsonip',
    family: 'dual',
    format: { type: 'json', ip: 'ip' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ipwho-is',
    name: 'ipwho.is',
    operator: 'ipwhois.io',
    url: 'https://ipwho.is/',
    family: 'dual',
    format: { type: 'json', ip: 'ip', asn: 'connection.asn', org: 'connection.isp' },
    providesAsn: true,
    ipDataVendor: true,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'geojs',
    name: 'GeoJS',
    operator: 'GeoJS',
    url: 'https://get.geojs.io/v1/ip/geo.json',
    family: 'dual',
    format: { type: 'json', ip: 'ip', asn: 'asn', org: 'organization_name' },
    providesAsn: true,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'bigdatacloud',
    name: 'BigDataCloud',
    operator: 'BigDataCloud',
    url: 'https://api.bigdatacloud.net/data/client-ip',
    family: 'dual',
    format: { type: 'json', ip: 'ipString' },
    providesAsn: false,
    ipDataVendor: true,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'aws-checkip',
    name: 'AWS checkip',
    operator: 'Amazon',
    url: 'https://checkip.amazonaws.com',
    family: 'v4',
    format: { type: 'text' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'wtfismyip',
    name: 'wtfismyip',
    operator: 'wtfismyip.com',
    url: 'https://ipv4.wtfismyip.com/json',
    family: 'v4',
    format: { type: 'json', ip: 'YourFuckingIPAddress', org: 'YourFuckingISP' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ip-guide',
    name: 'ip.guide',
    operator: 'ip.guide',
    url: 'https://ip.guide',
    family: 'dual',
    format: {
      type: 'json',
      ip: 'ip',
      asn: 'network.autonomous_system.asn',
      org: 'network.autonomous_system.organization',
    },
    providesAsn: true,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'country-is',
    name: 'country.is',
    operator: 'country.is',
    url: 'https://api.country.is',
    family: 'dual',
    format: { type: 'json', ip: 'ip' },
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'http',
    id: 'ipapi-is',
    name: 'ipapi.is',
    operator: 'ipapi.is',
    url: 'https://api.ipapi.is',
    family: 'dual',
    format: { type: 'json', ip: 'ip', asn: 'asn', org: 'asn' },
    providesAsn: true,
    ipDataVendor: true,
    recommended: false,
  },
  ...EXTRA_HTTP_SOURCES,
];

// Independent operators (not just independent hostnames) on purpose: a
// single-operator STUN dependency is both a single point of failure and a
// single point of privacy concentration, and symmetric NAT can produce a
// different reflexive address per server - see design.md's WebRTC decision.
// Re-verify against a live list (e.g. github.com/pradt2/always-online-stun)
// before shipping, since public STUN availability changes over time.
export const STUN_SOURCES: StunSource[] = [
  {
    kind: 'stun',
    id: 'stun-google',
    name: 'Google STUN',
    operator: 'Google',
    url: 'stun:stun.l.google.com:19302',
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'stun',
    id: 'stun-cloudflare',
    name: 'Cloudflare STUN',
    operator: 'Cloudflare',
    url: 'stun:stun.cloudflare.com:3478',
    ipDataVendor: false,
    recommended: true,
  },
  {
    kind: 'stun',
    id: 'stun-nextcloud',
    name: 'Nextcloud STUN',
    operator: 'Nextcloud',
    // Replaced openrelay.metered.ca:80, which stopped answering STUN
    // Binding Requests (npm run check:sources, 2026-09-29).
    url: 'stun:stun.nextcloud.com:3478',
    ipDataVendor: false,
    recommended: true,
  },
];

// bash.ws's public DNS-leak-test service - see
// openspec/changes/archive/2026-09-27-dns-leak-bashws/design.md for why we reuse it instead
// of operating our own authoritative DNS server (Path A vs Path B).
export const DNS_SOURCE: DnsSource = {
  kind: 'dns',
  id: 'bash-ws',
  name: 'bash.ws DNS leak test',
  operator: 'bash.ws',
  url: 'https://bash.ws',
  ipDataVendor: false,
  recommended: true,
};

// Service-visibility trace endpoints (check-catalog). All start
// recommended: false - querying them tells that AI service your IP, so
// they are opt-in on the first-run screen too.
export const TRACE_SOURCES: TraceSource[] = [
  {
    kind: 'trace',
    id: 'trace-claude',
    name: 'Claude (claude.ai)',
    operator: 'Anthropic',
    url: 'https://claude.ai/cdn-cgi/trace',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'trace',
    id: 'trace-chatgpt',
    name: 'ChatGPT (chatgpt.com)',
    operator: 'OpenAI',
    url: 'https://chatgpt.com/cdn-cgi/trace',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'trace',
    id: 'trace-cloudflare',
    name: 'Cloudflare (1.1.1.1)',
    operator: 'Cloudflare',
    url: 'https://1.1.1.1/cdn-cgi/trace',
    ipDataVendor: false,
    recommended: false,
  },
];

// Official statuspage v2 endpoints (check-catalog service-status).
export const STATUS_SOURCES: StatusSource[] = [
  {
    kind: 'status',
    id: 'status-claude',
    name: 'Claude status',
    operator: 'Anthropic',
    url: 'https://status.claude.com/api/v2/status.json',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'status',
    id: 'status-openai',
    name: 'OpenAI status',
    operator: 'OpenAI',
    url: 'https://status.openai.com/api/v2/status.json',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'status',
    id: 'status-cloudflare',
    name: 'Cloudflare status',
    operator: 'Cloudflare',
    url: 'https://www.cloudflarestatus.com/api/v2/status.json',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'status',
    id: 'status-github',
    name: 'GitHub status',
    operator: 'GitHub',
    url: 'https://www.githubstatus.com/api/v2/status.json',
    ipDataVendor: false,
    recommended: false,
  },
  {
    kind: 'status',
    id: 'status-npm',
    name: 'npm status',
    operator: 'npm',
    url: 'https://status.npmjs.org/api/v2/status.json',
    ipDataVendor: false,
    recommended: false,
  },
];

// RDAP bootstrap: 302-redirects to the authoritative RIR server, so the
// network owner lookup needs no per-RIR endpoint list.
export const RDAP_SOURCE: RdapSource = {
  kind: 'rdap',
  id: 'rdap-org',
  name: 'rdap.org',
  operator: 'rdap.org (redirects to the responsible RIR)',
  url: 'https://rdap.org',
  ipDataVendor: false,
  recommended: false,
};

// Connectivity probe targets (check-catalog connectivity-check). Where a
// site has a known cheap endpoint it is used; a favicon works too - any
// HTTP response means reachable, since no-cors can't read the status.
export const PROBE_TARGETS: ProbeSource[] = [
  { kind: 'probe', id: 'probe-google', name: 'Google', operator: 'Google', url: 'https://www.google.com/generate_204', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-youtube', name: 'YouTube', operator: 'Google', url: 'https://www.youtube.com/generate_204', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-cloudflare', name: 'Cloudflare', operator: 'Cloudflare', url: 'https://www.cloudflare.com/favicon.ico', statusOf: 'status-cloudflare', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-github', name: 'GitHub', operator: 'GitHub', url: 'https://github.com/favicon.ico', statusOf: 'status-github', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-wikipedia', name: 'Wikipedia', operator: 'Wikimedia', url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-reddit', name: 'Reddit', operator: 'Reddit', url: 'https://www.reddit.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-microsoft', name: 'Microsoft', operator: 'Microsoft', url: 'https://www.microsoft.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-apple', name: 'Apple', operator: 'Apple', url: 'https://www.apple.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-amazon', name: 'Amazon', operator: 'Amazon', url: 'https://www.amazon.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-netflix', name: 'Netflix', operator: 'Netflix', url: 'https://www.netflix.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-facebook', name: 'Facebook', operator: 'Meta', url: 'https://www.facebook.com/favicon.ico', ipDataVendor: false, recommended: false },
  { kind: 'probe', id: 'probe-x', name: 'X (Twitter)', operator: 'X Corp', url: 'https://x.com/favicon.ico', ipDataVendor: false, recommended: false },
];

// The bandwidth test measures against the nearest Cloudflare edge
// (check-catalog bandwidth-test). Self-limited far below what the site
// itself would consume - see design.md decision 9.
export const BANDWIDTH_SOURCE: BandwidthSource = {
  kind: 'bandwidth',
  id: 'bandwidth-cloudflare',
  name: 'Cloudflare speed test',
  operator: 'Cloudflare',
  url: 'https://speed.cloudflare.com',
  ipDataVendor: false,
  recommended: false,
};

export const ALL_SOURCES: Source[] = [...HTTP_SOURCES, ...STUN_SOURCES, DNS_SOURCE, ...TRACE_SOURCES];

// Everything the extension may contact, including the non-selectable
// endpoint kinds - drives the disclosure test and the health-check tool.
export const CONTACTED_SOURCES: ContactedSource[] = [
  ...ALL_SOURCES,
  ...STATUS_SOURCES,
  RDAP_SOURCE,
  ...PROBE_TARGETS,
  BANDWIDTH_SOURCE,
];

// Per-source limit, so one slow service never holds up the rest.
export const HTTP_SOURCE_TIMEOUT_MS = 5000;

// 6 matches bash.ws's own "standard" test tier, not the reference CLI's
// default of 30 - this runs automatically per popup/report view, not as a
// manual one-off invocation, so a lighter default is more considerate of a
// free, unauthenticated third-party service.
export const DNS_LEAK_PROBE_COUNT = 6;

// Each probe's connection is expected to fail (the TLS cert doesn't cover
// probe subdomains) - the DNS resolution happens first regardless, which is
// all that matters. This bounds how long we wait for that doomed connection.
export const DNS_LEAK_PROBE_TIMEOUT_MS = 1500;

// Buffer between the last probe settling and reading results - the lookups
// themselves are done by then, this just gives bash.ws time to record them
// before we ask what it saw.
export const DNS_LEAK_RESULT_DELAY_MS = 800;
