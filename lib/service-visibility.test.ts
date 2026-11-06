import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACE_SOURCES, type TraceSource } from './config';
import { detectServiceVisibility } from './service-visibility';

const CLAUDE = TRACE_SOURCES.find((s) => s.id === 'trace-claude')!;
const CHATGPT = TRACE_SOURCES.find((s) => s.id === 'trace-chatgpt')!;

function traceBody(ip: string, warp = 'off'): string {
  return `h=example.com\nip=${ip}\ncolo=IAD\nhttp=http/2\ntls=TLSv1.3\nwarp=${warp}\n`;
}

function textResponse(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as Response;
}

function stubFetch(handlers: Record<string, () => Promise<Response>>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const handler = handlers[url];
      if (!handler) throw new Error(`unexpected fetch: ${url}`);
      return handler();
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('detectServiceVisibility', () => {
  it('is off when the selection has no trace source', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(await detectServiceVisibility([])).toEqual({ status: 'off', services: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports per-service trace results and marks consensus matches', async () => {
    stubFetch({
      [CLAUDE.url]: async () => textResponse(traceBody('203.0.113.9')),
      [CHATGPT.url]: async () => textResponse(traceBody('203.0.113.9')),
    });

    const result = await detectServiceVisibility([CLAUDE, CHATGPT], ['203.0.113.9']);

    expect(result.status).toBe('done');
    expect(result.services).toHaveLength(2);
    for (const entry of result.services) {
      expect(entry.status).toBe('ok');
      expect(entry.trace?.colo).toBe('IAD');
      expect(entry.agreement).toBe('matches');
    }
  });

  it('flags a service whose egress differs from the consensus (split routing)', async () => {
    stubFetch({
      [CLAUDE.url]: async () => textResponse(traceBody('198.51.100.7')),
      [CHATGPT.url]: async () => textResponse(traceBody('203.0.113.9')),
    });

    const result = await detectServiceVisibility([CLAUDE, CHATGPT], ['203.0.113.9']);

    expect(result.services[0]).toMatchObject({ sourceId: 'trace-claude', agreement: 'differs' });
    expect(result.services[1]).toMatchObject({ sourceId: 'trace-chatgpt', agreement: 'matches' });
  });

  it('marks warp=on so a differs flag reads as Cloudflare egress, not a leak', async () => {
    stubFetch({ [CLAUDE.url]: async () => textResponse(traceBody('203.0.113.9', 'on')) });

    const [entry] = (await detectServiceVisibility([CLAUDE], [])).services;
    expect(entry).toMatchObject({ status: 'ok', warp: true });
    expect(entry?.trace?.warp).toBe('on');
  });

  it('reports failure per service without affecting the others', async () => {
    stubFetch({
      [CLAUDE.url]: async () => textResponse('nope', false, 403),
      [CHATGPT.url]: async () => textResponse(traceBody('203.0.113.9')),
    });

    const result = await detectServiceVisibility([CLAUDE, CHATGPT], ['203.0.113.9']);

    expect(result.services[0]).toEqual({ sourceId: 'trace-claude', status: 'failed', reason: 'http 403' });
    expect(result.services[1]).toMatchObject({ status: 'ok', agreement: 'matches' });
  });

  it('reports unreachable and timeout as failures, never throws', async () => {
    const down: TraceSource = { ...CLAUDE, id: 'trace-down', url: 'https://down.example/trace' };
    stubFetch({
      [down.url]: async () => {
        throw new Error('ECONNREFUSED');
      },
    });

    const [entry] = (await detectServiceVisibility([down], [])).services;
    expect(entry).toEqual({ sourceId: 'trace-down', status: 'failed', reason: 'unreachable' });
  });

  it('leaves agreement unset when there is no consensus to compare against', async () => {
    stubFetch({ [CLAUDE.url]: async () => textResponse(traceBody('203.0.113.9')) });

    const [entry] = (await detectServiceVisibility([CLAUDE], Promise.resolve([]))).services;
    expect(entry?.agreement).toBeUndefined();
  });

  it('compares against a consensus that resolves later (parallel run)', async () => {
    stubFetch({ [CLAUDE.url]: async () => textResponse(traceBody('203.0.113.9')) });

    const consensus = new Promise<string[]>((resolve) => setTimeout(() => resolve(['203.0.113.9']), 20));
    const [entry] = (await detectServiceVisibility([CLAUDE], consensus)).services;
    expect(entry?.agreement).toBe('matches');
  });
});
