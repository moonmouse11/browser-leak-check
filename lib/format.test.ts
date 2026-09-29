import { describe, expect, it } from 'vitest';
import { dnsStatus, formatSignal, ipStatus, webrtcStatus } from './format';

describe('ipStatus', () => {
  it('shows the address when detected', () => {
    expect(ipStatus({ status: 'detected', address: '1.2.3.4' })).toEqual({
      text: '1.2.3.4',
      variant: 'info',
    });
  });

  it('distinguishes not detected from a failed lookup', () => {
    expect(ipStatus({ status: 'not-detected' }).variant).toBe('info');
    expect(ipStatus({ status: 'failed' })).toEqual({ text: 'lookup failed', variant: 'warn' });
  });
});

describe('webrtcStatus', () => {
  it('counts only leaking candidates', () => {
    const display = webrtcStatus({
      status: 'leak-detected',
      candidates: [
        { type: 'host', address: '192.168.1.5', leak: true },
        { type: 'srflx', address: '198.51.100.7', leak: false },
      ],
    });

    expect(display).toEqual({ text: 'leak detected (1 address)', variant: 'bad' });
  });

  it('pluralizes the leaking address count', () => {
    const display = webrtcStatus({
      status: 'leak-detected',
      candidates: [
        { type: 'host', address: '192.168.1.5', leak: true },
        { type: 'srflx', address: '203.0.113.9', leak: true },
      ],
    });

    expect(display.text).toBe('leak detected (2 addresses)');
  });

  it('treats disabled webrtc as the protected state', () => {
    expect(webrtcStatus({ status: 'webrtc-disabled', candidates: [] })).toEqual({
      text: 'webrtc disabled',
      variant: 'ok',
    });
  });

  it('warns rather than reassures when there is no connection', () => {
    expect(webrtcStatus({ status: 'no-connection', candidates: [] }).variant).toBe('warn');
  });

  it('reports no leak as ok', () => {
    expect(webrtcStatus({ status: 'no-leak', candidates: [] }).variant).toBe('ok');
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
