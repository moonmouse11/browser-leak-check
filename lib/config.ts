// Single place to change the IP-echo provider or STUN server list.
// See openspec/changes/leak-detector-mvp/design.md for why these are
// third-party services rather than self-hosted.

export const IP_ECHO_ENDPOINTS = {
  v4: 'https://api.ipify.org?format=json',
  v6: 'https://api6.ipify.org?format=json',
} as const;

// Independent operators (not just independent hostnames) on purpose: a
// single-operator STUN dependency is both a single point of failure and a
// single point of privacy concentration, and symmetric NAT can produce a
// different reflexive address per server - see design.md's WebRTC decision.
// Re-verify against a live list (e.g. github.com/pradt2/always-online-stun)
// before shipping, since public STUN availability changes over time.
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
];

// bash.ws's public DNS-leak-test service - see
// openspec/changes/dns-leak-bashws/design.md for why we reuse it instead
// of operating our own authoritative DNS server (Path A vs Path B).
export const DNS_LEAK_BASE_URL = 'https://bash.ws';

// 6 matches bash.ws's own "standard" test tier, not the reference CLI's
// default of 30 - this runs automatically per popup/report view, not as a
// manual one-off invocation, so a lighter default is more considerate of a
// free, unauthenticated third-party service.
export const DNS_LEAK_PROBE_COUNT = 6;

// Each probe's connection is expected to fail (the TLS cert doesn't cover
// probe subdomains) - the DNS resolution happens first regardless, which is
// all that matters. This bounds how long we wait for that doomed connection.
export const DNS_LEAK_PROBE_TIMEOUT_MS = 1500;

// Fixed buffer between firing probes and reading results - DNS lookups over
// UDP are near-instant, this just gives them time to land before we ask
// bash.ws what it saw.
export const DNS_LEAK_RESULT_DELAY_MS = 800;
