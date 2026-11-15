import { probeConnectivity, type ConnectivityResult } from './connectivity';
import { PROBE_TARGETS, STATUS_SOURCES } from './config';
import { detectDnsLeak, type DnsLeakResult } from './dns-leak-detection';
import { lookupWhois, type WhoisResult } from './ip-whois';
import { classifyAgreement, observedAddresses, querySources, type HttpSourceResult } from './ip-sources';
import { selectedSources } from './selection';
import { detectServiceVisibility, type ServiceVisibilityResult } from './service-visibility';
import { fetchServiceStatus, type ServiceStatusResult } from './service-status';
import { detectWebrtcLeak, type WebrtcLeakResult } from './webrtc-leak-detection';

// The checks a caller can ask for. http/webrtc/dns are the popup's default;
// the catalog parts run from the report page's cards (consent is the run
// control - see check-catalog design.md decision 3). bandwidth is
// deliberately NOT here: it never joins a sweep.
export type CheckPart = 'http' | 'webrtc' | 'dns' | 'visibility' | 'connectivity' | 'status' | 'whois';

const DEFAULT_PARTS: CheckPart[] = ['http', 'webrtc', 'dns'];
const CATALOG_PARTS: CheckPart[] = ['http', 'webrtc', 'dns', 'visibility', 'connectivity', 'status', 'whois'];

export interface CheckResults {
  // Bumped when the shape changes; older cached runs are treated as stale.
  version: 2;
  checkedAt: number;
  // The selection this check ran with, so a page can list exactly the
  // sources that were contacted.
  selected: string[];
  // The parts that actually ran, so a page can tell "off" from "not run".
  parts: CheckPart[];
  http: HttpSourceResult[];
  webrtc: WebrtcLeakResult;
  dns: DnsLeakResult;
  // Catalog parts - present only when they were part of the run.
  visibility?: ServiceVisibilityResult;
  connectivity?: ConnectivityResult;
  serviceStatus?: ServiceStatusResult;
  whois?: WhoisResult;
}

export interface RunningChecks {
  http: Promise<HttpSourceResult[]>;
  webrtc: Promise<WebrtcLeakResult>;
  dns: Promise<DnsLeakResult>;
  visibility?: Promise<ServiceVisibilityResult>;
  connectivity?: Promise<ConnectivityResult>;
  serviceStatus?: Promise<ServiceStatusResult>;
  whois?: Promise<WhoisResult>;
  all: Promise<CheckResults>;
}

// The addresses the IP-echo majority agreed on, per family - what trace
// results are compared against and what whois looks up.
function consensusAddresses(http: Promise<HttpSourceResult[]>): Promise<string[]> {
  return http.then((results) =>
    (['v4', 'v6'] as const)
      .map((family) => classifyAgreement(results, family))
      .flatMap((agreement) => (agreement.total > 0 && agreement.majority ? [agreement.majority] : [])),
  );
}

// Contacts only the sources in `selected`. Each part is exposed separately
// so a page can render rows as they finish; `all` resolves once every part
// has, ready to cache.
export function runChecks(selected: string[], { parts = DEFAULT_PARTS }: { parts?: CheckPart[] } = {}): RunningChecks {
  const sources = selectedSources(selected);
  const wanted = new Set(parts);

  // http is a part too: a status-only or dns-only card run must not
  // contact the echo services (check-catalog-ui, "single check run").
  const http = wanted.has('http') ? querySources(sources.http) : Promise.resolve<HttpSourceResult[]>([]);
  const webrtc = wanted.has('webrtc')
    ? detectWebrtcLeak(sources.stun, http.then(observedAddresses))
    : Promise.resolve<WebrtcLeakResult>({ status: 'off', candidates: [], servers: [] });
  const dns: Promise<DnsLeakResult> =
    wanted.has('dns') && sources.dns ? detectDnsLeak() : Promise.resolve({ status: 'off', resolvers: [] });

  // `all` is attached below, before the return - a placeholder here would
  // be an unhandled rejection (vitest caught exactly that).
  const running = { http, webrtc, dns } as RunningChecks;

  if (wanted.has('visibility')) {
    running.visibility = detectServiceVisibility(sources.trace, consensusAddresses(http));
  }
  if (wanted.has('connectivity')) {
    running.connectivity = probeConnectivity(
      PROBE_TARGETS,
      // A dead network explains a total probe failure; a live one doesn't.
      { networkWasUp: http.then((results) => results.some((result) => result.status === 'ok')) },
    );
  }
  if (wanted.has('status')) {
    running.serviceStatus = fetchServiceStatus(STATUS_SOURCES);
  }
  if (wanted.has('whois')) {
    running.whois = lookupWhois(consensusAddresses(http));
  }

  running.all = Promise.all([http, webrtc, dns]).then(async ([httpResults, webrtcResult, dnsResult]) => ({
    version: 2,
    checkedAt: Date.now(),
    selected,
    parts: [...wanted],
    http: httpResults,
    webrtc: webrtcResult,
    dns: dnsResult,
    ...(running.visibility && { visibility: await running.visibility }),
    ...(running.connectivity && { connectivity: await running.connectivity }),
    ...(running.serviceStatus && { serviceStatus: await running.serviceStatus }),
    ...(running.whois && { whois: await running.whois }),
  }));

  return running;
}

export { CATALOG_PARTS };
