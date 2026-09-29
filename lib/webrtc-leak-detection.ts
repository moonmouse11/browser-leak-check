import type { StunSource } from './config';
import { normalizeIp } from './ip-sources';

export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx';

export interface WebrtcCandidate {
  type: IceCandidateType;
  address: string;
  leak: boolean;
  // The STUN server that produced a reflexive (srflx/prflx) candidate.
  // Host candidates come from the local interfaces, not from a server, and
  // are identical on every connection, so they carry none.
  serverId?: string;
}

// - ok: the server answered with at least one reflexive address.
// - no-response: gathering finished without a reflexive address from it
//   (unreachable or blocked on this network).
// - unavailable: the browser refused to create a connection for it.
export interface StunServerResult {
  serverId: string;
  status: 'ok' | 'no-response' | 'unavailable';
  addresses: string[];
}

// - leak-detected: at least one candidate exposes something (see
//   isLeakingCandidate).
// - no-connection: nothing leaked, but the IP-echo service was unreachable,
//   so reflexive candidates had nothing to be compared against.
// - webrtc-disabled: the browser (or a privacy extension) refused to create
//   an RTCPeerConnection - the protected state, not an error.
// - off: the user's source selection contains no STUN server.
export type WebrtcLeakStatus =
  | 'leak-detected'
  | 'no-leak'
  | 'no-connection'
  | 'webrtc-disabled'
  | 'off';

export interface WebrtcLeakResult {
  status: WebrtcLeakStatus;
  candidates: WebrtcCandidate[];
  servers: StunServerResult[];
}

const GATHERING_TIMEOUT_MS = 5000;

// Chrome and Firefox replace raw host IPs with random `<uuid>.local` mDNS
// names by default - that's the browser's own WebRTC protection, and the
// name reveals nothing about the network.
function isMdnsHostname(address: string): boolean {
  return address.toLowerCase().endsWith('.local');
}

// What counts as a leak, per candidate type:
// - host: any raw IP, private ones included - it exposes the local network
//   even when it doesn't bypass the VPN.
// - srflx/prflx: a public address the IP-echo service didn't see, i.e. one
//   that routed around the VPN. Without an IP-echo result there's nothing
//   to compare against, so it isn't flagged here - detectWebrtcLeak reports
//   that case as "no-connection" instead.
// - relay: only produced by TURN servers, which we don't configure.
export function isLeakingCandidate(
  candidate: Pick<WebrtcCandidate, 'type' | 'address'>,
  publicIps: string[],
): boolean {
  switch (candidate.type) {
    case 'host':
      return !isMdnsHostname(candidate.address);
    case 'srflx':
    case 'prflx': {
      const address = canonical(candidate.address);
      return publicIps.length > 0 && !publicIps.some((ip) => canonical(ip) === address);
    }
    case 'relay':
      return false;
  }
}

// Same address, same spelling: IPv6 especially can be written several ways.
function canonical(address: string): string {
  return normalizeIp(address)?.address ?? address.toLowerCase();
}

type GatheredCandidate = Pick<WebrtcCandidate, 'type' | 'address'>;

// One RTCPeerConnection per selected STUN server, all gathering in
// parallel, so every reflexive address is attributable to the server that
// produced it - RTCIceCandidate.url, which would allow one pooled
// connection, isn't populated consistently across Chrome and Firefox.
//
// `publicIps` is every address the HTTP sources observed; reflexive
// candidates are compared against it. It may be a promise so this runs in
// parallel with the HTTP sources - it's only awaited once gathering is done.
export async function detectWebrtcLeak(
  servers: StunSource[],
  publicIps: string[] | Promise<string[]> = [],
): Promise<WebrtcLeakResult> {
  if (servers.length === 0) return { status: 'off', candidates: [], servers: [] };

  const outcomes = await Promise.allSettled(servers.map((server) => gatherCandidates(server.url)));

  // Firefox with media.peerconnection.enabled=false has no
  // RTCPeerConnection at all; WebRTC-blocking extensions make it throw.
  if (outcomes.every((outcome) => outcome.status === 'rejected')) {
    return {
      status: 'webrtc-disabled',
      candidates: [],
      servers: servers.map((server) => ({ serverId: server.id, status: 'unavailable', addresses: [] })),
    };
  }

  const expected = await Promise.resolve(publicIps).catch(() => []);
  const candidates: WebrtcCandidate[] = [];
  const seen = new Set<string>();
  const serverResults: StunServerResult[] = [];

  outcomes.forEach((outcome, index) => {
    const serverId = servers[index]!.id;
    if (outcome.status === 'rejected') {
      serverResults.push({ serverId, status: 'unavailable', addresses: [] });
      return;
    }

    const addresses: string[] = [];
    for (const candidate of outcome.value) {
      const reflexive = candidate.type === 'srflx' || candidate.type === 'prflx';
      const key = reflexive
        ? `${serverId}:${candidate.type}:${candidate.address}`
        : `${candidate.type}:${candidate.address}`;
      if (reflexive && !addresses.includes(candidate.address)) addresses.push(candidate.address);
      if (seen.has(key)) continue;

      seen.add(key);
      candidates.push({
        ...candidate,
        leak: isLeakingCandidate(candidate, expected),
        ...(reflexive && { serverId }),
      });
    }
    serverResults.push({ serverId, status: addresses.length > 0 ? 'ok' : 'no-response', addresses });
  });

  let status: WebrtcLeakStatus = 'no-leak';
  if (candidates.some((candidate) => candidate.leak)) status = 'leak-detected';
  else if (expected.length === 0) status = 'no-connection';

  return { status, candidates, servers: serverResults };
}

async function gatherCandidates(stunUrl: string): Promise<GatheredCandidate[]> {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: stunUrl }] });
  const gathered: GatheredCandidate[] = [];
  const seen = new Set<string>();

  const gatheringDone = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, GATHERING_TIMEOUT_MS);

    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (!candidate) {
        // A null candidate signals the browser has finished gathering.
        clearTimeout(timer);
        resolve();
        return;
      }

      const { address, type } = candidate;
      const key = `${type}:${address}`;
      if (address && type && !seen.has(key)) {
        seen.add(key);
        gathered.push({ type: type as IceCandidateType, address });
      }
    };
  });

  try {
    pc.createDataChannel('leak-probe');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatheringDone;
  } finally {
    pc.close();
  }

  return gathered;
}
