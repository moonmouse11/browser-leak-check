import { BANDWIDTH_SOURCE } from './config';

// Bandwidth test against speed.cloudflare.com (__down / __up). Runs only
// on explicit user request - never in a sweep - and self-limits far below
// the site's own ~350 MB: at most ~31 MB down, ~6 MB up per run
// (design.md decision 9).

// Ladder of download sizes; stops at the overall timeout. The largest
// completed sample gives the rate, since small transfers under-measure.
const DOWN_LADDER_BYTES = [1_000_000, 5_000_000, 25_000_000];
const UP_LADDER_BYTES = [1_000_000, 5_000_000];
const RTT_PROBE_BYTES = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BandwidthResult {
  status: 'done';
  downMbps: number;
  upMbps: number;
  rttMs: number;
  bytesConsumed: number;
}

export interface BandwidthFailure {
  status: 'failed';
  reason: string;
  bytesConsumed: number;
}

interface Sample {
  bytes: number;
  seconds: number;
}

async function timedFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<{ response: Response; seconds: number }> {
  const started = performance.now();
  const response = await fetch(url, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal });
  await response.arrayBuffer();
  return { response, seconds: (performance.now() - started) / 1000 };
}

function mbps(sample: Sample): number {
  return Math.round((sample.bytes * 8) / sample.seconds / 1e5) / 10;
}

export async function measureBandwidth({
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<BandwidthResult | BandwidthFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let consumed = 0;

  try {
    const base = BANDWIDTH_SOURCE.url;

    // Edge RTT from a tiny download, like the site's own "edge RTT" readout.
    const rttStart = performance.now();
    await timedFetch(`${base}/__down?bytes=${RTT_PROBE_BYTES}`, {}, controller.signal);
    const rttMs = Math.round(performance.now() - rttStart);
    consumed += RTT_PROBE_BYTES;

    const downSamples: Sample[] = [];
    for (const bytes of DOWN_LADDER_BYTES) {
      const { response, seconds } = await timedFetch(`${base}/__down?bytes=${bytes}`, {}, controller.signal);
      if (!response.ok) throw new Error(`http ${response.status}`);
      consumed += bytes;
      downSamples.push({ bytes, seconds });
    }

    const upSamples: Sample[] = [];
    for (const bytes of UP_LADDER_BYTES) {
      const { response, seconds } = await timedFetch(
        `${base}/__up`,
        { method: 'POST', body: new Uint8Array(bytes) },
        controller.signal,
      );
      if (!response.ok) throw new Error(`http ${response.status}`);
      consumed += bytes;
      upSamples.push({ bytes, seconds });
    }

    const bestDown = downSamples.reduce((best, sample) => (sample.bytes > best.bytes ? sample : best));
    const bestUp = upSamples.reduce((best, sample) => (sample.bytes > best.bytes ? sample : best));

    return {
      status: 'done',
      downMbps: mbps(bestDown),
      upMbps: mbps(bestUp),
      rttMs,
      bytesConsumed: consumed,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? (error.name === 'AbortError' ? 'timeout' : error.message) : 'measurement failed';
    return { status: 'failed', reason, bytesConsumed: consumed };
  } finally {
    clearTimeout(timer);
  }
}
