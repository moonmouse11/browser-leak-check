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
