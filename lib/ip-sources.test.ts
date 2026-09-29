import { afterEach, describe, expect, it, vi } from 'vitest';
import { HTTP_SOURCES, type HttpSource } from './config';
import {
  classifyAgreement,
  normalizeIp,
  observedAddresses,
  parseResponse,
  querySource,
  querySources,
  type HttpSourceResult,
} from './ip-sources';
import { RESPONSE_SAMPLES, SAMPLE_ASN, SAMPLE_IP } from './ip-sources.samples';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseResponse, pinned to a recorded sample per registry source', () => {
  for (const source of HTTP_SOURCES) {
    it(`parses ${source.id}`, () => {
      const sample = RESPONSE_SAMPLES[source.id];
      expect(sample, `no recorded sample for ${source.id}`).toBeDefined();

      const parsed = parseResponse(source.format, sample!);

      expect(parsed.address).toBe(SAMPLE_IP);
      expect(parsed.family).toBe('v4');
      // The "ASN" label in the selection UI must match what's really parsed.
      expect(parsed.asn === SAMPLE_ASN).toBe(source.providesAsn);
    });
  }

  it('keeps the network owner and drops the AS prefix from it', () => {
    const ipinfo = HTTP_SOURCES.find((source) => source.id === 'ipinfo')!;

    expect(parseResponse(ipinfo.format, RESPONSE_SAMPLES.ipinfo!)).toMatchObject({
      asn: 'AS64500',
      org: 'Example Net GmbH',
    });
  });

  it('reads the client address, not a proxy address from another field', () => {
    const ifconfig = HTTP_SOURCES.find((source) => source.id === 'ifconfig-me')!;

    expect(parseResponse(ifconfig.format, RESPONSE_SAMPLES['ifconfig-me']!).address).toBe(SAMPLE_IP);
  });

  it('rejects a body whose address is not an IP literal', () => {
    expect(() => parseResponse({ type: 'text' }, '<img src=x onerror=alert(1)>')).toThrow();
    expect(() => parseResponse({ type: 'json', ip: 'ip' }, '{"ip":"example.com"}')).toThrow();
    expect(() => parseResponse({ type: 'json', ip: 'ip' }, 'not json')).toThrow();
    expect(() => parseResponse({ type: 'cf-trace' }, 'h=www.cloudflare.com\n')).toThrow();
  });
});

describe('normalizeIp', () => {
  it('accepts IPv4 and canonicalizes IPv6', () => {
    expect(normalizeIp('203.0.113.9')).toEqual({ address: '203.0.113.9', family: 'v4' });
    expect(normalizeIp('2001:DB8:0:0::1')).toEqual({ address: '2001:db8::1', family: 'v6' });
  });

  it('rejects anything that is not a bare address', () => {
    expect(normalizeIp('256.1.1.1')).toBeNull();
    expect(normalizeIp('1.2.3')).toBeNull();
    expect(normalizeIp('2001:db8::1]/x')).toBeNull();
    expect(normalizeIp('')).toBeNull();
  });
});

function source(id: string, format: HttpSource['format'] = { type: 'text' }): HttpSource {
  return {
    kind: 'http',
    id,
    name: id,
    operator: id,
    url: `https://${id}.example/`,
    family: 'v4',
    format,
    providesAsn: false,
    ipDataVendor: false,
    recommended: false,
  };
}

function textResponse(body: string, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => body } as Response;
}

describe('querySource / querySources', () => {
  it('sends no credentials, no referrer and bypasses the HTTP cache', async () => {
    const fetchSpy = vi.fn(async () => textResponse('203.0.113.9'));
    vi.stubGlobal('fetch', fetchSpy);

    await querySource(source('a'));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://a.example/',
      expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }),
    );
  });

  it('fails only the source that times out, is rate-limited or answers garbage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('slow')) {
          return new Promise<Response>((_, reject) =>
            init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
          );
        }
        if (url.includes('limited')) return textResponse('Too Many Requests', 429);
        if (url.includes('garbage')) return textResponse('<html>hello</html>');
        return textResponse('203.0.113.9');
      }),
    );

    const [slow, limited, garbage, good] = await Promise.all([
      querySource(source('slow'), 50),
      querySource(source('limited')),
      querySource(source('garbage')),
      querySource(source('good')),
    ]);

    expect(slow).toEqual({ sourceId: 'slow', status: 'failed', reason: 'timeout' });
    expect(limited).toEqual({ sourceId: 'limited', status: 'failed', reason: 'http 429' });
    expect(garbage).toEqual({ sourceId: 'garbage', status: 'failed', reason: 'bad response' });
    expect(good).toEqual({ sourceId: 'good', status: 'ok', address: '203.0.113.9', family: 'v4' });
  });

  it('never contacts a source that was not passed in', async () => {
    const fetchSpy = vi.fn(async (_url: string) => textResponse('203.0.113.9'));
    vi.stubGlobal('fetch', fetchSpy);

    await querySources([source('a'), source('b')]);

    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual(['https://a.example/', 'https://b.example/']);
  });
});

function ok(sourceId: string, address: string, asn?: string): HttpSourceResult {
  return {
    sourceId,
    status: 'ok',
    address,
    family: address.includes(':') ? 'v6' : 'v4',
    ...(asn && { asn }),
  };
}

function failed(sourceId: string): HttpSourceResult {
  return { sourceId, status: 'failed', reason: 'unreachable' };
}

describe('classifyAgreement', () => {
  it('consistent exit: every source reports the same address', () => {
    const agreement = classifyAgreement(
      [ok('a', '198.51.100.7'), ok('b', '198.51.100.7'), failed('c')],
      'v4',
    );

    expect(agreement).toMatchObject({ status: 'consistent', majority: '198.51.100.7', agreeing: 2, total: 2 });
  });

  it('multiple exits of one network: different addresses, same ASN', () => {
    const agreement = classifyAgreement(
      [ok('a', '198.51.100.7', 'AS64500'), ok('b', '198.51.100.7'), ok('c', '198.51.100.8', 'AS64500')],
      'v4',
    );

    expect(agreement).toMatchObject({ status: 'same-network', agreeing: 2, total: 3, differing: ['c'] });
  });

  it('different networks: addresses with different ASNs', () => {
    const agreement = classifyAgreement(
      [ok('a', '198.51.100.7', 'AS64500'), ok('b', '198.51.100.7'), ok('c', '203.0.113.9', 'AS64501')],
      'v4',
    );

    expect(agreement).toMatchObject({ status: 'different-networks', differing: ['c'] });
  });

  it('differing addresses without ASN are inconclusive, not consistent and not a leak', () => {
    const agreement = classifyAgreement([ok('a', '198.51.100.7'), ok('b', '203.0.113.9')], 'v4');

    expect(agreement).toMatchObject({ status: 'inconclusive', reason: 'no-asn' });
  });

  it('one shared ASN does not prove one network while another address has none', () => {
    const agreement = classifyAgreement(
      [ok('a', '198.51.100.7', 'AS64500'), ok('b', '198.51.100.8', 'AS64500'), ok('c', '203.0.113.9')],
      'v4',
    );

    expect(agreement.status).toBe('inconclusive');
  });

  it('a single successful source is inconclusive', () => {
    expect(classifyAgreement([ok('a', '198.51.100.7'), failed('b')], 'v4')).toMatchObject({
      status: 'inconclusive',
      reason: 'single-source',
      agreeing: 1,
      total: 1,
    });
  });

  it('distinguishes a family nobody saw from every source failing', () => {
    expect(classifyAgreement([ok('a', '198.51.100.7'), ok('b', '198.51.100.7')], 'v6').status).toBe(
      'not-detected',
    );
    expect(classifyAgreement([failed('a'), failed('b')], 'v4').status).toBe('failed');
  });

  it('classifies each family separately', () => {
    const results = [ok('a', '198.51.100.7'), ok('b', '198.51.100.7'), ok('c', '2001:db8::1')];

    expect(classifyAgreement(results, 'v4').status).toBe('consistent');
    expect(classifyAgreement(results, 'v6').status).toBe('inconclusive');
  });
});

describe('observedAddresses', () => {
  it('lists every distinct address any source saw', () => {
    expect(
      observedAddresses([ok('a', '198.51.100.7'), ok('b', '198.51.100.7'), ok('c', '2001:db8::1'), failed('d')]),
    ).toEqual(['198.51.100.7', '2001:db8::1']);
  });
});
