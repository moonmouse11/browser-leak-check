import { detectDnsLeak, type DnsLeakResult } from './dns-leak-detection';
import { observedAddresses, querySources, type HttpSourceResult } from './ip-sources';
import { selectedSources } from './selection';
import { detectWebrtcLeak, type WebrtcLeakResult } from './webrtc-leak-detection';

export interface CheckResults {
  checkedAt: number;
  // The selection this check ran with, so a page can list exactly the
  // sources that were contacted.
  selected: string[];
  http: HttpSourceResult[];
  webrtc: WebrtcLeakResult;
  dns: DnsLeakResult;
}

export interface RunningChecks {
  http: Promise<HttpSourceResult[]>;
  webrtc: Promise<WebrtcLeakResult>;
  dns: Promise<DnsLeakResult>;
  all: Promise<CheckResults>;
}

// Contacts only the sources in `selected`. Each part is exposed separately
// so a page can render rows as they finish; `all` resolves once every part
// has, ready to cache.
export function runChecks(selected: string[]): RunningChecks {
  const sources = selectedSources(selected);

  const http = querySources(sources.http);
  const webrtc = detectWebrtcLeak(sources.stun, http.then(observedAddresses));
  const dns: Promise<DnsLeakResult> = sources.dns
    ? detectDnsLeak()
    : Promise.resolve({ status: 'off', resolvers: [] });

  const all = Promise.all([http, webrtc, dns]).then(([httpResults, webrtcResult, dnsResult]) => ({
    checkedAt: Date.now(),
    selected,
    http: httpResults,
    webrtc: webrtcResult,
    dns: dnsResult,
  }));

  return { http, webrtc, dns, all };
}
