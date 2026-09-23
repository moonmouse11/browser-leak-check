import type { IpLookupResult } from './ip-detection';
import type { WebrtcLeakResult } from './webrtc-leak-detection';
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
  if (!result.leakDetected) return { text: 'no leak detected', variant: 'ok' };
  const count = result.candidates.length;
  return { text: `leak detected (${count} address${count === 1 ? '' : 'es'})`, variant: 'bad' };
}

export function formatSignal<T>(
  signal: FingerprintSignal<T>,
  toText: (value: T) => string = (value) => String(value),
): string {
  return signal.available && signal.value !== null ? toText(signal.value) : 'unavailable';
}
