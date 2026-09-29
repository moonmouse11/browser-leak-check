import { describe, expect, it, vi } from 'vitest';
import { HTTP_SOURCES, STUN_SOURCES, type HttpSource } from '../lib/config';
import { RESPONSE_SAMPLES } from '../lib/ip-sources.samples';
import { CANDIDATE_SOURCES } from './candidates';
import {
  EXTENSION_ORIGIN,
  checkDnsSource,
  checkHttpSource,
  checkStunSource,
  exitCode,
  formatTable,
  type CheckRow,
  type FetchLike,
} from './source-checks';

const BOTH = { v4: true, v6: true };
const ipify = HTTP_SOURCES.find((source) => source.id === 'ipify')!;
const identMe = HTTP_SOURCES.find((source) => source.id === 'ident-me')!;

function fakeFetch(body: string, { status = 200, cors = '*' as string | null } = {}) {
  return vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name === 'access-control-allow-origin' ? cors : null) },
    text: async () => body,
  }));
}

describe('checkHttpSource', () => {
  it('is ok for a CORS-enabled service whose body the extension parses', async () => {
    const fetch = fakeFetch(RESPONSE_SAMPLES['ident-me']!);

    const row = await checkHttpSource(identMe, { fetch, connectivity: BOTH });

    expect(row).toEqual({
      kind: 'http',
      id: 'ident-me',
      candidate: false,
      status: 'ok',
      family: 'v4',
      address: '198.51.100.7',
      asn: 'AS64500',
    });
    expect(fetch.mock.calls[0]![1].headers).toEqual({ Origin: EXTENSION_ORIGIN });
  });

  it('accepts a reflected extension origin as well as *', async () => {
    const row = await checkHttpSource(ipify, {
      fetch: fakeFetch(RESPONSE_SAMPLES.ipify!, { cors: EXTENSION_ORIGIN }),
      connectivity: BOTH,
    });

    expect(row.status).toBe('ok');
  });

  it('fails without CORS even when the body parses', async () => {
    const row = await checkHttpSource(ipify, {
      fetch: fakeFetch(RESPONSE_SAMPLES.ipify!, { cors: null }),
      connectivity: BOTH,
    });

    expect(row).toMatchObject({ status: 'failed', reason: 'no cors' });
  });

  it('fails on a rate limit and on a changed format', async () => {
    expect(
      await checkHttpSource(ipify, { fetch: fakeFetch('slow down', { status: 429 }), connectivity: BOTH }),
    ).toMatchObject({ status: 'failed', reason: 'http 429' });
    expect(
      await checkHttpSource(ipify, { fetch: fakeFetch('{"address":"198.51.100.7"}'), connectivity: BOTH }),
    ).toMatchObject({ status: 'failed', reason: 'bad response' });
  });

  it('fails when the ASN label no longer matches what the parser reads', async () => {
    const lostAsn: HttpSource = { ...identMe, format: { type: 'json', ip: 'ip' } };

    const row = await checkHttpSource(lostAsn, { fetch: fakeFetch(RESPONSE_SAMPLES['ident-me']!), connectivity: BOTH });

    expect(row).toMatchObject({ status: 'failed', reason: 'asn mismatch' });
  });

  it('times out like the extension does', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))),
      );

    expect(await checkHttpSource(ipify, { fetch: hang, connectivity: BOTH, timeoutMs: 20 })).toMatchObject({
      status: 'failed',
      reason: 'timeout',
    });
  });

  it('skips an IPv6-only source on a machine without IPv6, without contacting it', async () => {
    const fetch = fakeFetch('2001:db8::1');

    const row = await checkHttpSource(CANDIDATE_SOURCES[0]!, {
      fetch,
      connectivity: { v4: true, v6: false },
      candidate: true,
    });

    expect(row).toEqual({ kind: 'http', id: 'ipify-v6', candidate: true, status: 'skipped', reason: 'no ipv6' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('checkDnsSource', () => {
  it('needs a non-empty test id served with CORS', async () => {
    expect((await checkDnsSource({ fetch: fakeFetch('abc123\n') })).status).toBe('ok');
    expect(await checkDnsSource({ fetch: fakeFetch('abc123', { cors: null }) })).toMatchObject({ reason: 'no cors' });
    expect(await checkDnsSource({ fetch: fakeFetch('  ') })).toMatchObject({ reason: 'empty test id' });
  });
});

describe('checkStunSource', () => {
  it('checks each family the machine has and reports a silent server', async () => {
    const binding = vi.fn(async (_url: string, family: 'v4' | 'v6') => {
      if (family === 'v6') throw new Error('no response');
      return { address: '198.51.100.7', port: 1, family };
    });

    const rows = await checkStunSource(STUN_SOURCES[0]!, { connectivity: BOTH, binding });

    expect(rows).toEqual([
      { kind: 'stun', id: 'stun-google', candidate: false, status: 'ok', family: 'v4', address: '198.51.100.7' },
      { kind: 'stun', id: 'stun-google', candidate: false, status: 'failed', family: 'v6', reason: 'no response' },
    ]);
  });

  it('skips a family the server has no DNS record for', async () => {
    const binding = vi.fn(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    });

    const [row] = await checkStunSource(STUN_SOURCES[0]!, { connectivity: { v4: false, v6: true }, binding });

    expect(row).toMatchObject({ status: 'skipped', reason: 'no v6 address' });
  });
});

describe('exitCode', () => {
  const row = (overrides: Partial<CheckRow>): CheckRow => ({
    kind: 'http',
    id: 'x',
    candidate: false,
    status: 'ok',
    ...overrides,
  });

  it('is 1 when a registry source failed', () => {
    expect(exitCode([row({}), row({ status: 'failed' })])).toBe(1);
  });

  it('ignores failed candidates and skipped rows', () => {
    expect(exitCode([row({}), row({ status: 'skipped' }), row({ status: 'failed', candidate: true })])).toBe(0);
  });
});

describe('formatTable', () => {
  it('labels candidates and lists failures in the summary', () => {
    const table = formatTable(
      [
        { kind: 'http', id: 'ipify', candidate: false, status: 'ok', family: 'v4', address: '198.51.100.7' },
        { kind: 'stun', id: 'stun-openrelay', candidate: false, status: 'failed', family: 'v4', reason: 'no response' },
        { kind: 'http', id: 'ipify-v6', candidate: true, status: 'skipped', reason: 'no ipv6' },
      ],
      { v4: true, v6: false },
    );

    expect(table).toContain('connectivity: ipv4 yes, ipv6 no');
    expect(table).toContain('ipify-v6 (candidate)');
    expect(table).toContain('2/3 ok or skipped; failed: stun-openrelay');
  });
});
