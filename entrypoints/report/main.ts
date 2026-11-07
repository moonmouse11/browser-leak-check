import '@/assets/theme.css';
import './style.css';
import { browser } from 'wxt/browser';
import { measureBandwidth, type BandwidthFailure, type BandwidthResult } from '@/lib/bandwidth';
import {
  CATALOG_CARDS,
  createCard,
  renderBandwidthDetail,
  renderConnectivityDetail,
  renderHistoryDetail,
  renderStatusDetail,
  renderVisibilityDetail,
  renderWhoisDetail,
  setCardState,
  summarizeResults,
  type CardId,
  type CardState,
} from '@/lib/catalog';
import { CATALOG_PARTS, runChecks, type CheckPart, type CheckResults } from '@/lib/checks';
import { renderStatusRow } from '@/lib/dom';
import { collectFingerprintSurface, type FingerprintSignal } from '@/lib/fingerprint-surface';
import { agreementStatus, disclosureText, dnsStatus, formatSignal, sourceName, webrtcStatus } from '@/lib/format';
import { appendHistory, clearHistory, readHistory } from '@/lib/ip-history';
import { classifyAgreement, observedAddresses } from '@/lib/ip-sources';
import { loadSelection } from '@/lib/selection';
import { readCache, writeCache } from '@/lib/session-cache';
import { sourceRows } from '@/lib/source-rows';
import { localArea, sessionArea } from '@/lib/storage';
import type { WebrtcCandidate } from '@/lib/webrtc-leak-detection';

// --- detail-section helpers (existing renderers, kept from the pre-catalog page)

function statusRow(id: string, label: string): string {
  return `
    <div class="lc-row" id="${id}">
      <span class="lc-row-label">${label}</span>
      <span class="lc-row-value lc-mono lc-row-value--pending">checking</span>
      <span class="lc-badge" data-variant="pending"></span>
    </div>
  `;
}

function signalRow<T>(
  id: string,
  label: string,
  signal: FingerprintSignal<T>,
  toText?: (value: T) => string,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'lc-row';
  row.id = id;

  const labelSpan = document.createElement('span');
  labelSpan.className = 'lc-row-label';
  labelSpan.textContent = label;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'lc-row-value lc-mono';
  valueSpan.textContent = formatSignal(signal, toText);

  const badge = document.createElement('span');
  badge.className = 'lc-badge';
  badge.setAttribute('data-variant', signal.available ? 'info' : 'warn');

  row.append(labelSpan, valueSpan, badge);
  return row;
}

function renderWebrtcCandidates(list: Element, candidates: WebrtcCandidate[]): void {
  list.replaceChildren(
    ...candidates.map((candidate) => {
      const li = document.createElement('li');
      li.className = 'lc-tag lc-mono';
      li.setAttribute('data-leak', String(candidate.leak));
      const typeSpan = document.createElement('span');
      typeSpan.className = 'lc-tag-type';
      typeSpan.textContent = candidate.serverId
        ? `${candidate.type} · ${sourceName(candidate.serverId)}`
        : candidate.type;
      li.append(typeSpan, candidate.address);
      return li;
    }),
  );
}

function renderDnsResolvers(list: Element, resolvers: { ip: string; countryName: string }[]): void {
  list.replaceChildren(
    ...resolvers.map((resolver) => {
      const li = document.createElement('li');
      li.className = 'lc-tag lc-mono';
      li.append(document.createTextNode(resolver.ip));
      if (resolver.countryName) {
        const countrySpan = document.createElement('span');
        countrySpan.className = 'lc-tag-type';
        countrySpan.textContent = resolver.countryName;
        li.append(' ', countrySpan);
      }
      return li;
    }),
  );
}

function cell(tag: 'td' | 'th', text: string, attributes: Record<string, string> = {}): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function renderSourceTable(wrap: Element, results: CheckResults): void {
  const table = document.createElement('table');
  table.className = 'lc-table lc-mono';

  const headRow = document.createElement('tr');
  headRow.append(...['source', 'via', 'address', 'network owner', 'matches'].map((text) => cell('th', text)));
  table.append(headRow);

  for (const row of sourceRows(results)) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-source', row.sourceId);
    tr.append(
      cell('td', row.name),
      cell('td', row.kind),
      cell('td', row.address, { 'data-state': row.state }),
      cell('td', row.owner || '-'),
      cell('td', row.match || '-', { 'data-match': row.match }),
    );
    table.append(tr);
  }
  wrap.replaceChildren(table);
}

// --- page state

let current: CheckResults | null = null;
let bandwidthResult: BandwidthResult | BandwidthFailure | null = null;
let selectedIds: string[] = [];

function emptyResults(): CheckResults {
  return {
    version: 2,
    checkedAt: 0,
    selected: selectedIds,
    parts: [],
    http: [],
    webrtc: { status: 'off', candidates: [], servers: [] },
    dns: { status: 'off', resolvers: [] },
  };
}

// --- rendering

function renderParts(results: CheckResults): void {
  if (results.http.length > 0) {
    renderStatusRow('row-ipv4', agreementStatus(classifyAgreement(results.http, 'v4')), true);
    renderStatusRow('row-ipv6', agreementStatus(classifyAgreement(results.http, 'v6')), true);
    renderSourceTable(document.querySelector('#source-table')!, results);
  }
  if (results.webrtc.status !== 'off' || results.http.length > 0) {
    renderStatusRow('row-webrtc', webrtcStatus(results.webrtc));
    renderWebrtcCandidates(document.querySelector('#webrtc-candidates')!, results.webrtc.candidates);
  }
  if (results.dns.status !== 'off' || results.http.length > 0) {
    renderStatusRow('row-dns', dnsStatus(results.dns));
    renderDnsResolvers(document.querySelector('#dns-resolvers')!, results.dns.resolvers);
  }
  if (results.visibility) renderVisibilityDetail(document.querySelector('#visibility-detail')!, results.visibility);
  if (results.connectivity) renderConnectivityDetail(document.querySelector('#connectivity-detail')!, results.connectivity);
  if (results.serviceStatus) renderStatusDetail(document.querySelector('#status-detail')!, results.serviceStatus);
  if (results.whois) renderWhoisDetail(document.querySelector('#whois-detail')!, results.whois);
  if (results.checkedAt > 0) {
    document.querySelector('#checked-at')!.textContent = `checked at ${new Date(results.checkedAt).toLocaleTimeString()}`;
  }
}

function renderCards(): void {
  const summaries = current ? summarizeResults(current) : {};
  for (const def of CATALOG_CARDS) {
    const card = document.querySelector(`#card-${def.id}`);
    if (!card) continue;
    const derived = summaries[def.id];
    if (derived) setCardState(card, derived.state, derived.summary);
    else if (def.id !== 'bandwidth' && def.id !== 'history' && card.getAttribute('data-state') !== 'off') {
      setCardState(card, 'idle');
    }
  }
  if (bandwidthResult) {
    setCardState(
      document.querySelector('#card-bandwidth')!,
      bandwidthResult.status === 'done' ? 'done' : 'failed',
      bandwidthResult.status === 'done'
        ? `↓ ${bandwidthResult.downMbps} mbps · ↑ ${bandwidthResult.upMbps} mbps`
        : `failed: ${bandwidthResult.reason}`,
    );
  }
}

async function renderHistory(): Promise<void> {
  const entries = await readHistory(localArea());
  renderHistoryDetail(document.querySelector('#history-detail')!, entries);
  const card = document.querySelector('#card-history');
  if (card) setCardState(card, entries.length > 0 ? 'done' : 'idle', `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
}

// --- running

// Which orchestrator parts each card needs. Dependent parts pull in http:
// the WebRTC verdict and visibility agreement are meaningless without the
// IP-echo addresses to compare against.
const CARD_PARTS: Partial<Record<CardId, CheckPart[]>> = {
  ip: ['http'],
  webrtc: ['http', 'webrtc'],
  dns: ['dns'],
  visibility: ['http', 'visibility'],
  connectivity: ['http', 'connectivity'],
  status: ['status'],
  whois: ['http', 'whois'],
};

function mergeResults(parts: CheckPart[], results: CheckResults): void {
  const base = current ?? emptyResults();
  if (parts.includes('http')) base.http = results.http;
  if (parts.includes('webrtc')) base.webrtc = results.webrtc;
  if (parts.includes('dns')) base.dns = results.dns;
  if (results.visibility) base.visibility = results.visibility;
  if (results.connectivity) base.connectivity = results.connectivity;
  if (results.serviceStatus) base.serviceStatus = results.serviceStatus;
  if (results.whois) base.whois = results.whois;
  base.checkedAt = results.checkedAt;
  base.selected = results.selected;
  base.parts = [...new Set([...base.parts, ...results.parts])];
  current = base;
}

async function runParts(parts: CheckPart[], cards: CardId[]): Promise<void> {
  for (const id of cards) {
    const card = document.querySelector(`#card-${id}`);
    if (card && card.getAttribute('data-state') !== 'off') setCardState(card, 'running');
  }
  const results = await runChecks(selectedIds, { parts }).all;
  mergeResults(parts, results);
  renderParts(current!);
  renderCards();
  await writeCache(sessionArea(), current!);

  if (parts.includes('http')) {
    await appendHistory(localArea(), observedAddresses(results.http), results.checkedAt);
    await renderHistory();
  }
}

async function runCard(id: CardId): Promise<void> {
  if (id === 'bandwidth') {
    const card = document.querySelector('#card-bandwidth')!;
    setCardState(card, 'running', 'measuring...');
    bandwidthResult = await measureBandwidth();
    renderBandwidthDetail(document.querySelector('#bandwidth-detail')!, bandwidthResult);
    renderCards();
    return;
  }
  const parts = CARD_PARTS[id];
  if (parts) await runParts(parts, [id]);
}

// --- page assembly

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> report<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment">every check, runnable on its own or all at once</p>
  </div>

  <p class="lc-note" id="disclosure"></p>

  <div class="lc-section">
    <h2 class="lc-section-title">## checks</h2>
    <div class="lc-card-grid" id="catalog"></div>
    <div class="lc-links">
      <button id="run-all" class="lc-btn" type="button">run all</button>
      <button id="sources" class="lc-btn lc-btn--secondary" type="button">sources</button>
    </div>
    <p class="lc-comment" id="checked-at"></p>
  </div>

  <div class="lc-section" id="section-ip">
    <h2 class="lc-section-title">## public ip</h2>
    <div class="lc-panel">
      ${statusRow('row-ipv4', 'ipv4')}
      ${statusRow('row-ipv6', 'ipv6')}
    </div>
    <div class="lc-panel lc-table-wrap" id="source-table"></div>
  </div>

  <div class="lc-section" id="section-visibility">
    <h2 class="lc-section-title">## service visibility</h2>
    <div class="lc-panel lc-table-wrap" id="visibility-detail"><p class="lc-comment">run the visibility check</p></div>
  </div>

  <div class="lc-section" id="section-webrtc">
    <h2 class="lc-section-title">## webrtc leak</h2>
    <div class="lc-panel">
      ${statusRow('row-webrtc', 'status')}
    </div>
    <ul class="lc-tags" id="webrtc-candidates"></ul>
  </div>

  <div class="lc-section" id="section-dns">
    <h2 class="lc-section-title">## dns leak</h2>
    <div class="lc-panel">
      ${statusRow('row-dns', 'status')}
    </div>
    <ul class="lc-tags" id="dns-resolvers"></ul>
  </div>

  <div class="lc-section" id="section-connectivity">
    <h2 class="lc-section-title">## connectivity</h2>
    <div class="lc-panel lc-table-wrap" id="connectivity-detail"><p class="lc-comment">run the connectivity check</p></div>
  </div>

  <div class="lc-section" id="section-status">
    <h2 class="lc-section-title">## service status</h2>
    <div class="lc-panel lc-table-wrap" id="status-detail"><p class="lc-comment">run the status check</p></div>
  </div>

  <div class="lc-section" id="section-whois">
    <h2 class="lc-section-title">## whois</h2>
    <div class="lc-panel lc-table-wrap" id="whois-detail"><p class="lc-comment">run the whois check</p></div>
  </div>

  <div class="lc-section" id="section-bandwidth">
    <h2 class="lc-section-title">## bandwidth</h2>
    <div class="lc-panel lc-table-wrap" id="bandwidth-detail"><p class="lc-comment">opt-in: measures speed against the nearest cloudflare edge (see the card for the traffic cost)</p></div>
  </div>

  <div class="lc-section" id="section-history">
    <h2 class="lc-section-title">## ip history</h2>
    <div class="lc-panel lc-table-wrap" id="history-detail"></div>
    <div class="lc-links">
      <button id="clear-history" class="lc-btn lc-btn--secondary" type="button">clear history</button>
    </div>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## fingerprint surface</h2>
    <div class="lc-panel" id="fingerprint"></div>
  </div>
`;

const catalog = document.querySelector('#catalog')!;
for (const def of CATALOG_CARDS) {
  catalog.append(createCard(def, (id) => void runCard(id)));
}

document.querySelector('#sources')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

document.querySelector('#clear-history')!.addEventListener('click', async () => {
  await clearHistory(localArea());
  await renderHistory();
});

loadSelection(localArea()).then(async (selection) => {
  const disclosure = document.querySelector('#disclosure')!;
  const runAll = document.querySelector<HTMLButtonElement>('#run-all')!;

  if (!selection?.valid) {
    disclosure.textContent = 'no sources selected yet - choose which services may see your ip address first';
    runAll.hidden = true;
    return;
  }

  selectedIds = selection.selected;
  disclosure.textContent = disclosureText(selectedIds);

  // Cards whose sources are all deselected read "off" from the start.
  const initialOff: Partial<Record<CardId, string>> = {};
  const selected = new Set(selectedIds);
  if (![...selected].some((id) => id.startsWith('stun-'))) initialOff.webrtc = 'off (no stun server selected)';
  if (!selected.has('bash-ws')) initialOff.dns = 'off (dns check not selected)';
  if (![...selected].some((id) => id.startsWith('trace-'))) initialOff.visibility = 'off (no trace source selected)';
  for (const [id, note] of Object.entries(initialOff) as [CardId, string][]) {
    const card = document.querySelector(`#card-${id}`);
    if (card) setCardState(card, 'off', note);
  }

  runAll.addEventListener('click', async () => {
    runAll.disabled = true;
    try {
      await runParts(
        CATALOG_PARTS,
        CATALOG_CARDS.filter((def) => def.runnable && def.id !== 'bandwidth').map((def) => def.id),
      );
    } finally {
      runAll.disabled = false;
    }
  });

  // The popup's results, if it finished a check with this same selection:
  // opening the report must not contact every service a second time. The
  // catalog never auto-runs: without a cache every card stays idle until
  // the user starts a check (check-catalog-ui spec).
  const cached = await readCache(sessionArea());
  if (cached && sameSelection(cached.selected, selectedIds)) {
    current = cached;
    renderParts(cached);
    renderCards();
  }

  await renderHistory();
});

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

collectFingerprintSurface().then((surface) => {
  document.querySelector('#fingerprint')!.replaceChildren(
    signalRow('sig-ua', 'user agent', surface.userAgent),
    signalRow('sig-platform', 'platform', surface.platform),
    signalRow('sig-screen', 'screen', surface.screenResolution),
    signalRow('sig-tz', 'timezone', surface.timezone),
    signalRow('sig-lang', 'languages', surface.languages, (v) => v.join(', ')),
    signalRow('sig-canvas', 'canvas hash', surface.canvasHash),
    signalRow('sig-webgl', 'webgl', surface.webgl, (v) => `${v.vendor} / ${v.renderer}`),
    signalRow('sig-audio', 'audio fp', surface.audioFingerprint),
  );
});
