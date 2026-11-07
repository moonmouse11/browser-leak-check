import type { BandwidthFailure, BandwidthResult } from './bandwidth';
import type { CheckResults } from './checks';
import type { ConnectivityResult } from './connectivity';
import { agreementStatus, dnsStatus, sourceName, webrtcStatus, type StatusVariant } from './format';
import type { HistoryEntry } from './ip-history';
import { classifyAgreement } from './ip-sources';
import type { WhoisResult } from './ip-whois';
import type { ServiceStatusResult } from './service-status';
import type { ServiceVisibilityResult } from './service-visibility';
import { PROBE_TARGETS } from './config';

// The report page's check catalog: every check as a card with its own
// state, summary, run control and detail view. DOM APIs only, like the
// rest of the UI - service-supplied strings never become markup.

export type CardId =
  | 'ip'
  | 'webrtc'
  | 'dns'
  | 'visibility'
  | 'connectivity'
  | 'status'
  | 'whois'
  | 'bandwidth'
  | 'history';

export type CardState = 'idle' | 'running' | 'done' | 'failed' | 'off';

export interface CardDef {
  id: CardId;
  title: string;
  // Shown under the title; for bandwidth it carries the traffic warning.
  note?: string;
  // History has no run control - it is a view over local storage.
  runnable: boolean;
}

export const CATALOG_CARDS: CardDef[] = [
  { id: 'ip', title: 'public ip', runnable: true },
  { id: 'webrtc', title: 'webrtc leak', runnable: true },
  { id: 'dns', title: 'dns leak', runnable: true },
  { id: 'visibility', title: 'service visibility', note: 'which ip each ai service sees', runnable: true },
  { id: 'connectivity', title: 'connectivity', note: 'rough reachability to popular sites', runnable: true },
  { id: 'status', title: 'service status', note: 'official status pages', runnable: true },
  { id: 'whois', title: 'whois', note: 'network owner of your egress ip', runnable: true },
  { id: 'bandwidth', title: 'bandwidth', note: 'uses up to ~37 mb of traffic per run', runnable: true },
  { id: 'history', title: 'ip history', note: 'local only, never uploaded', runnable: false },
];

const STATE_VARIANT: Record<CardState, StatusVariant> = {
  idle: 'pending',
  running: 'pending',
  done: 'ok',
  failed: 'warn',
  off: 'info',
};

function span(className: string, text = ''): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = className;
  node.textContent = text;
  return node;
}

export function createCard(def: CardDef, onRun: (id: CardId) => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'lc-card';
  card.id = `card-${def.id}`;
  card.dataset.state = 'idle';

  const head = document.createElement('div');
  head.className = 'lc-card-head';
  // The title links to the card's detail section - the "open its detail"
  // control the check-catalog-ui spec asks for.
  const titleLink = document.createElement('a');
  titleLink.className = 'lc-card-title';
  titleLink.href = `#section-${def.id}`;
  titleLink.textContent = def.title;
  const badge = span('lc-badge');
  badge.setAttribute('data-variant', 'pending');
  head.append(titleLink, badge);
  card.append(head);

  if (def.note) card.append(span('lc-card-note', def.note));

  card.append(span('lc-card-summary', 'not run yet'));

  if (def.runnable) {
    const run = document.createElement('button');
    run.type = 'button';
    run.className = 'lc-btn lc-btn--secondary lc-card-run';
    run.textContent = 'run';
    run.addEventListener('click', () => onRun(def.id));
    card.append(run);
  }
  return card;
}

// Updates one card in place; other cards are untouched by construction.
export function setCardState(card: Element, state: CardState, summary?: string): void {
  card.setAttribute('data-state', state);
  card.querySelector('.lc-badge')?.setAttribute('data-variant', STATE_VARIANT[state]);
  if (summary !== undefined) {
    const node = card.querySelector('.lc-card-summary');
    if (node) node.textContent = summary;
  }
  const run = card.querySelector<HTMLButtonElement>('.lc-card-run');
  if (run) run.disabled = state === 'running' || state === 'off';
}

export interface CardSummary {
  state: CardState;
  summary: string;
}

// Per-card state + one-line summary from a run's results. Only parts that
// were actually run (present on the results) appear; bandwidth/history
// have their own flows and are derived elsewhere.
export function summarizeResults(results: CheckResults): Partial<Record<CardId, CardSummary>> {
  const out: Partial<Record<CardId, CardSummary>> = {};

  const ran = (part: string) => results.parts.includes(part as CheckResults['parts'][number]);

  if (ran('http') && results.http.length > 0) {
    const v4 = agreementStatus(classifyAgreement(results.http, 'v4'));
    const v6 = agreementStatus(classifyAgreement(results.http, 'v6'));
    const bothFailed = v4.variant === 'warn' && v6.variant === 'warn';
    out.ip = {
      state: bothFailed ? 'failed' : 'done',
      summary: `v4: ${v4.text} · v6: ${v6.text}`,
    };
  }

  if (ran('webrtc')) {
    const display = webrtcStatus(results.webrtc);
    out.webrtc = { state: results.webrtc.status === 'off' ? 'off' : 'done', summary: display.text };
  }

  if (ran('dns')) {
    out.dns = {
      state: results.dns.status === 'off' ? 'off' : 'done',
      summary: dnsStatus(results.dns).text,
    };
  }

  if (results.visibility) {
    const { services } = results.visibility;
    if (results.visibility.status === 'off') {
      out.visibility = { state: 'off', summary: 'off (no trace source selected)' };
    } else {
      const ok = services.filter((entry) => entry.status === 'ok');
      const differing = ok.filter((entry) => entry.agreement === 'differs');
      out.visibility = {
        state: ok.length === 0 ? 'failed' : 'done',
        summary:
          differing.length > 0
            ? `${differing.map((entry) => sourceName(entry.sourceId)).join(', ')} sees a different egress`
            : `${ok.length}/${services.length} services see the consensus egress`,
      };
    }
  }

  if (results.connectivity) {
    const { reachable, total, verdict } = results.connectivity;
    out.connectivity = {
      state: verdict === 'unknown' ? 'failed' : 'done',
      summary: `${reachable}/${total} reachable · ${verdict.replace('-', ' ')}`,
    };
  }

  if (results.serviceStatus) {
    const { services } = results.serviceStatus;
    const incidents = services.filter((entry) => entry.indicator === 'degraded' || entry.indicator === 'outage');
    const known = services.filter((entry) => !entry.reason);
    out.status = {
      state: known.length === 0 ? 'failed' : 'done',
      summary:
        incidents.length > 0
          ? `${incidents.map((entry) => sourceName(entry.sourceId)).join(', ')}: incident`
          : `${known.length}/${services.length} operational`,
    };
  }

  if (results.whois) {
    const { entries } = results.whois;
    const ok = entries.filter((entry) => entry.status === 'ok');
    out.whois = {
      state: entries.length > 0 && ok.length === 0 ? 'failed' : 'done',
      summary: ok.length > 0 ? ok.map((entry) => entry.name ?? entry.range ?? entry.ip).join(' · ') : 'no record',
    };
  }

  return out;
}

function table(rows: (HTMLElement | HTMLElement[])[]): HTMLElement {
  const node = document.createElement('table');
  node.className = 'lc-table lc-mono';
  for (const row of rows) {
    if (Array.isArray(row)) {
      const tr = document.createElement('tr');
      tr.append(...row);
      node.append(tr);
    } else {
      node.append(row);
    }
  }
  return node;
}

function cell(text: string, attributes: Record<string, string> = {}): HTMLElement {
  const node = document.createElement('td');
  node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function header(texts: string[]): HTMLElement {
  const tr = document.createElement('tr');
  for (const text of texts) {
    const th = document.createElement('th');
    th.textContent = text;
    tr.append(th);
  }
  return tr;
}

export function renderVisibilityDetail(wrap: Element, result: ServiceVisibilityResult): void {
  if (result.status === 'off') {
    wrap.replaceChildren(span('lc-comment', 'off - no trace source selected (see options)'));
    return;
  }
  const rows = result.services.map((entry) => {
    if (entry.status === 'failed' || !entry.trace) {
      return [cell(sourceName(entry.sourceId)), cell('failed', { 'data-state': 'failed' }), cell(entry.reason ?? '-'), cell('-'), cell('-')];
    }
    const { trace } = entry;
    const egress = trace.ip.address;
    const agreement =
      entry.warp === true ? `cloudflare warp egress (warp=${trace.warp ?? 'on'})` : entry.agreement === 'differs' ? 'differs from consensus' : entry.agreement === 'matches' ? 'matches consensus' : '-';
    return [
      cell(sourceName(entry.sourceId)),
      cell(egress, { 'data-state': entry.agreement === 'differs' && !entry.warp ? 'differing' : 'ok' }),
      cell(agreement),
      cell([trace.colo, trace.http, trace.tls].filter(Boolean).join(' · ') || '-'),
      cell(trace.ip.family),
    ];
  });
  wrap.replaceChildren(table([header(['service', 'egress ip', 'verdict', 'edge · protocols', 'family']), ...rows]));
}

export function renderConnectivityDetail(
  wrap: Element,
  result: ConnectivityResult,
  serviceStatus?: ServiceStatusResult,
): void {
  // An unreachable probe next to an official incident reads as the
  // service's problem, not the user's network (service-status spec).
  const incidentBySourceId = new Map(
    (serviceStatus?.services ?? [])
      .filter((service) => service.indicator === 'degraded' || service.indicator === 'outage')
      .map((service) => [service.sourceId, service.description ?? service.indicator]),
  );
  const rows = result.results.map((probe) => {
    const target = PROBE_TARGETS.find((candidate) => candidate.id === probe.targetId);
    const incident = target?.statusOf ? incidentBySourceId.get(target.statusOf) : undefined;
    return [
      cell(sourceName(probe.targetId)),
      cell(probe.status, { 'data-state': probe.status === 'reachable' ? 'ok' : 'failed' }),
      cell(probe.elapsedMs !== undefined ? `${probe.elapsedMs} ms` : '-'),
      cell(probe.status === 'unreachable' && incident ? `service incident: ${incident}` : '-'),
    ];
  });
  const verdict = span('lc-comment', `verdict: ${result.verdict.replace('-', ' ')} (${result.reachable}/${result.total} reachable)`);
  wrap.replaceChildren(verdict, table([header(['site', 'status', 'rough latency', 'note']), ...rows]));
}

export function renderStatusDetail(wrap: Element, result: ServiceStatusResult): void {
  const rows = result.services.map((service) => [
    cell(sourceName(service.sourceId)),
    cell(service.reason ? 'unknown' : service.indicator, {
      'data-state': service.reason ? 'failed' : service.indicator === 'operational' ? 'ok' : service.indicator === 'unknown' ? 'differing' : 'failed',
    }),
    cell(service.reason ?? service.description ?? '-'),
  ]);
  wrap.replaceChildren(table([header(['service', 'status', 'detail']), ...rows]));
}

export function renderWhoisDetail(wrap: Element, result: WhoisResult): void {
  if (result.entries.length === 0) {
    wrap.replaceChildren(span('lc-comment', 'no egress ip to look up'));
    return;
  }
  const rows = result.entries.map((entry) =>
    entry.status === 'ok'
      ? [cell(entry.ip), cell(entry.name ?? '-'), cell(entry.range ?? '-'), cell(entry.country ?? '-')]
      : entry.status === 'no-record'
        ? [cell(entry.ip), cell('no record', { 'data-state': 'differing' }), cell('unallocated or bogon'), cell('-')]
        : [cell(entry.ip), cell('failed', { 'data-state': 'failed' }), cell(entry.reason ?? '-'), cell('-')],
  );
  wrap.replaceChildren(table([header(['ip', 'network', 'range', 'country']), ...rows]));
}

export function renderHistoryDetail(wrap: Element, entries: HistoryEntry[]): void {
  if (entries.length === 0) {
    wrap.replaceChildren(span('lc-comment', 'no runs recorded yet'));
    return;
  }
  const rows = entries.map((entry) => [
    cell(new Date(entry.checkedAt).toLocaleString()),
    cell(entry.addresses.join(', ') || '-'),
  ]);
  wrap.replaceChildren(table([header(['when', 'egress ip(s)']), ...rows]));
}

export function renderBandwidthDetail(wrap: Element, result: BandwidthResult | BandwidthFailure): void {
  if (result.status === 'failed') {
    wrap.replaceChildren(
      span('lc-comment', `measurement failed: ${result.reason} (consumed ${(result.bytesConsumed / 1e6).toFixed(1)} mb)`),
    );
    return;
  }
  wrap.replaceChildren(
    table([
      header(['down', 'up', 'edge rtt', 'traffic used']),
      [
        cell(`${result.downMbps} mbps`),
        cell(`${result.upMbps} mbps`),
        cell(`${result.rttMs} ms`),
        cell(`${(result.bytesConsumed / 1e6).toFixed(1)} mb`),
      ],
    ]),
  );
}

// The owner string shown next to an address in the whois card summary.
export function whoisOwnerLine(result: WhoisResult): string {
  const owners = result.entries.flatMap((entry) => (entry.status === 'ok' && entry.name ? [entry.name] : []));
  return owners.join(' · ');
}
