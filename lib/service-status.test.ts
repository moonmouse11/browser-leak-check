import { afterEach, describe, expect, it, vi } from 'vitest';
import { STATUS_SOURCES } from './config';
import { fetchServiceStatus, mapIndicator } from './service-status';

const CLAUDE = STATUS_SOURCES.find((s) => s.id === 'status-claude')!;
const OPENAI = STATUS_SOURCES.find((s) => s.id === 'status-openai')!;

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('mapIndicator', () => {
  it('maps statuspage indicators conservatively', () => {
    expect(mapIndicator('none')).toBe('operational');
    expect(mapIndicator('minor')).toBe('degraded');
    expect(mapIndicator('maintenance')).toBe('degraded');
    expect(mapIndicator('major')).toBe('outage');
    expect(mapIndicator('critical')).toBe('outage');
    expect(mapIndicator('something-new')).toBe('unknown');
    expect(mapIndicator(undefined)).toBe('unknown');
  });
});

describe('fetchServiceStatus', () => {
  it('reports operational with no description attached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ page: { name: 'Claude' }, status: { indicator: 'none', description: 'All Systems Operational' } })),
    );

    const [entry] = (await fetchServiceStatus([CLAUDE])).services;
    expect(entry).toEqual({ sourceId: 'status-claude', indicator: 'operational' });
  });

  it('keeps the incident description on a degraded service', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: { indicator: 'major', description: 'Partial System Outage' } })),
    );

    const [entry] = (await fetchServiceStatus([CLAUDE])).services;
    expect(entry).toEqual({ sourceId: 'status-claude', indicator: 'outage', description: 'Partial System Outage' });
  });

  it('reports a failing endpoint as unknown with a reason, others unaffected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === CLAUDE.url
          ? jsonResponse({}, false, 503)
          : jsonResponse({ status: { indicator: 'none', description: 'ok' } }),
      ),
    );

    const { services } = await fetchServiceStatus([CLAUDE, OPENAI]);
    expect(services[0]).toEqual({ sourceId: 'status-claude', indicator: 'unknown', reason: 'http 503' });
    expect(services[1]).toMatchObject({ indicator: 'operational' });
  });

  it('treats a malformed body as bad response, never operational', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('<html>not json</html>')));

    const [entry] = (await fetchServiceStatus([CLAUDE])).services;
    expect(entry).toMatchObject({ indicator: 'unknown', reason: 'bad response' });
  });

  it('reports network errors as unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('DNS failure'))));

    const [entry] = (await fetchServiceStatus([CLAUDE])).services;
    expect(entry).toEqual({ sourceId: 'status-claude', indicator: 'unknown', reason: 'unreachable' });
  });
});
