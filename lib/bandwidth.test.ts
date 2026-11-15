import { afterEach, describe, expect, it, vi } from 'vitest';
import { BANDWIDTH_SOURCE } from './config';
import { measureBandwidth } from './bandwidth';

function fakeResponse(ok = true, status = 200): Response {
  return { ok, status, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('measureBandwidth', () => {
  it('measures down, up and rtt against the registry endpoint', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const result = await measureBandwidth();

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.downMbps).toBeGreaterThan(0);
    expect(result.upMbps).toBeGreaterThan(0);
    expect(result.rttMs).toBeGreaterThanOrEqual(0);
    // rtt probe + 3 downloads + 2 uploads, nothing more
    expect(result.bytesConsumed).toBe(1_000 + 1e6 + 5e6 + 25e6 + 1e6 + 5e6);

    const urls = fetchSpy.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toBe(`${BANDWIDTH_SOURCE.url}/__down?bytes=1000`);
    expect(urls).toContain(`${BANDWIDTH_SOURCE.url}/__down?bytes=25000000`);
    expect(fetchSpy.mock.calls.some(([, init]) => (init as RequestInit).method === 'POST')).toBe(true);
  });

  it('reports a failure with the traffic actually consumed', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls > 2) throw new Error('connection reset');
        return fakeResponse();
      }),
    );

    const result = await measureBandwidth();

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.reason).toBe('connection reset');
    expect(result.bytesConsumed).toBe(1_000 + 1e6);
  });

  it('never runs silently: every request carries the abort signal and omits credentials', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) => fakeResponse());
    vi.stubGlobal('fetch', fetchSpy);

    await measureBandwidth();

    for (const [, init] of fetchSpy.mock.calls) {
      expect(init?.credentials).toBe('omit');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});
