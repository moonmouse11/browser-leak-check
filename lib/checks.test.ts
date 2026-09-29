import { afterEach, describe, expect, it, vi } from 'vitest';
import { DNS_SOURCE, HTTP_SOURCES, STUN_SOURCES } from './config';
import { runChecks } from './checks';
import { readCache, writeCache } from './session-cache';
import type { StorageAreaLike } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

const ipify = HTTP_SOURCES.find((source) => source.id === 'ipify')!;
const icanhazip = HTTP_SOURCES.find((source) => source.id === 'icanhazip')!;

function stubFetch() {
  const fetchSpy = vi.fn(async (url: string) => {
    const body = url.includes('ipify') ? '{"ip":"198.51.100.7"}' : '198.51.100.7\n';
    return { ok: true, status: 200, text: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

describe('runChecks', () => {
  it('contacts only the selected sources and reports webrtc and dns as off when deselected', async () => {
    const fetchSpy = stubFetch();
    const peerConnection = vi.fn();
    vi.stubGlobal('RTCPeerConnection', peerConnection);

    const results = await runChecks([ipify.id, icanhazip.id]).all;

    expect(fetchSpy.mock.calls.map(([url]) => url).sort()).toEqual([icanhazip.url, ipify.url].sort());
    expect(peerConnection).not.toHaveBeenCalled();
    expect(results.webrtc.status).toBe('off');
    expect(results.dns.status).toBe('off');
    expect(results.http.every((result) => result.status === 'ok')).toBe(true);
  });

  it('never contacts bash.ws when the dns check is deselected', async () => {
    const fetchSpy = stubFetch();

    await runChecks([ipify.id, icanhazip.id]).all;

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes(new URL(DNS_SOURCE.url).host))).toBe(false);
  });

  it('reports webrtc as no-connection only when no http source succeeded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    class QuietPeerConnection {
      onicecandidate: ((event: { candidate: null }) => void) | null = null;
      createDataChannel() {}
      async createOffer() {
        return {};
      }
      async setLocalDescription() {
        queueMicrotask(() => this.onicecandidate?.({ candidate: null }));
      }
      close() {}
    }
    vi.stubGlobal('RTCPeerConnection', QuietPeerConnection);

    const results = await runChecks([ipify.id, icanhazip.id, STUN_SOURCES[0]!.id]).all;

    expect(results.webrtc.status).toBe('no-connection');
  });
});

describe('session cache', () => {
  function fakeSession(): StorageAreaLike {
    const data: Record<string, unknown> = {};
    return {
      async get(key) {
        return key in data ? { [key]: data[key] } : {};
      },
      async set(items) {
        Object.assign(data, items);
      },
      async remove(key) {
        delete data[key];
      },
    };
  }

  it('returns a stored result without anything being fetched', async () => {
    const session = fakeSession();
    const results = await (stubFetch(), runChecks([ipify.id, icanhazip.id]).all);
    await writeCache(session, results);
    const fetchSpy = stubFetch();

    expect(await readCache(session)).toEqual(results);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is a no-op without storage.session (Firefox before 115)', async () => {
    await writeCache(null, { checkedAt: 1 } as never);

    expect(await readCache(null)).toBeNull();
  });
});
