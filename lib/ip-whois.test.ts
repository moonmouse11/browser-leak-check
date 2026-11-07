import { afterEach, describe, expect, it, vi } from 'vitest';
import { RDAP_SOURCE } from './config';
import { lookupWhois } from './ip-whois';

const APNIC_RECORD = {
  handle: '1.1.1.0 - 1.1.1.255',
  name: 'APNIC-LABS',
  country: 'AU',
  startAddress: '1.1.1.0',
  endAddress: '1.1.1.255',
};

function jsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('lookupWhois', () => {
  it('reports name, range and country per address', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(APNIC_RECORD)));

    const { entries } = await lookupWhois(['1.1.1.1']);
    expect(entries).toEqual([
      { ip: '1.1.1.1', status: 'ok', name: 'APNIC-LABS', range: '1.1.1.0 - 1.1.1.255', country: 'AU' },
    ]);
  });

  it('queries rdap.org once per distinct address', async () => {
    const fetchSpy = vi.fn(async (_url: string) => jsonResponse(APNIC_RECORD));
    vi.stubGlobal('fetch', fetchSpy);

    await lookupWhois(['1.1.1.1', '1.1.1.1', '8.8.8.8']);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`${RDAP_SOURCE.url}/ip/1.1.1.1`);
  });

  it('isolates failures per address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('1.1.1.1') ? jsonResponse(APNIC_RECORD) : jsonResponse({}, false, 404),
      ),
    );

    const { entries } = await lookupWhois(['1.1.1.1', '192.0.2.1']);
    expect(entries[0]?.status).toBe('ok');
    expect(entries[1]).toEqual({ ip: '192.0.2.1', status: 'failed', reason: 'http 404' });
  });

  it('rejects an empty record instead of showing blanks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ objectClassName: 'ip network' })));

    const [entry] = (await lookupWhois(['1.1.1.1'])).entries;
    expect(entry).toEqual({ ip: '1.1.1.1', status: 'failed', reason: 'empty record' });
  });

  it('falls back to the handle when start/end addresses are absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ handle: 'NET-1-1-1-0-1', name: 'CLOUDFLARENET' })));

    const [entry] = (await lookupWhois(['1.1.1.1'])).entries;
    expect(entry).toMatchObject({ status: 'ok', range: 'NET-1-1-1-0-1' });
  });

  it('resolves empty when the address promise rejects', async () => {
    const result = await lookupWhois(Promise.reject(new Error('echo failed')));
    expect(result).toEqual({ status: 'done', entries: [] });
  });
});
