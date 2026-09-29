import { HTTP_SOURCE_TIMEOUT_MS, type HttpSource, type ResponseFormat } from './config';

export type IpFamily = 'v4' | 'v6';

export interface ParsedIp {
  address: string;
  family: IpFamily;
  asn?: string;
  org?: string;
}

export type HttpSourceResult =
  | ({ sourceId: string; status: 'ok' } & ParsedIp)
  | { sourceId: string; status: 'failed'; reason: string };

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

// Returns the address in canonical form (IPv6 lowercased and compressed by
// the URL parser, so two services spelling one address differently still
// compare equal), or null when the text isn't a bare IP literal - service
// bodies are untrusted and end up in the UI.
export function normalizeIp(text: string): { address: string; family: IpFamily } | null {
  const candidate = text.trim();
  if (IPV4.test(candidate)) return { address: candidate, family: 'v4' };
  if (!/^[0-9a-fA-F:.]+$/.test(candidate) || !candidate.includes(':')) return null;
  try {
    const host = new URL(`http://[${candidate}]/`).hostname;
    return { address: host.slice(1, -1), family: 'v6' };
  } catch {
    return null;
  }
}

function readPath(data: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined,
      data,
    );
}

// Services report ASNs as 203446, "203446", "AS203446" or
// "AS203446 SMARTNET Germany GmbH" - all normalized to "AS203446".
function normalizeAsn(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return `AS${value}`;
  if (typeof value !== 'string') return undefined;
  const match = /^\s*(?:AS)?(\d+)\b/i.exec(value);
  return match ? `AS${match[1]}` : undefined;
}

function normalizeOrg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const org = value.replace(/^\s*AS\d+\s*/i, '').trim().slice(0, 100);
  return org || undefined;
}

export class ResponseParseError extends Error {}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new ResponseParseError('response is not JSON');
  }
}

export function parseResponse(format: ResponseFormat, body: string): ParsedIp {
  let raw: unknown;
  let asn: string | undefined;
  let org: string | undefined;

  switch (format.type) {
    case 'text':
      raw = body;
      break;
    case 'cf-trace':
      raw = body
        .split('\n')
        .find((line) => line.startsWith('ip='))
        ?.slice(3);
      break;
    case 'json': {
      const data = parseJson(body);
      raw = readPath(data, format.ip);
      if (format.asn) asn = normalizeAsn(readPath(data, format.asn));
      if (format.org) org = normalizeOrg(readPath(data, format.org));
      break;
    }
  }

  const ip = typeof raw === 'string' ? normalizeIp(raw) : null;
  if (!ip) throw new ResponseParseError('response has no IP address');
  return { ...ip, ...(asn && { asn }), ...(org && { org }) };
}

// Never rejects: every failure mode (network error, timeout, non-2xx such
// as a 429 rate limit, unparseable body) becomes a `failed` result for this
// source alone.
export async function querySource(
  source: HttpSource,
  timeoutMs = HTTP_SOURCE_TIMEOUT_MS,
): Promise<HttpSourceResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // credentials: services' cookies would turn repeated checks into a
    // tracking history. cache: an answer cached on a previous network (say,
    // before the VPN connected) must never be shown as current.
    const response = await fetch(source.url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { sourceId: source.id, status: 'failed', reason: `http ${response.status}` };

    return { sourceId: source.id, status: 'ok', ...parseResponse(source.format, await response.text()) };
  } catch (error) {
    const reason = controller.signal.aborted
      ? 'timeout'
      : error instanceof ResponseParseError
        ? 'bad response'
        : 'unreachable';
    return { sourceId: source.id, status: 'failed', reason };
  } finally {
    clearTimeout(timer);
  }
}

export function querySources(sources: HttpSource[]): Promise<HttpSourceResult[]> {
  return Promise.all(sources.map((source) => querySource(source)));
}

// Every address any HTTP source observed - what WebRTC reflexive addresses
// are expected to match when nothing routes around the VPN.
export function observedAddresses(results: HttpSourceResult[]): string[] {
  return [...new Set(results.flatMap((result) => (result.status === 'ok' ? [result.address] : [])))];
}

// The ASN belongs to the address, not to the service that happened to
// report it: if any source reported an ASN for an address, every source
// that saw that address is attributed to that network.
export function asnByAddress(results: HttpSourceResult[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const result of results) {
    if (result.status === 'ok' && result.asn && !map.has(result.address)) {
      map.set(result.address, result.asn);
    }
  }
  return map;
}

// - consistent / same-network / different-networks / inconclusive: the
//   four outcomes from the ip-source-comparison spec, for a family with at
//   least one successful source.
// - not-detected: no source saw this family, but others succeeded (e.g. no
//   IPv6 route) - not a failure.
// - failed: no source succeeded at all.
export type AgreementStatus =
  | 'consistent'
  | 'same-network'
  | 'different-networks'
  | 'inconclusive'
  | 'not-detected'
  | 'failed';

export interface FamilyAgreement {
  family: IpFamily;
  status: AgreementStatus;
  // Why an 'inconclusive' result is inconclusive.
  reason?: 'single-source' | 'no-asn';
  majority?: string;
  // Sources reporting the majority address, out of `total` successful
  // sources for this family.
  agreeing: number;
  total: number;
  // Ids of successful sources that reported something other than the
  // majority address.
  differing: string[];
}

export function classifyAgreement(results: HttpSourceResult[], family: IpFamily): FamilyAgreement {
  const successes = results.filter(
    (result): result is Extract<HttpSourceResult, { status: 'ok' }> =>
      result.status === 'ok' && result.family === family,
  );

  if (successes.length === 0) {
    const anySuccess = results.some((result) => result.status === 'ok');
    return { family, status: anySuccess ? 'not-detected' : 'failed', agreeing: 0, total: 0, differing: [] };
  }

  // Ties go to the address seen first, i.e. by the earlier registry entry.
  const counts = new Map<string, number>();
  for (const result of successes) counts.set(result.address, (counts.get(result.address) ?? 0) + 1);
  const [majority, agreeing] = [...counts].reduce((best, entry) => (entry[1] > best[1] ? entry : best));

  const base = {
    family,
    majority,
    agreeing,
    total: successes.length,
    differing: successes.filter((result) => result.address !== majority).map((result) => result.sourceId),
  };

  if (successes.length < 2) return { ...base, status: 'inconclusive', reason: 'single-source' };
  if (counts.size === 1) return { ...base, status: 'consistent' };

  const asns = asnByAddress(successes);
  const knownAsns = new Set([...counts.keys()].flatMap((address) => asns.get(address) ?? []));
  const everyAddressHasAsn = [...counts.keys()].every((address) => asns.has(address));

  // Two different ASNs prove two networks even if some address lacks one;
  // a single shared ASN only proves "one network" if every address has it.
  if (knownAsns.size > 1) return { ...base, status: 'different-networks' };
  if (knownAsns.size === 1 && everyAddressHasAsn) return { ...base, status: 'same-network' };
  return { ...base, status: 'inconclusive', reason: 'no-asn' };
}
