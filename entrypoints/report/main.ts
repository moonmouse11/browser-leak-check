import '@/assets/theme.css';
import './style.css';
import { browser } from 'wxt/browser';
import { runChecks, type CheckResults } from '@/lib/checks';
import { renderStatusRow } from '@/lib/dom';
import { collectFingerprintSurface, type FingerprintSignal } from '@/lib/fingerprint-surface';
import {
  agreementStatus,
  disclosureText,
  dnsStatus,
  formatSignal,
  sourceName,
  webrtcStatus,
} from '@/lib/format';
import { classifyAgreement } from '@/lib/ip-sources';
import { loadSelection } from '@/lib/selection';
import { readCache, writeCache } from '@/lib/session-cache';
import { sourceRows } from '@/lib/source-rows';
import { localArea, sessionArea } from '@/lib/storage';
import type { WebrtcCandidate } from '@/lib/webrtc-leak-detection';

function statusRow(id: string, label: string): string {
  return `
    <div class="lc-row" id="${id}">
      <span class="lc-row-label">${label}</span>
      <span class="lc-row-value lc-mono lc-row-value--pending">checking</span>
      <span class="lc-badge" data-variant="pending"></span>
    </div>
  `;
}

// Built as DOM nodes, not an HTML string: the user agent and WebGL renderer
// are arbitrary strings (a UA override or GPU driver can put markup in them).
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
      // Reflexive candidates say which STUN server saw them, so the same
      // address from two servers reads as two confirmations, not a duplicate.
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

// Every selected source as a row, failed ones included. DOM APIs only:
// addresses are validated IP literals, but owner names are service-supplied.
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

function resetRows(): void {
  for (const id of ['row-ipv4', 'row-ipv6', 'row-webrtc', 'row-dns']) {
    renderStatusRow(id, { text: 'checking', variant: 'pending' }, true);
  }
  document.querySelector('#source-table')!.replaceChildren();
  document.querySelector('#webrtc-candidates')!.replaceChildren();
  document.querySelector('#dns-resolvers')!.replaceChildren();
}

function renderResults(results: CheckResults): void {
  renderStatusRow('row-ipv4', agreementStatus(classifyAgreement(results.http, 'v4')), true);
  renderStatusRow('row-ipv6', agreementStatus(classifyAgreement(results.http, 'v6')), true);
  renderStatusRow('row-webrtc', webrtcStatus(results.webrtc));
  renderStatusRow('row-dns', dnsStatus(results.dns));
  renderSourceTable(document.querySelector('#source-table')!, results);
  renderWebrtcCandidates(document.querySelector('#webrtc-candidates')!, results.webrtc.candidates);
  renderDnsResolvers(document.querySelector('#dns-resolvers')!, results.dns.resolvers);
  document.querySelector('#checked-at')!.textContent = `checked at ${new Date(results.checkedAt).toLocaleTimeString()}`;
}

async function runFresh(selected: string[]): Promise<void> {
  resetRows();
  document.querySelector('#checked-at')!.textContent = 'checking...';
  const results = await runChecks(selected).all;
  renderResults(results);
  await writeCache(sessionArea(), results);
}

function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> report<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment">every signal from the popup, in detail</p>
  </div>

  <p class="lc-note" id="disclosure"></p>

  <div class="lc-section">
    <h2 class="lc-section-title">## public ip</h2>
    <div class="lc-panel">
      ${statusRow('row-ipv4', 'ipv4')}
      ${statusRow('row-ipv6', 'ipv6')}
    </div>
    <div class="lc-panel lc-table-wrap" id="source-table"></div>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## webrtc leak</h2>
    <div class="lc-panel">
      ${statusRow('row-webrtc', 'status')}
    </div>
    <ul class="lc-tags" id="webrtc-candidates"></ul>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## dns leak</h2>
    <div class="lc-panel">
      ${statusRow('row-dns', 'status')}
    </div>
    <ul class="lc-tags" id="dns-resolvers"></ul>
  </div>

  <div class="lc-section">
    <p class="lc-comment" id="checked-at"></p>
    <div class="lc-links">
      <button id="rerun" class="lc-btn" type="button">re-run checks</button>
      <button id="sources" class="lc-btn lc-btn--secondary" type="button">sources</button>
    </div>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## fingerprint surface</h2>
    <div class="lc-panel" id="fingerprint"></div>
  </div>
`;

document.querySelector('#sources')!.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
});

loadSelection(localArea()).then(async (selection) => {
  const disclosure = document.querySelector('#disclosure')!;
  const rerun = document.querySelector<HTMLButtonElement>('#rerun')!;

  if (!selection?.valid) {
    disclosure.textContent = 'no sources selected yet - choose which services may see your ip address first';
    rerun.hidden = true;
    return;
  }

  disclosure.textContent = disclosureText(selection.selected);
  rerun.addEventListener('click', async () => {
    rerun.disabled = true;
    try {
      await runFresh(selection.selected);
    } finally {
      rerun.disabled = false;
    }
  });

  // The popup's results, if it finished a check with this same selection:
  // opening the report must not contact every service a second time.
  const cached = await readCache(sessionArea());
  if (cached && sameSelection(cached.selected, selection.selected)) renderResults(cached);
  else await runFresh(selection.selected);
});

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
