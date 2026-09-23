import './style.css';
import { browser } from 'wxt/browser';
import { detectPublicIp } from '@/lib/ip-detection';
import { detectWebrtcLeak } from '@/lib/webrtc-leak-detection';
import { formatIpResult } from '@/lib/format';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>Leak check</h1>
  <dl>
    <dt>IPv4</dt><dd id="ipv4">Checking…</dd>
    <dt>IPv6</dt><dd id="ipv6">Checking…</dd>
    <dt>WebRTC</dt><dd id="webrtc">Checking…</dd>
  </dl>
  <p class="disclosure">
    The WebRTC check contacts one or more public STUN servers to look for
    leaked addresses.
  </p>
  <button id="details" type="button">More details</button>
`;

document.querySelector<HTMLButtonElement>('#details')!.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('/report.html') });
});

detectPublicIp().then((result) => {
  document.querySelector('#ipv4')!.textContent = formatIpResult(result.v4);
  document.querySelector('#ipv6')!.textContent = formatIpResult(result.v6);
});

detectWebrtcLeak().then((result) => {
  const count = result.candidates.length;
  document.querySelector('#webrtc')!.textContent = result.leakDetected
    ? `Leak detected (${count} address${count === 1 ? '' : 'es'})`
    : 'No leak detected';
});
