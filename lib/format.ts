import type { IpLookupResult } from './ip-detection';
import type { WebrtcLeakResult } from './webrtc-leak-detection';
import type { DnsLeakResult } from './dns-leak-detection';
import type { FingerprintSignal } from './fingerprint-surface';

// Matches the `data-variant` values `.lc-badge` understands in
// assets/theme.css - the badge's color and label text are both driven
// purely by this attribute, so nothing else needs to map it to a label.
export type StatusVariant = 'pending' | 'info' | 'ok' | 'warn' | 'bad';

export interface StatusDisplay {
  text: string;
  variant: StatusVariant;
}

export function ipStatus(result: IpLookupResult): StatusDisplay {
  switch (result.status) {
    case 'detected':
      return { text: result.address, variant: 'info' };
    case 'not-detected':
      return { text: 'not detected', variant: 'info' };
    case 'failed':
      return { text: 'lookup failed', variant: 'warn' };
  }
}

export function webrtcStatus(result: WebrtcLeakResult): StatusDisplay {
  switch (result.status) {
    case 'no-leak':
      return { text: 'no leak detected', variant: 'ok' };
    case 'webrtc-disabled':
      return { text: 'webrtc disabled', variant: 'ok' };
    case 'no-connection':
      return { text: 'no connection (ip-echo unreachable)', variant: 'warn' };
    case 'leak-detected': {
      const count = result.candidates.filter((candidate) => candidate.leak).length;
      return {
        text: `leak detected (${count} address${count === 1 ? '' : 'es'})`,
        variant: 'bad',
      };
    }
  }
}

export function dnsStatus(result: DnsLeakResult): StatusDisplay {
  switch (result.status) {
    case 'no-leak':
      return { text: 'no leak detected', variant: 'ok' };
    case 'leak-detected': {
      const count = result.resolvers.length;
      return {
        text: `leak detected (${count} resolver${count === 1 ? '' : 's'})`,
        variant: 'bad',
      };
    }
    case 'unknown':
      return { text: 'inconclusive', variant: 'warn' };
    case 'failed':
      return { text: 'check failed', variant: 'warn' };
  }
}

export function formatSignal<T>(
  signal: FingerprintSignal<T>,
  toText: (value: T) => string = (value) => String(value),
): string {
  return signal.available && signal.value !== null ? toText(signal.value) : 'unavailable';
}
