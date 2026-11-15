import { HTTP_SOURCE_TIMEOUT_MS, RDAP_SOURCE } from './config';

// Whois via public RDAP: rdap.org 302-redirects to the responsible RIR's
// server (fetch follows it), so one bootstrap URL covers every RIR.
// Only the network name, range and country are read - no contact entities.

export interface WhoisEntry {
  ip: string;
  // 'no-record': the RIR answered 404 - the address is unallocated or
  // bogon, which is an answer, not a lookup failure (see the ip-whois spec).
  status: 'ok' | 'failed' | 'no-record';
  name?: string;
  range?: string;
  country?: string;
  reason?: string;
}

export interface WhoisResult {
  status: 'done';
  entries: WhoisEntry[];
}

interface RdapRecord {
  name?: unknown;
  handle?: unknown;
  country?: unknown;
  startAddress?: unknown;
  endAddress?: unknown;
}

function parseRdap(ip: string, data: RdapRecord): WhoisEntry {
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : undefined;
  const range =
    typeof data.startAddress === 'string' && typeof data.endAddress === 'string'
      ? `${data.startAddress} - ${data.endAddress}`
      : typeof data.handle === 'string'
        ? data.handle
        : undefined;
  const country = typeof data.country === 'string' && data.country.trim() ? data.country.trim() : undefined;

  if (!name && !range && !country) return { ip, status: 'failed', reason: 'empty record' };
  return { ip, status: 'ok', ...(name && { name }), ...(range && { range }), ...(country && { country }) };
}

async function lookup(ip: string, timeoutMs: number): Promise<WhoisEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${RDAP_SOURCE.url}/ip/${encodeURIComponent(ip)}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 404) return { ip, status: 'no-record' };
    if (!response.ok) return { ip, status: 'failed', reason: `http ${response.status}` };
    return parseRdap(ip, (await response.json()) as RdapRecord);
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { ip, status: 'failed', reason };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupWhois(
  ips: string[] | Promise<string[]>,
  { timeoutMs = HTTP_SOURCE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<WhoisResult> {
  const unique = [...new Set(await Promise.resolve(ips).catch(() => [] as string[]))];
  const entries = await Promise.all(unique.map((ip) => lookup(ip, timeoutMs)));
  return { status: 'done', entries };
}
