import { DNS_SOURCE, HTTP_SOURCE_TIMEOUT_MS, type HttpSource, type StunSource } from '../lib/config';
import { parseResponse } from '../lib/ip-sources';
import { stunBinding } from './stun';

// What a browser would send from an extension page. Node's fetch doesn't
// enforce CORS, so the response header is checked explicitly below.
export const EXTENSION_ORIGIN = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export interface CheckRow {
  kind: 'http' | 'stun' | 'dns';
  id: string;
  // Not in the registry yet - never affects the exit code.
  candidate: boolean;
  status: 'ok' | 'failed' | 'skipped';
  family?: 'v4' | 'v6';
  address?: string;
  asn?: string;
  reason?: string;
}

export interface Connectivity {
  v4: boolean;
  v6: boolean;
}

// The slice of fetch these checks use, so tests can pass a fake.
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

function allowsExtensionOrigin(headers: { get(name: string): string | null }): boolean {
  const allowed = headers.get('access-control-allow-origin')?.trim();
  return allowed === '*' || allowed === EXTENSION_ORIGIN;
}

async function request(fetchImpl: FetchLike, url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { headers: { Origin: EXTENSION_ORIGIN }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function skipReason(family: HttpSource['family'], connectivity: Connectivity): string | null {
  if (family === 'v6' && !connectivity.v6) return 'no ipv6';
  if (family === 'v4' && !connectivity.v4) return 'no ipv4';
  if (family === 'dual' && !connectivity.v4 && !connectivity.v6) return 'offline';
  return null;
}

// ok only if: 2xx in time, CORS allows an extension origin, the
// extension's own parser accepts the body, and an ASN is parsed exactly
// when the registry says the service provides one.
export async function checkHttpSource(
  source: HttpSource,
  options: { fetch: FetchLike; connectivity: Connectivity; candidate?: boolean; timeoutMs?: number },
): Promise<CheckRow> {
  const row: CheckRow = { kind: 'http', id: source.id, candidate: options.candidate ?? false, status: 'failed' };

  const skip = skipReason(source.family, options.connectivity);
  if (skip) return { ...row, status: 'skipped', reason: skip };

  let response;
  try {
    response = await request(options.fetch, source.url, options.timeoutMs ?? HTTP_SOURCE_TIMEOUT_MS);
  } catch (error) {
    return { ...row, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }

  if (!response.ok) return { ...row, reason: `http ${response.status}` };
  if (!allowsExtensionOrigin(response.headers)) return { ...row, reason: 'no cors' };

  let parsed;
  try {
    parsed = parseResponse(source.format, await response.text());
  } catch {
    return { ...row, reason: 'bad response' };
  }

  const result: CheckRow = {
    ...row,
    family: parsed.family,
    address: parsed.address,
    ...(parsed.asn && { asn: parsed.asn }),
  };
  if (Boolean(parsed.asn) !== source.providesAsn) return { ...result, reason: 'asn mismatch' };
  return { ...result, status: 'ok' };
}

// The DNS-leak check starts with GET /id; the rest (probe lookups) can't
// be exercised meaningfully outside a browser.
export async function checkDnsSource(options: { fetch: FetchLike; timeoutMs?: number }): Promise<CheckRow> {
  const row: CheckRow = { kind: 'dns', id: DNS_SOURCE.id, candidate: false, status: 'failed' };
  try {
    const response = await request(options.fetch, `${DNS_SOURCE.url}/id`, options.timeoutMs ?? HTTP_SOURCE_TIMEOUT_MS);
    if (!response.ok) return { ...row, reason: `http ${response.status}` };
    if (!allowsExtensionOrigin(response.headers)) return { ...row, reason: 'no cors' };
    if (!(await response.text()).trim()) return { ...row, reason: 'empty test id' };
    return { ...row, status: 'ok' };
  } catch (error) {
    return { ...row, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

// One row per family the machine has: a server may answer on only one.
export async function checkStunSource(
  source: StunSource,
  options: { connectivity: Connectivity; binding?: typeof stunBinding },
): Promise<CheckRow[]> {
  const binding = options.binding ?? stunBinding;
  const families = (['v4', 'v6'] as const).filter((family) => options.connectivity[family]);
  if (families.length === 0) return [{ kind: 'stun', id: source.id, candidate: false, status: 'skipped', reason: 'offline' }];

  return Promise.all(
    families.map(async (family): Promise<CheckRow> => {
      const row: CheckRow = { kind: 'stun', id: source.id, candidate: false, status: 'failed', family };
      try {
        const mapping = await binding(source.url, family);
        return { ...row, status: 'ok', address: mapping.address };
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // No AAAA (or A) record: the server simply doesn't offer this family.
        if (code === 'ENOTFOUND' || code === 'ENODATA') return { ...row, status: 'skipped', reason: `no ${family} address` };
        return { ...row, reason: error instanceof Error ? error.message : 'error' };
      }
    }),
  );
}

// Literal addresses, so DNS can't mask a missing route.
export async function detectConnectivity(fetchImpl: FetchLike, timeoutMs = 3000): Promise<Connectivity> {
  const probe = async (url: string) => {
    try {
      return (await request(fetchImpl, url, timeoutMs)).ok;
    } catch {
      return false;
    }
  };
  const [v4, v6] = await Promise.all([
    probe('https://1.1.1.1/cdn-cgi/trace'),
    probe('https://[2606:4700:4700::1111]/cdn-cgi/trace'),
  ]);
  return { v4, v6 };
}

// Candidates are informational: only a failed registry source fails the run.
export function exitCode(rows: CheckRow[]): number {
  return rows.some((row) => !row.candidate && row.status === 'failed') ? 1 : 0;
}

export function formatTable(rows: CheckRow[], connectivity: Connectivity): string {
  const header = ['kind', 'source', 'family', 'status', 'address / reason', 'asn'];
  const lines = rows.map((row) => [
    row.kind,
    row.candidate ? `${row.id} (candidate)` : row.id,
    row.family ?? '-',
    row.status,
    [row.address, row.reason].filter(Boolean).join(' - ') || '-',
    row.asn ?? '-',
  ]);
  const widths = header.map((_, column) => Math.max(...[header, ...lines].map((line) => line[column]!.length)));
  const render = (line: string[]) => line.map((cell, column) => cell.padEnd(widths[column]!)).join('  ').trimEnd();

  const failed = rows.filter((row) => row.status === 'failed');
  return [
    `connectivity: ipv4 ${connectivity.v4 ? 'yes' : 'no'}, ipv6 ${connectivity.v6 ? 'yes' : 'no'}`,
    '',
    render(header),
    render(widths.map((width) => '-'.repeat(width))),
    ...lines.map(render),
    '',
    `${rows.length - failed.length}/${rows.length} ok or skipped` +
      (failed.length ? `; failed: ${failed.map((row) => row.id).join(', ')}` : ''),
  ].join('\n');
}
