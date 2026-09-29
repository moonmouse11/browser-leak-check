import { STUN_SERVERS } from './config';

export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx';

export interface WebrtcCandidate {
  type: IceCandidateType;
  address: string;
  leak: boolean;
}

export interface WebrtcLeakResult {
  leakDetected: boolean;
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
//   to compare against, so it isn't flagged rather than guessed at.
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

  const expected = await publicIps;
  const candidates = gathered.map((candidate) => ({
    ...candidate,
    leak: isLeakingCandidate(candidate, expected),
  }));

  return { leakDetected: candidates.some((candidate) => candidate.leak), candidates };
}
