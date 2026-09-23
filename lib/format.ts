import type { IpLookupResult } from './ip-detection';
import type { FingerprintSignal } from './fingerprint-surface';

export function formatIpResult(result: IpLookupResult): string {
  switch (result.status) {
    case 'detected':
      return result.address;
    case 'not-detected':
      return 'Not detected';
    case 'failed':
      return 'Lookup failed';
  }
}

export function formatSignal<T>(
  signal: FingerprintSignal<T>,
  toText: (value: T) => string = (value) => String(value),
): string {
  return signal.available && signal.value !== null ? toText(signal.value) : 'Unavailable';
}
