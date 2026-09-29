import {
  HTTP_SOURCE_TIMEOUT_MS,
  DNS_SOURCE,
  DNS_LEAK_PROBE_COUNT,
  DNS_LEAK_PROBE_TIMEOUT_MS,
  DNS_LEAK_RESULT_DELAY_MS,
} from './config';

export interface DnsResolver {
  ip: string;
  countryName: string;
  asn: string;
}

// 'off': the user's source selection excludes bash.ws, so the check never ran.
export type DnsLeakStatus = 'no-leak' | 'leak-detected' | 'unknown' | 'failed' | 'off';

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

const PROBE_DOMAIN = new URL(DNS_SOURCE.url).host;

// Runs a request and reads its body within timeoutMs, or rejects: a
// bash.ws that accepts the connection but never answers must end up as
// "failed", not hold up every page that waits for this check.
async function bounded<T>(timeoutMs: number, request: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(new Error('bash.ws request timed out')));
  });
  try {
    return await Promise.race([request(controller.signal), aborted]);
  } finally {
    clearTimeout(timer);
  }
}

function fetchSessionId(timeoutMs: number): Promise<string> {
  return bounded(timeoutMs, async (signal) => {
    const response = await fetch(`${DNS_SOURCE.url}/id`, { signal });
    if (!response.ok) throw new Error(`bash.ws id request failed: ${response.status}`);

    const id = (await response.text()).trim();
    if (!id) throw new Error('bash.ws returned an empty test id');
    return id;
  });
}

// Every probe's connection is expected to fail (the TLS certificate doesn't
// cover probe subdomains), but the DNS lookup bash.ws needs has already
// happened by the time that failure arrives. So a settled probe means its
// lookup is done - the returned promise resolves once all of them have
// settled (each bounded by DNS_LEAK_PROBE_TIMEOUT_MS), and never rejects.
async function fireProbes(id: string, count: number): Promise<void> {
  const probes = Array.from({ length: count }, (_, index) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DNS_LEAK_PROBE_TIMEOUT_MS);

    return fetch(`https://${index + 1}.${id}.${PROBE_DOMAIN}`, {
      mode: 'no-cors',
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  });

  await Promise.all(probes);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchResults(id: string, timeoutMs: number): Promise<BashWsEntry[]> {
  return bounded(timeoutMs, async (signal) => {
    const response = await fetch(`${DNS_SOURCE.url}/dnsleak/test/${id}?json`, { signal });
    if (!response.ok) throw new Error(`bash.ws results request failed: ${response.status}`);
    return response.json();
  });
}

// bash.ws exposes no boolean/enum leak field, only free text. These rules
// mirror the official dnsleaktest.sh CLI's own classification exactly, so
// we inherit its behavior instead of inventing a second, divergent one.
function classifyConclusion(text: string): DnsLeakStatus {
  if (/not leaking|no leak/i.test(text)) return 'no-leak';
  if (/may be leaking|leak detected/i.test(text)) return 'leak-detected';
  return 'unknown';
}

export async function detectDnsLeak({
  timeoutMs = HTTP_SOURCE_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<DnsLeakResult> {
  try {
    const id = await fetchSessionId(timeoutMs);
    await fireProbes(id, DNS_LEAK_PROBE_COUNT);
    await delay(DNS_LEAK_RESULT_DELAY_MS);
    const entries = await fetchResults(id, timeoutMs);

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
