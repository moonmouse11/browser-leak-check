import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectedAddresses, detectPublicIp } from './ip-detection';

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function mockFetch(impl: (url: string) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectPublicIp', () => {
  it('reports IPv6 as not-detected when only the IPv4 lookup resolves', async () => {
    mockFetch((url) =>
      url.includes('api6')
        ? Promise.reject(new Error('no route'))
        : Promise.resolve(jsonResponse({ ip: '1.2.3.4' })),
    );

    const result = await detectPublicIp();

    expect(result.v4).toEqual({ status: 'detected', address: '1.2.3.4' });
    expect(result.v6).toEqual({ status: 'not-detected' });
  });

  it('detects both addresses when both protocols resolve', async () => {
    mockFetch((url) =>
      Promise.resolve(jsonResponse({ ip: url.includes('api6') ? '::1' : '1.2.3.4' })),
    );

    const result = await detectPublicIp();

    expect(result.v4).toEqual({ status: 'detected', address: '1.2.3.4' });
    expect(result.v6).toEqual({ status: 'detected', address: '::1' });
  });

  it('reports both as failed, not not-detected, when the IP-echo service is unreachable', async () => {
    mockFetch(() => Promise.reject(new Error('service down')));

    const result = await detectPublicIp();

    expect(result.v4).toEqual({ status: 'failed' });
    expect(result.v6).toEqual({ status: 'failed' });
  });
});

describe('detectedAddresses', () => {
  it('returns only the addresses that were actually detected', () => {
    expect(
      detectedAddresses({
        v4: { status: 'detected', address: '1.2.3.4' },
        v6: { status: 'not-detected' },
      }),
    ).toEqual(['1.2.3.4']);
  });
});
