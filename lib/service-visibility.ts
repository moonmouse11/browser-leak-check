import { HTTP_SOURCE_TIMEOUT_MS, type TraceSource } from './config';
import { parseTrace, type TraceInfo } from './ip-sources';

// Service visibility: which egress IP a specific service (Claude, ChatGPT,
// Cloudflare) sees, via its own Cloudflare trace endpoint. A service whose
// observed egress disagrees with the IP-echo consensus is routed
// differently - split tunnel, per-service proxy or WARP.

export interface VisibilityEntry {
  sourceId: string;
  status: 'ok' | 'failed';
  reason?: string;
  trace?: TraceInfo;
  // Set only when a consensus exists to compare against: 'differs' means
  // this service sees a different egress than the IP-echo majority.
  agreement?: 'matches' | 'differs';
  // The observed egress is Cloudflare's own address (warp=on/plus), not
  // the VPN's or ISP's - a 'differs' flag is then expected, not alarming.
  warp?: boolean;
}

export interface ServiceVisibilityResult {
  // 'off' when the user's source selection contains no trace endpoint.
  status: 'off' | 'done';
  services: VisibilityEntry[];
}

async function queryTrace(source: TraceSource, timeoutMs: number): Promise<VisibilityEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { sourceId: source.id, status: 'failed', reason: `http ${response.status}` };
    const trace = parseTrace(await response.text());
    const warp = trace.warp !== undefined && trace.warp !== 'off';
    return { sourceId: source.id, status: 'ok', trace, ...(warp && { warp }) };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { sourceId: source.id, status: 'failed', reason };
  } finally {
    clearTimeout(timer);
  }
}

// `consensus` is the set of addresses the IP-echo sources agreed on (see
// classifyAgreement); accepted as a promise so visibility runs in parallel
// with the echo queries, like the WebRTC check does.
export async function detectServiceVisibility(
  sources: TraceSource[],
  consensus: string[] | Promise<string[]> = [],
  { timeoutMs = HTTP_SOURCE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ServiceVisibilityResult> {
  if (sources.length === 0) return { status: 'off', services: [] };

  const [entries, addresses] = await Promise.all([
    Promise.all(sources.map((source) => queryTrace(source, timeoutMs))),
    Promise.resolve(consensus).catch(() => [] as string[]),
  ]);

  if (addresses.length === 0) return { status: 'done', services: entries };

  const agreed = new Set(addresses);
  return {
    status: 'done',
    services: entries.map((entry) =>
      entry.status === 'ok' && entry.trace
        ? { ...entry, agreement: agreed.has(entry.trace.ip.address) ? 'matches' : 'differs' }
        : entry,
    ),
  };
}
