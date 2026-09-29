import { ALL_SOURCES } from './config';
import type { FamilyAgreement } from './ip-sources';
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

export function sourceName(id: string): string {
  return ALL_SOURCES.find((source) => source.id === id)?.name ?? id;
}

// "AS64500 Example Net GmbH", either half alone, or '' when the service
// reported neither - absent, never guessed.
export function networkOwner(asn?: string, org?: string): string {
  return [asn, org].filter(Boolean).join(' ');
}

// The in-product disclosure: every service the current selection lets
// see the user's IP address, by name, grouped by the check that uses it.
export function disclosureText(selected: Iterable<string>): string {
  const ids = new Set(selected);
  const names = (kind: 'http' | 'stun' | 'dns') =>
    ALL_SOURCES.filter((source) => source.kind === kind && ids.has(source.id)).map((source) => source.name);

  const parts = [
    `ip-echo: ${names('http').join(', ')}`,
    ...(names('stun').length ? [`webrtc: ${names('stun').join(', ')}`] : []),
    ...(names('dns').length ? [`dns: ${names('dns').join(', ')}`] : []),
  ];
  return `these services see your ip address - ${parts.join('; ')}`;
}

export function agreementStatus(agreement: FamilyAgreement): StatusDisplay {
  const { majority, agreeing, total } = agreement;
  const ratio = `${agreeing}/${total} agree`;

  switch (agreement.status) {
    case 'consistent':
      return { text: `${majority} · ${ratio}`, variant: 'ok' };
    case 'same-network':
      return { text: `${majority} · multiple exits, same network (${ratio})`, variant: 'info' };
    case 'different-networks':
      return {
        text: `different networks (${ratio}) · differs: ${agreement.differing.map(sourceName).join(', ')}`,
        variant: 'warn',
      };
    case 'inconclusive':
      return agreement.reason === 'single-source'
        ? { text: `${majority} · only 1 source answered`, variant: 'info' }
        : { text: `${majority} · inconclusive (${ratio}, no asn to compare)`, variant: 'warn' };
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
    case 'webrtc-unresponsive':
      return { text: 'webrtc not responding', variant: 'warn' };
    case 'no-connection':
      return { text: 'no connection (ip-echo unreachable)', variant: 'warn' };
    case 'off':
      return { text: 'off (no stun server selected)', variant: 'info' };
    case 'leak-detected': {
      // Distinct addresses: two STUN servers reporting the same leaked
      // address are one leak, not two.
      const count = new Set(
        result.candidates.filter((candidate) => candidate.leak).map((candidate) => candidate.address),
      ).size;
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
    case 'off':
      return { text: 'off (bash.ws not selected)', variant: 'info' };
  }
}

export function formatSignal<T>(
  signal: FingerprintSignal<T>,
  toText: (value: T) => string = (value) => String(value),
): string {
  return signal.available && signal.value !== null ? toText(signal.value) : 'unavailable';
}
