import { describe, expect, it } from 'vitest';
import type { FamilyAgreement } from './ip-sources';
import { agreementStatus, disclosureText, dnsStatus, formatSignal, networkOwner, webrtcStatus } from './format';

function agreement(overrides: Partial<FamilyAgreement>): FamilyAgreement {
  return {
    family: 'v4',
    status: 'consistent',
    majority: '198.51.100.7',
    agreeing: 4,
    total: 4,
    differing: [],
    ...overrides,
  };
}

describe('agreementStatus', () => {
  it('shows the address and how many sources agree', () => {
    expect(agreementStatus(agreement({ agreeing: 14, total: 15, status: 'same-network' }))).toEqual({
      text: '198.51.100.7 · multiple exits, same network (14/15 agree)',
      variant: 'info',
    });
    expect(agreementStatus(agreement({}))).toEqual({ text: '198.51.100.7 · 4/4 agree', variant: 'ok' });
  });

  it('warns about different networks and names the differing sources', () => {
    const display = agreementStatus(
      agreement({ status: 'different-networks', agreeing: 3, differing: ['ipinfo'] }),
    );

    expect(display).toEqual({
      text: 'different networks (3/4 agree) · differs: ipinfo.io',
      variant: 'warn',
    });
  });

  it('keeps a lone source apart from differing addresses without asn', () => {
    expect(
      agreementStatus(agreement({ status: 'inconclusive', reason: 'single-source', agreeing: 1, total: 1 })),
    ).toEqual({ text: '198.51.100.7 · only 1 source answered', variant: 'info' });
    expect(agreementStatus(agreement({ status: 'inconclusive', reason: 'no-asn', agreeing: 1, total: 2 })).variant).toBe(
      'warn',
    );
  });

  it('distinguishes not detected from a failed lookup', () => {
    expect(agreementStatus(agreement({ status: 'not-detected' }))).toEqual({ text: 'not detected', variant: 'info' });
    expect(agreementStatus(agreement({ status: 'failed' }))).toEqual({ text: 'lookup failed', variant: 'warn' });
  });
});

describe('disclosureText', () => {
  it('names every selected service, grouped by check, and nothing unselected', () => {
    expect(disclosureText(['ipify', 'ident-me', 'stun-google', 'bash-ws'])).toBe(
      'these services see your ip address - ip-echo: ipify, ident.me; webrtc: Google STUN; dns: bash.ws DNS leak test',
    );
    expect(disclosureText(['ipify', 'ident-me'])).toBe('these services see your ip address - ip-echo: ipify, ident.me');
  });
});

describe('networkOwner', () => {
  it('joins what the service reported and stays empty otherwise', () => {
    expect(networkOwner('AS64500', 'Example Net GmbH')).toBe('AS64500 Example Net GmbH');
    expect(networkOwner(undefined, 'Example Net GmbH')).toBe('Example Net GmbH');
    expect(networkOwner()).toBe('');
  });
});

describe('webrtcStatus', () => {
  it('counts only leaking candidates', () => {
    const display = webrtcStatus({
      status: 'leak-detected',
      candidates: [
        { type: 'host', address: '192.168.1.5', leak: true },
        { type: 'srflx', address: '198.51.100.7', leak: false, serverId: 'stun-google' },
      ],
      servers: [],
    });

    expect(display).toEqual({ text: 'leak detected (1 address)', variant: 'bad' });
  });

  it('pluralizes the leaking address count', () => {
    const display = webrtcStatus({
      status: 'leak-detected',
      candidates: [
        { type: 'host', address: '192.168.1.5', leak: true },
        { type: 'srflx', address: '203.0.113.9', leak: true, serverId: 'stun-google' },
        // Same leaked address from a second server: still one address.
        { type: 'srflx', address: '203.0.113.9', leak: true, serverId: 'stun-cloudflare' },
      ],
      servers: [],
    });

    expect(display.text).toBe('leak detected (2 addresses)');
  });

  it('treats disabled webrtc as the protected state', () => {
    expect(webrtcStatus({ status: 'webrtc-disabled', candidates: [], servers: [] })).toEqual({
      text: 'webrtc disabled',
      variant: 'ok',
    });
  });

  it('does not present an unresponsive webrtc as the protected state', () => {
    expect(webrtcStatus({ status: 'webrtc-unresponsive', candidates: [], servers: [] })).toEqual({
      text: 'webrtc not responding',
      variant: 'warn',
    });
  });

  it('warns rather than reassures when there is no connection', () => {
    expect(webrtcStatus({ status: 'no-connection', candidates: [], servers: [] }).variant).toBe('warn');
  });

  it('shows a deselected check as off, not as no leak', () => {
    expect(webrtcStatus({ status: 'off', candidates: [], servers: [] })).toEqual({
      text: 'off (no stun server selected)',
      variant: 'info',
    });
    expect(dnsStatus({ status: 'off', resolvers: [] }).text).toBe('off (bash.ws not selected)');
  });

  it('reports no leak as ok', () => {
    expect(webrtcStatus({ status: 'no-leak', candidates: [], servers: [] }).variant).toBe('ok');
  });
});

describe('dnsStatus', () => {
  it('counts resolvers on a leak', () => {
    const display = dnsStatus({
      status: 'leak-detected',
      resolvers: [{ ip: '109.195.129.5', countryName: '', asn: '' }],
    });

    expect(display).toEqual({ text: 'leak detected (1 resolver)', variant: 'bad' });
  });

  it('keeps inconclusive and failed apart', () => {
    expect(dnsStatus({ status: 'unknown', resolvers: [] }).text).toBe('inconclusive');
    expect(dnsStatus({ status: 'failed', resolvers: [] }).text).toBe('check failed');
  });
});

describe('formatSignal', () => {
  it('formats an available value with the given converter', () => {
    expect(formatSignal({ value: ['en', 'ru'], available: true }, (v) => v.join(', '))).toBe(
      'en, ru',
    );
  });

  it('shows unavailable for a blocked signal', () => {
    expect(formatSignal({ value: null, available: false })).toBe('unavailable');
  });
});
