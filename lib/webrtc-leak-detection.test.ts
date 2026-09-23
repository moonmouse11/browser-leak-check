import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectWebrtcLeak } from './webrtc-leak-detection';

type FakeCandidate = { type: string; address: string } | null;

interface IceCandidateEvent {
  candidate: FakeCandidate;
}

// Mimics just enough of RTCPeerConnection for detectWebrtcLeak: it fires the
// given sequence of candidate events (ending in `null` to signal "gathering
// complete") once setLocalDescription is called, exactly like a real
// RTCPeerConnection does after createOffer/setLocalDescription.
function installFakeRTCPeerConnection(events: FakeCandidate[]) {
  class FakeRTCPeerConnection {
    onicecandidate: ((event: IceCandidateEvent) => void) | null = null;
    constructor(public config: unknown) {}
    createDataChannel(_label: string) {}
    async createOffer() {
      return {};
    }
    async setLocalDescription(_description: unknown) {
      queueMicrotask(() => {
        for (const candidate of events) this.onicecandidate?.({ candidate });
      });
    }
    close() {}
  }

  vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectWebrtcLeak', () => {
  it('captures host and server-reflexive candidates from a single gathering pass', async () => {
    installFakeRTCPeerConnection([
      { type: 'host', address: '192.168.1.5' },
      { type: 'srflx', address: '203.0.113.9' },
      null,
    ]);

    const result = await detectWebrtcLeak();

    expect(result.leakDetected).toBe(true);
    expect(result.candidates).toEqual([
      { type: 'host', address: '192.168.1.5' },
      { type: 'srflx', address: '203.0.113.9' },
    ]);
  });

  it('reports no leak when gathering completes with no candidates', async () => {
    installFakeRTCPeerConnection([null]);

    const result = await detectWebrtcLeak();

    expect(result.leakDetected).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('still reports candidates when only some configured STUN servers respond', async () => {
    // A real RTCPeerConnection continues gathering from the servers that do
    // respond even if one configured STUN server is unreachable; this
    // stands in for that by simulating a run where only one candidate ever
    // arrives before gathering completes.
    installFakeRTCPeerConnection([{ type: 'srflx', address: '203.0.113.9' }, null]);

    const result = await detectWebrtcLeak();

    expect(result.candidates).toEqual([{ type: 'srflx', address: '203.0.113.9' }]);
  });

  it('makes no fetch calls of its own', async () => {
    installFakeRTCPeerConnection([null]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await detectWebrtcLeak();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
