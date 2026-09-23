import './style.css';
import { detectPublicIp } from '@/lib/ip-detection';
import { detectWebrtcLeak } from '@/lib/webrtc-leak-detection';
import { collectFingerprintSurface } from '@/lib/fingerprint-surface';
import { formatIpResult, formatSignal } from '@/lib/format';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>Full report</h1>

  <section>
    <h2>Public IP</h2>
    <dl>
      <dt>IPv4</dt><dd id="ipv4">Checking…</dd>
      <dt>IPv6</dt><dd id="ipv6">Checking…</dd>
    </dl>
  </section>

  <section>
    <h2>WebRTC leak</h2>
    <p class="disclosure">
      This check contacts one or more public STUN servers to gather ICE
      candidates.
    </p>
    <p id="webrtc-summary">Checking…</p>
    <ul id="webrtc-candidates"></ul>
  </section>

  <section>
    <h2>Fingerprint surface</h2>
    <dl id="fingerprint"></dl>
  </section>
`;

detectPublicIp().then((result) => {
  document.querySelector('#ipv4')!.textContent = formatIpResult(result.v4);
  document.querySelector('#ipv6')!.textContent = formatIpResult(result.v6);
});

detectWebrtcLeak().then((result) => {
  const count = result.candidates.length;
  document.querySelector('#webrtc-summary')!.textContent = result.leakDetected
    ? `Leak detected: ${count} address${count === 1 ? '' : 'es'}`
    : 'No leak detected';

  document.querySelector('#webrtc-candidates')!.innerHTML = result.candidates
    .map((candidate) => `<li>${candidate.type}: ${candidate.address}</li>`)
    .join('');
});

collectFingerprintSurface().then((surface) => {
  const rows: [string, string][] = [
    ['User agent', formatSignal(surface.userAgent)],
    ['Platform', formatSignal(surface.platform)],
    ['Screen', formatSignal(surface.screenResolution)],
    ['Timezone', formatSignal(surface.timezone)],
    ['Languages', formatSignal(surface.languages, (v) => v.join(', '))],
    ['Canvas hash', formatSignal(surface.canvasHash)],
    ['WebGL', formatSignal(surface.webgl, (v) => `${v.vendor} / ${v.renderer}`)],
    ['Audio fingerprint', formatSignal(surface.audioFingerprint)],
  ];

  document.querySelector('#fingerprint')!.innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`)
    .join('');
});
