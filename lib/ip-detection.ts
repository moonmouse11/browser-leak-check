import { IP_ECHO_ENDPOINTS } from './config';

export type IpLookupResult =
  | { status: 'detected'; address: string }
  | { status: 'not-detected' }
  | { status: 'failed' };

export interface IpDetectionResult {
  v4: IpLookupResult;
  v6: IpLookupResult;
}

async function fetchIp(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IP-echo request failed: ${response.status}`);
  const data: { ip: string } = await response.json();
  return data.ip;
}

export async function detectPublicIp(): Promise<IpDetectionResult> {
  const [v4, v6] = await Promise.allSettled([
    fetchIp(IP_ECHO_ENDPOINTS.v4),
    fetchIp(IP_ECHO_ENDPOINTS.v6),
  ]);

  // A protocol that fails while the other succeeds means that protocol has
  // no route (e.g. no IPv6 on this network) - "not detected", not a lookup
  // failure. Only when both fail do we know the IP-echo service itself is
  // unreachable, which is reported as "failed" for both.
  const bothFailed = v4.status === 'rejected' && v6.status === 'rejected';

  return {
    v4: toLookupResult(v4, bothFailed),
    v6: toLookupResult(v6, bothFailed),
  };
}

function toLookupResult(
  outcome: PromiseSettledResult<string>,
  bothFailed: boolean,
): IpLookupResult {
  if (outcome.status === 'fulfilled') {
    return { status: 'detected', address: outcome.value };
  }
  return { status: bothFailed ? 'failed' : 'not-detected' };
}
