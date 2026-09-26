import {
  DNS_LEAK_BASE_URL,
  DNS_LEAK_PROBE_COUNT,
  DNS_LEAK_PROBE_TIMEOUT_MS,
  DNS_LEAK_RESULT_DELAY_MS,
} from './config';

export interface DnsResolver {
  ip: string;
  countryName: string;
  asn: string;
}

export type DnsLeakStatus = 'no-leak' | 'leak-detected' | 'unknown' | 'failed';

export interface DnsLeakResult {
  status: DnsLeakStatus;
  resolvers: DnsResolver[];
}

// bash.ws's raw result shape: a flat array where `type` discriminates
// between its own detected IP, a DNS resolver, and the conclusion. The
// conclusion's human-readable text lives in `ip`, not a `message` field -
// that's bash.ws's API shape, not a mistake on our side.
interface BashWsEntry {
  type: 'ip' | 'dns' | 'conclusion' | string;
  ip: string;
  country: string;
  country_name: string;
  asn: string;
  org: string;
}

async function fetchSessionId(): Promise<string> {
  const response = await fetch(`${DNS_LEAK_BASE_URL}/id`);
  if (!response.ok) throw new Error(`bash.ws id request failed: ${response.status}`);

  const id = (await response.text()).trim();
  if (!id) throw new Error('bash.ws returned an empty test id');
  return id;
}

// Fire-and-forget on purpose: every probe's connection is expected to fail
// (the TLS certificate doesn't cover probe subdomains), but the DNS lookup
// bash.ws needs has already happened by the time that failure arrives, so
// the caller never needs to wait for or inspect these results.
function fireProbes(id: string, count: number): void {
  for (let i = 1; i <= count; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DNS_LEAK_PROBE_TIMEOUT_MS);

    fetch(`https://${i}.${id}.bash.ws`, { mode: 'no-cors', signal: controller.signal })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResults(id: string): Promise<BashWsEntry[]> {
  const response = await fetch(`${DNS_LEAK_BASE_URL}/dnsleak/test/${id}?json`);
  if (!response.ok) throw new Error(`bash.ws results request failed: ${response.status}`);
  return response.json();
}

// bash.ws exposes no boolean/enum leak field, only free text. These rules
// mirror the official dnsleaktest.sh CLI's own classification exactly, so
// we inherit its behavior instead of inventing a second, divergent one.
function classifyConclusion(text: string): DnsLeakStatus {
  if (/not leaking|no leak/i.test(text)) return 'no-leak';
  if (/may be leaking|leak detected/i.test(text)) return 'leak-detected';
  return 'unknown';
}

export async function detectDnsLeak(): Promise<DnsLeakResult> {
  try {
    const id = await fetchSessionId();
    fireProbes(id, DNS_LEAK_PROBE_COUNT);
    await delay(DNS_LEAK_RESULT_DELAY_MS);
    const entries = await fetchResults(id);

    const resolvers: DnsResolver[] = entries
      .filter((entry) => entry.type === 'dns')
      .map((entry) => ({ ip: entry.ip, countryName: entry.country_name, asn: entry.asn }));

    const conclusion = entries.find((entry) => entry.type === 'conclusion');
    const status = conclusion ? classifyConclusion(conclusion.ip) : 'unknown';

    return { status, resolvers };
  } catch {
    return { status: 'failed', resolvers: [] };
  }
}
