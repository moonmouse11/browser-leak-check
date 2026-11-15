import { HTTP_SOURCE_TIMEOUT_MS, type StatusSource } from './config';

// Official service status via the public statuspage v2 JSON. Mapping is
// deliberately conservative: anything unrecognized reads as 'unknown',
// never as operational.

export type StatusIndicator = 'operational' | 'degraded' | 'outage' | 'unknown';

export interface ServiceStatusEntry {
  sourceId: string;
  indicator: StatusIndicator;
  // The service's own summary line, e.g. "Partial System Outage".
  description?: string;
  // Set when the endpoint itself failed, distinct from a reported status.
  reason?: string;
}

export interface ServiceStatusResult {
  status: 'done';
  services: ServiceStatusEntry[];
}

export function mapIndicator(raw: unknown): StatusIndicator {
  switch (raw) {
    case 'none':
      return 'operational';
    case 'minor':
    case 'maintenance':
      return 'degraded';
    case 'major':
    case 'critical':
      return 'outage';
    default:
      return 'unknown';
  }
}

async function queryStatus(source: StatusSource, timeoutMs: number): Promise<ServiceStatusEntry> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(source.url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return { sourceId: source.id, indicator: 'unknown', reason: `http ${response.status}` };

    const data: unknown = await response.json();
    const status =
      data !== null && typeof data === 'object'
        ? (data as { status?: { indicator?: unknown; description?: unknown } }).status
        : undefined;
    if (status === undefined) return { sourceId: source.id, indicator: 'unknown', reason: 'bad response' };

    const indicator = mapIndicator(status.indicator);
    const description = typeof status.description === 'string' ? status.description.slice(0, 200) : undefined;
    return {
      sourceId: source.id,
      indicator,
      ...(indicator !== 'operational' && description && { description }),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable';
    return { sourceId: source.id, indicator: 'unknown', reason };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchServiceStatus(
  sources: StatusSource[],
  { timeoutMs = HTTP_SOURCE_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<ServiceStatusResult> {
  const services = await Promise.all(sources.map((source) => queryStatus(source, timeoutMs)));
  return { status: 'done', services };
}
