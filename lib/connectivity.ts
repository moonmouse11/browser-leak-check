import { type ProbeSource } from './config';

// Connectivity check: can the browser reach popular sites at all, and how
// long does each take roughly? Probes use no-cors (favicons don't allow
// CORS), so the only signal is resolve-vs-reject - the elapsed time
// includes DNS+TLS and is labeled rough in the UI.

export const PROBE_TIMEOUT_MS = 4000;

export interface ProbeResult {
  targetId: string;
  status: 'reachable' | 'unreachable';
  elapsedMs?: number;
}

export interface ConnectivityResult {
  status: 'done';
  reachable: number;
  total: number;
  // 'general-failure': almost nothing answered while the network was
  // otherwise up (IP-echo worked) - the problem is the connection, not
  // the sites. 'unknown' when the network was down anyway.
  verdict: 'healthy' | 'partial' | 'general-failure' | 'unknown';
  results: ProbeResult[];
}

async function probe(target: ProbeSource, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    await fetch(target.url, {
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    return { targetId: target.id, status: 'reachable', elapsedMs: Math.round(performance.now() - started) };
  } catch {
    return { targetId: target.id, status: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeConnectivity(
  targets: ProbeSource[],
  { timeoutMs = PROBE_TIMEOUT_MS, networkWasUp = true }: { timeoutMs?: number; networkWasUp?: boolean | Promise<boolean> } = {},
): Promise<ConnectivityResult> {
  const [results, networkUp] = await Promise.all([
    Promise.all(targets.map((target) => probe(target, timeoutMs))),
    Promise.resolve(networkWasUp).catch(() => false),
  ]);
  const reachable = results.filter((result) => result.status === 'reachable').length;

  let verdict: ConnectivityResult['verdict'];
  if (reachable === results.length) verdict = 'healthy';
  else if (reachable === 0) verdict = networkUp ? 'general-failure' : 'unknown';
  else verdict = 'partial';

  return { status: 'done', reachable, total: results.length, verdict, results };
}
