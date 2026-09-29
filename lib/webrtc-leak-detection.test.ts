import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectWebrtcLeak, isLeakingCandidate } from './webrtc-leak-detection';

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

    const result = await detectWebrtcLeak(['203.0.113.9']);

    expect(result.status).toBe('leak-detected');
    expect(result.candidates).toEqual([
      { type: 'host', address: '192.168.1.5', leak: true },
      { type: 'srflx', address: '203.0.113.9', leak: false },
    ]);
  });

  it('reports no leak when gathering completes with no candidates', async () => {
    installFakeRTCPeerConnection([null]);

    const result = await detectWebrtcLeak(['198.51.100.7']);

    expect(result.status).toBe('no-leak');
    expect(result.candidates).toEqual([]);
  });

  it('reports no leak when only the VPN-assigned address and an mDNS host appear', async () => {
    installFakeRTCPeerConnection([
      { type: 'host', address: '0f3c9a2e-1b4d-4e5f-8a6b-7c8d9e0f1a2b.local' },
      { type: 'srflx', address: '198.51.100.7' },
      null,
    ]);

    const result = await detectWebrtcLeak(['198.51.100.7']);

    expect(result.status).toBe('no-leak');
  });

  it('flags a reflexive address that differs from the IP-echo result', async () => {
    installFakeRTCPeerConnection([
      { type: 'srflx', address: '198.51.100.7' },
      { type: 'srflx', address: '203.0.113.9' },
      null,
    ]);

    const result = await detectWebrtcLeak(Promise.resolve(['198.51.100.7']));

    expect(result.status).toBe('leak-detected');
    expect(result.candidates.filter((c) => c.leak).map((c) => c.address)).toEqual([
      '203.0.113.9',
    ]);
  });

  it('still reports candidates when only some configured STUN servers respond', async () => {
    // A real RTCPeerConnection continues gathering from the servers that do
    // respond even if one configured STUN server is unreachable; this
    // stands in for that by simulating a run where only one candidate ever
    // arrives before gathering completes.
    installFakeRTCPeerConnection([{ type: 'srflx', address: '203.0.113.9' }, null]);

    const result = await detectWebrtcLeak();

    expect(result.candidates).toEqual([{ type: 'srflx', address: '203.0.113.9', leak: false }]);
  });

  it('reports no connection when the IP-echo service gave nothing to compare against', async () => {
    installFakeRTCPeerConnection([{ type: 'srflx', address: '203.0.113.9' }, null]);

    const result = await detectWebrtcLeak([]);

    expect(result.status).toBe('no-connection');
  });

  it('still reports a host leak when the IP-echo service is unreachable', async () => {
    installFakeRTCPeerConnection([{ type: 'host', address: '192.168.1.5' }, null]);

    const result = await detectWebrtcLeak(Promise.reject(new Error('offline')));

    expect(result.status).toBe('leak-detected');
  });

  it('reports webrtc as disabled when RTCPeerConnection does not exist', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined);

    const result = await detectWebrtcLeak(['198.51.100.7']);

    expect(result).toEqual({ status: 'webrtc-disabled', candidates: [] });
  });

  it('reports webrtc as disabled when RTCPeerConnection throws', async () => {
    vi.stubGlobal(
      'RTCPeerConnection',
      class {
        constructor() {
          throw new Error('blocked by extension');
        }
      },
    );

    const result = await detectWebrtcLeak(['198.51.100.7']);

    expect(result.status).toBe('webrtc-disabled');
  });

  it('makes no fetch calls of its own', async () => {
    installFakeRTCPeerConnection([null]);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await detectWebrtcLeak();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('isLeakingCandidate', () => {
  it('treats a raw host IP as a leak, private ranges included', () => {
    expect(isLeakingCandidate({ type: 'host', address: '192.168.1.5' }, [])).toBe(true);
    expect(isLeakingCandidate({ type: 'host', address: 'fe80::1' }, [])).toBe(true);
  });

  it('does not treat an mDNS host candidate as a leak', () => {
    expect(isLeakingCandidate({ type: 'host', address: 'abc.local' }, [])).toBe(false);
  });

  it('compares reflexive IPv6 addresses case-insensitively', () => {
    expect(
      isLeakingCandidate({ type: 'srflx', address: '2001:DB8::1' }, ['2001:db8::1']),
    ).toBe(false);
  });

  it('does not flag a reflexive address when there is no IP-echo result to compare', () => {
    expect(isLeakingCandidate({ type: 'prflx', address: '203.0.113.9' }, [])).toBe(false);
  });

  it('never flags relay candidates', () => {
    expect(isLeakingCandidate({ type: 'relay', address: '203.0.113.9' }, ['1.2.3.4'])).toBe(
      false,
    );
  });
});
