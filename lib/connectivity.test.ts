import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROBE_TARGETS } from './config';
import { probeConnectivity } from './connectivity';

const [A, B, C] = [PROBE_TARGETS[0]!, PROBE_TARGETS[1]!, PROBE_TARGETS[2]!];

function stubFetch(outcomes: Record<string, 'ok' | 'fail'>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (outcomes[url] === 'ok') return {} as Response;
      throw new Error('network down');
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('probeConnectivity', () => {
  it('reports all reachable as healthy with elapsed times', async () => {
    stubFetch({ [A.url]: 'ok', [B.url]: 'ok' });

    const result = await probeConnectivity([A, B]);

    expect(result).toMatchObject({ status: 'done', reachable: 2, total: 2, verdict: 'healthy' });
    expect(result.results.every((r) => typeof r.elapsedMs === 'number')).toBe(true);
  });

  it('reports a partial outage per target, others unaffected', async () => {
    stubFetch({ [A.url]: 'ok', [B.url]: 'fail', [C.url]: 'ok' });

    const result = await probeConnectivity([A, B, C]);

    expect(result.verdict).toBe('partial');
    expect(result.results.find((r) => r.targetId === B.id)).toEqual({ targetId: B.id, status: 'unreachable' });
    expect(result.reachable).toBe(2);
  });

  it('calls a total failure a general problem only when the network was up', async () => {
    stubFetch({ [A.url]: 'fail', [B.url]: 'fail' });

    expect((await probeConnectivity([A, B], { networkWasUp: true })).verdict).toBe('general-failure');
    expect((await probeConnectivity([A, B], { networkWasUp: false })).verdict).toBe('unknown');
  });

  it('uses no-cors and omits credentials for every probe', async () => {
    const fetchSpy = vi.fn(async () => ({} as Response));
    vi.stubGlobal('fetch', fetchSpy);

    await probeConnectivity([A]);

    expect(fetchSpy).toHaveBeenCalledWith(
      A.url,
      expect.objectContaining({ mode: 'no-cors', credentials: 'omit', cache: 'no-store' }),
    );
  });

  it('fails a probe that never settles instead of hanging the check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ),
    );

    const [result] = (await probeConnectivity([A], { timeoutMs: 30 })).results;
    expect(result).toEqual({ targetId: A.id, status: 'unreachable' });
  });
});
