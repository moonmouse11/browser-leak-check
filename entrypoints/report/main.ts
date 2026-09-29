import '@/assets/theme.css';
import './style.css';
import { detectedAddresses, detectPublicIp } from '@/lib/ip-detection';
import { detectWebrtcLeak } from '@/lib/webrtc-leak-detection';
import { detectDnsLeak } from '@/lib/dns-leak-detection';
import { collectFingerprintSurface, type FingerprintSignal } from '@/lib/fingerprint-surface';
import { dnsStatus, formatSignal, ipStatus, webrtcStatus } from '@/lib/format';
import { renderStatusRow } from '@/lib/dom';

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

function renderWebrtcCandidates(list: Element, candidates: { type: string; address: string; leak: boolean }[]): void {
  list.replaceChildren(
    ...candidates.map((candidate) => {
      const li = document.createElement('li');
      li.className = 'lc-tag lc-mono';
      li.setAttribute('data-leak', String(candidate.leak));
      const typeSpan = document.createElement('span');
      typeSpan.className = 'lc-tag-type';
      typeSpan.textContent = candidate.type;
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

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> report<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment">every signal from the popup, in detail</p>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## public ip</h2>
    <div class="lc-panel">
      ${statusRow('row-ipv4', 'ipv4')}
      ${statusRow('row-ipv6', 'ipv6')}
    </div>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## webrtc leak</h2>
    <p class="lc-note">this check contacts one or more public stun servers to gather ice candidates</p>
    <div class="lc-panel">
      ${statusRow('row-webrtc', 'status')}
    </div>
    <ul class="lc-tags" id="webrtc-candidates"></ul>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## dns leak</h2>
    <p class="lc-note">this check contacts bash.ws, a public dns-leak-test service, to see which resolvers answer for your queries</p>
    <div class="lc-panel">
      ${statusRow('row-dns', 'status')}
    </div>
    <ul class="lc-tags" id="dns-resolvers"></ul>
  </div>

  <div class="lc-section">
    <h2 class="lc-section-title">## fingerprint surface</h2>
    <div class="lc-panel" id="fingerprint"></div>
  </div>
`;

const publicIp = detectPublicIp();

publicIp.then((result) => {
  renderStatusRow('row-ipv4', ipStatus(result.v4), true);
  renderStatusRow('row-ipv6', ipStatus(result.v6), true);
});

detectWebrtcLeak(publicIp.then(detectedAddresses)).then((result) => {
  renderStatusRow('row-webrtc', webrtcStatus(result));

  renderWebrtcCandidates(document.querySelector('#webrtc-candidates')!, result.candidates);
});

detectDnsLeak().then((result) => {
  renderStatusRow('row-dns', dnsStatus(result));

  renderDnsResolvers(document.querySelector('#dns-resolvers')!, result.resolvers);
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
