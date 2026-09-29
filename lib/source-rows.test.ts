import { describe, expect, it } from 'vitest';
import type { CheckResults } from './checks';
import { sourceRows } from './source-rows';

function results(overrides: Partial<CheckResults>): CheckResults {
  return {
    checkedAt: 0,
    selected: [],
    http: [],
    webrtc: { status: 'off', candidates: [], servers: [] },
    dns: { status: 'off', resolvers: [] },
    ...overrides,
  };
}

describe('sourceRows', () => {
  it('lists every http source, failed ones included, with only the owner it reported', () => {
    const rows = sourceRows(
      results({
        http: [
          { sourceId: 'ipify', status: 'ok', address: '198.51.100.7', family: 'v4' },
          { sourceId: 'ident-me', status: 'ok', address: '198.51.100.7', family: 'v4', asn: 'AS64500', org: 'Example' },
          { sourceId: 'ipinfo', status: 'ok', address: '203.0.113.9', family: 'v4', asn: 'AS64501' },
          { sourceId: 'geojs', status: 'failed', reason: 'http 429' },
        ],
      }),
    );

    expect(rows).toEqual([
      { sourceId: 'ipify', name: 'ipify', kind: 'http', state: 'ok', address: '198.51.100.7', owner: '', match: 'yes' },
      {
        sourceId: 'ident-me',
        name: 'ident.me',
        kind: 'http',
        state: 'ok',
        address: '198.51.100.7',
        owner: 'AS64500 Example',
        match: 'yes',
      },
      {
        sourceId: 'ipinfo',
        name: 'ipinfo.io',
        kind: 'http',
        state: 'ok',
        address: '203.0.113.9',
        owner: 'AS64501',
        match: 'no',
      },
      { sourceId: 'geojs', name: 'GeoJS', kind: 'http', state: 'failed', address: 'failed (http 429)', owner: '', match: '' },
    ]);
  });

  it('adds one row per selected stun server, compared with the http majority', () => {
    const rows = sourceRows(
      results({
        http: [
          { sourceId: 'ipify', status: 'ok', address: '198.51.100.7', family: 'v4' },
          { sourceId: 'icanhazip', status: 'ok', address: '198.51.100.7', family: 'v4' },
        ],
        webrtc: {
          status: 'leak-detected',
          candidates: [],
          servers: [
            { serverId: 'stun-google', status: 'ok', addresses: ['198.51.100.7'] },
            { serverId: 'stun-cloudflare', status: 'ok', addresses: ['203.0.113.9'] },
            { serverId: 'stun-nextcloud', status: 'no-response', addresses: [] },
          ],
        },
      }),
    );

    expect(rows.filter((row) => row.kind === 'stun').map(({ name, address, match }) => ({ name, address, match }))).toEqual([
      { name: 'Google STUN', address: '198.51.100.7', match: 'yes' },
      { name: 'Cloudflare STUN', address: '203.0.113.9', match: 'no' },
      { name: 'Nextcloud STUN', address: 'no response', match: '' },
    ]);
  });
});
