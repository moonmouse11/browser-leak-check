import { STUN_SERVERS } from './config';

export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx';

export interface WebrtcCandidate {
  type: IceCandidateType;
  address: string;
}

export interface WebrtcLeakResult {
  leakDetected: boolean;
  candidates: WebrtcCandidate[];
}

const GATHERING_TIMEOUT_MS = 5000;

// One RTCPeerConnection with every configured STUN server in iceServers -
// the browser gathers candidates from all of them in a single ICE-gathering
// pass. If one server doesn't respond, the browser's own ICE engine simply
// continues with the others; this function makes no per-server distinction.
export async function detectWebrtcLeak(): Promise<WebrtcLeakResult> {
  const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
  const candidates: WebrtcCandidate[] = [];
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
        candidates.push({ type: type as IceCandidateType, address });
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

  return { leakDetected: candidates.length > 0, candidates };
}
