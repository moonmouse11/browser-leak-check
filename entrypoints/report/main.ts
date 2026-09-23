import '@/assets/theme.css';
import './style.css';
import { detectPublicIp } from '@/lib/ip-detection';
import { detectWebrtcLeak } from '@/lib/webrtc-leak-detection';
import { collectFingerprintSurface, type FingerprintSignal } from '@/lib/fingerprint-surface';
import { formatSignal, ipStatus, webrtcStatus } from '@/lib/format';
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

function signalRow<T>(
  id: string,
  label: string,
  signal: FingerprintSignal<T>,
  toText?: (value: T) => string,
): string {
  const text = formatSignal(signal, toText);
  const variant = signal.available ? 'info' : 'warn';
  return `
    <div class="lc-row" id="${id}">
      <span class="lc-row-label">${label}</span>
      <span class="lc-row-value lc-mono">${text}</span>
      <span class="lc-badge" data-variant="${variant}"></span>
    </div>
  `;
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
    <h2 class="lc-section-title">## fingerprint surface</h2>
    <div class="lc-panel" id="fingerprint"></div>
  </div>
`;

detectPublicIp().then((result) => {
  renderStatusRow('row-ipv4', ipStatus(result.v4), true);
  renderStatusRow('row-ipv6', ipStatus(result.v6), true);
});

detectWebrtcLeak().then((result) => {
  renderStatusRow('row-webrtc', webrtcStatus(result));

  document.querySelector('#webrtc-candidates')!.innerHTML = result.candidates
    .map(
      (candidate) =>
        `<li class="lc-tag lc-mono"><span class="lc-tag-type">${candidate.type}</span>${candidate.address}</li>`,
    )
    .join('');
});

collectFingerprintSurface().then((surface) => {
  document.querySelector('#fingerprint')!.innerHTML = [
    signalRow('sig-ua', 'user agent', surface.userAgent),
    signalRow('sig-platform', 'platform', surface.platform),
    signalRow('sig-screen', 'screen', surface.screenResolution),
    signalRow('sig-tz', 'timezone', surface.timezone),
    signalRow('sig-lang', 'languages', surface.languages, (v) => v.join(', ')),
    signalRow('sig-canvas', 'canvas hash', surface.canvasHash),
    signalRow('sig-webgl', 'webgl', surface.webgl, (v) => `${v.vendor} / ${v.renderer}`),
    signalRow('sig-audio', 'audio fp', surface.audioFingerprint),
  ].join('');
});
