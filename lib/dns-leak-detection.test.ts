import { afterEach, describe, expect, it, vi } from 'vitest';
import { DNS_LEAK_PROBE_COUNT } from './config';
import { detectDnsLeak } from './dns-leak-detection';

function textResponse(body: string, ok = true): Response {
  return { ok, text: async () => body } as Response;
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

function mockFetch(impl: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

const RESULT_URL_MARKER = '/dnsleak/test/';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectDnsLeak', () => {
  it('reports failed when the session id request fails', async () => {
    mockFetch(async (url) =>
      url.endsWith('/id') ? textResponse('', false) : jsonResponse([]),
    );

    const result = await detectDnsLeak();

    expect(result).toEqual({ status: 'failed', resolvers: [] });
  });

  it('reports failed when the session id is empty', async () => {
    mockFetch(async (url) => (url.endsWith('/id') ? textResponse('   ') : jsonResponse([])));

    const result = await detectDnsLeak();

    expect(result).toEqual({ status: 'failed', resolvers: [] });
  });

  it('reports failed, within the timeout, when bash.ws never answers the id request', async () => {
    mockFetch(() => new Promise(() => {}));

    const result = await detectDnsLeak({ timeoutMs: 30 });

    expect(result).toEqual({ status: 'failed', resolvers: [] });
  });

  it('reports failed, within the timeout, when the results request hangs', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) return new Promise<Response>(() => {});
      throw new Error('TLS handshake failed');
    });

    const result = await detectDnsLeak({ timeoutMs: 30 });

    expect(result.status).toBe('failed');
  });

  it('reports failed when the results request fails, distinct from a real no-leak result', async () => {
    mockFetch(async (url) =>
      url.endsWith('/id') ? textResponse('abc123') : jsonResponse([], false),
    );

    const result = await detectDnsLeak();

    expect(result.status).toBe('failed');
  });

  it('does not throw or block when probe connections reject', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) {
        return jsonResponse([{ type: 'conclusion', ip: 'No leak detected.' }]);
      }
      // Probe subdomains: simulate the real-world TLS failure.
      throw new Error('TLS handshake failed');
    });

    const result = await detectDnsLeak();

    expect(result.status).toBe('no-leak');
  });

  it('parses resolvers and classifies a leak-detected conclusion', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) {
        return jsonResponse([
          { type: 'ip', ip: '31.77.19.207', country_name: 'Bouvet Island', asn: '' },
          {
            type: 'dns',
            ip: '109.195.129.5',
            country_name: 'Russian Federation',
            asn: 'AS56330 JSC ER-Telecom Holding',
          },
          {
            type: 'dns',
            ip: '172.217.33.146',
            country_name: 'United States of America',
            asn: 'AS15169 Google LLC',
          },
          { type: 'conclusion', ip: 'DNS may be leaking.' },
        ]);
      }
      return Promise.reject(new Error('unreachable'));
    });

    const result = await detectDnsLeak();

    expect(result.status).toBe('leak-detected');
    expect(result.resolvers).toEqual([
      { ip: '109.195.129.5', countryName: 'Russian Federation', asn: 'AS56330 JSC ER-Telecom Holding' },
      { ip: '172.217.33.146', countryName: 'United States of America', asn: 'AS15169 Google LLC' },
    ]);
  });

  it('reads results only after every probe has settled', async () => {
    let settledProbes = 0;
    let settledBeforeResults = -1;
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) {
        settledBeforeResults = settledProbes;
        return jsonResponse([{ type: 'conclusion', ip: 'No leak detected.' }]);
      }
      // A slow resolver: the probe settles well after the fixed buffer alone
      // would have elapsed.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      settledProbes++;
      throw new Error('TLS handshake failed');
    });

    await detectDnsLeak();

    expect(settledBeforeResults).toBe(DNS_LEAK_PROBE_COUNT);
  });

  it('classifies a result with no conclusion entry as unknown', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) {
        return jsonResponse([{ type: 'dns', ip: '109.195.129.5', country_name: '', asn: '' }]);
      }
      return Promise.reject(new Error('unreachable'));
    });

    const result = await detectDnsLeak();

    expect(result.status).toBe('unknown');
  });

  it('classifies an unrecognized conclusion string as unknown', async () => {
    mockFetch(async (url) => {
      if (url.endsWith('/id')) return textResponse('abc123');
      if (url.includes(RESULT_URL_MARKER)) {
        return jsonResponse([{ type: 'conclusion', ip: 'Something unexpected happened.' }]);
      }
      return Promise.reject(new Error('unreachable'));
    });

    const result = await detectDnsLeak();

    expect(result.status).toBe('unknown');
  });
});
