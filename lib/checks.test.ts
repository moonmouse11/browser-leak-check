import { afterEach, describe, expect, it, vi } from 'vitest';
import { DNS_SOURCE, HTTP_SOURCES, PROBE_TARGETS, STATUS_SOURCES, STUN_SOURCES, TRACE_SOURCES } from './config';
import { runChecks, CATALOG_PARTS } from './checks';
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

describe('runChecks catalog parts', () => {
  const trace = TRACE_SOURCES[0]!;

  function stubAllFetch(failHosts: string[] = []) {
    const spy = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (failHosts.some((host) => u.includes(host))) throw new TypeError('offline');
      if (u.includes('cdn-cgi/trace')) {
        return { ok: true, status: 200, text: async () => 'ip=198.51.100.7\ncolo=IAD\nwarp=off\n' } as Response;
      }
      if (u.includes('status.json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: { indicator: 'none', description: 'ok' } }),
        } as Response;
      }
      if (u.includes('rdap.org')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ name: 'TEST-NET', startAddress: '198.51.100.0', endAddress: '198.51.100.255', country: 'US' }),
        } as Response;
      }
      if (init?.mode === 'no-cors') return {} as Response;
      const body = u.includes('ipify') ? '{"ip":"198.51.100.7"}' : '198.51.100.7\n';
      return { ok: true, status: 200, text: async () => body } as Response;
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('runs every catalog part and collects their independent results', async () => {
    stubAllFetch();

    const results = await runChecks([ipify.id, icanhazip.id, trace.id], { parts: CATALOG_PARTS }).all;

    expect(results.visibility?.status).toBe('done');
    expect(results.visibility?.services[0]).toMatchObject({ status: 'ok', agreement: 'matches' });
    expect(results.connectivity?.verdict).toBe('healthy');
    expect(results.serviceStatus?.services[0]?.indicator).toBe('operational');
    expect(results.whois?.entries[0]).toMatchObject({ status: 'ok', name: 'TEST-NET' });
  });

  it('keeps a failing part from affecting the others', async () => {
    stubAllFetch(['status.json', 'rdap.org']);

    const results = await runChecks([ipify.id, icanhazip.id, trace.id], { parts: CATALOG_PARTS }).all;

    expect(results.serviceStatus?.services.every((service) => service.reason === 'unreachable')).toBe(true);
    expect(results.whois?.entries.every((entry) => entry.status === 'failed')).toBe(true);
    expect(results.connectivity?.verdict).toBe('healthy');
    expect(results.visibility?.services[0]?.status).toBe('ok');
    expect(results.http.every((result) => result.status === 'ok')).toBe(true);
  });

  it('treats a total probe failure as a general problem only when echo worked', async () => {
    stubAllFetch(['favicon', 'generate_204']);

    const results = await runChecks([ipify.id, icanhazip.id], { parts: ['http', 'connectivity'] }).all;

    expect(results.connectivity?.verdict).toBe('general-failure');
  });

  it('runs only the default parts without the parts option (popup path)', async () => {
    const fetchSpy = stubAllFetch();

    const results = await runChecks([ipify.id, icanhazip.id, trace.id]).all;

    expect(results.visibility).toBeUndefined();
    expect(results.connectivity).toBeUndefined();
    expect(results.serviceStatus).toBeUndefined();
    expect(results.whois).toBeUndefined();
    const probed = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(probed.some((url) => url.includes('status.json'))).toBe(false);
    expect(probed.some((url) => PROBE_TARGETS.some((target) => url === target.url))).toBe(false);
  });

  it('reports visibility off (and never fetches trace) when no trace source is selected', async () => {
    const fetchSpy = stubAllFetch();

    const results = await runChecks([ipify.id, icanhazip.id], { parts: ['http', 'visibility'] }).all;

    expect(results.visibility).toEqual({ status: 'off', services: [] });
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('cdn-cgi/trace'))).toBe(false);
  });

  it('never includes bandwidth in a run (explicit opt-in only)', async () => {
    const fetchSpy = stubAllFetch();

    await runChecks([ipify.id, icanhazip.id], { parts: CATALOG_PARTS }).all;

    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('speed.cloudflare.com'))).toBe(false);
    expect(STATUS_SOURCES.length).toBeGreaterThan(0);
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

  it('treats a pre-catalog cache (no version) as stale', async () => {
    const session = fakeSession();
    await session.set({ lastCheck: { checkedAt: 1, selected: [], http: [] } });

    expect(await readCache(session)).toBeNull();
  });
});
