import { STUN_SERVERS } from './config';

export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx';

export interface WebrtcCandidate {
  type: IceCandidateType;
  address: string;
  leak: boolean;
}

// - leak-detected: at least one candidate exposes something (see
//   isLeakingCandidate).
// - no-connection: nothing leaked, but the IP-echo service was unreachable,
//   so reflexive candidates had nothing to be compared against.
// - webrtc-disabled: the browser (or a privacy extension) refused to create
//   an RTCPeerConnection - the protected state, not an error.
export type WebrtcLeakStatus = 'leak-detected' | 'no-leak' | 'no-connection' | 'webrtc-disabled';

export interface WebrtcLeakResult {
  status: WebrtcLeakStatus;
  candidates: WebrtcCandidate[];
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
      const address = candidate.address.toLowerCase();
      return publicIps.length > 0 && !publicIps.some((ip) => ip.toLowerCase() === address);
    }
    case 'relay':
      return false;
  }
}

// One RTCPeerConnection with every configured STUN server in iceServers -
// the browser gathers candidates from all of them in a single ICE-gathering
// pass. If one server doesn't respond, the browser's own ICE engine simply
// continues with the others; this function makes no per-server distinction.
//
// `publicIps` is the IP-echo result srflx candidates are compared against.
// It may be a promise so both checks can run in parallel - it's only
// awaited once gathering is done.
export async function detectWebrtcLeak(
  publicIps: string[] | Promise<string[]> = [],
): Promise<WebrtcLeakResult> {
  let gathered: Pick<WebrtcCandidate, 'type' | 'address'>[];
  try {
    gathered = await gatherCandidates();
  } catch {
    // Firefox with media.peerconnection.enabled=false has no
    // RTCPeerConnection at all; WebRTC-blocking extensions make it throw.
    return { status: 'webrtc-disabled', candidates: [] };
  }

  const expected = await Promise.resolve(publicIps).catch(() => []);
  const candidates = gathered.map((candidate) => ({
    ...candidate,
    leak: isLeakingCandidate(candidate, expected),
  }));

  let status: WebrtcLeakStatus = 'no-leak';
  if (candidates.some((candidate) => candidate.leak)) status = 'leak-detected';
  else if (expected.length === 0) status = 'no-connection';

  return { status, candidates };
}

async function gatherCandidates(): Promise<Pick<WebrtcCandidate, 'type' | 'address'>[]> {
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  const gathered: Pick<WebrtcCandidate, 'type' | 'address'>[] = [];
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
