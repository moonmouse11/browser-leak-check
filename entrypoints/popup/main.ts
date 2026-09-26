import '@/assets/theme.css';
import './style.css';
import { browser } from 'wxt/browser';
import { detectPublicIp } from '@/lib/ip-detection';
import { detectWebrtcLeak } from '@/lib/webrtc-leak-detection';
import { detectDnsLeak } from '@/lib/dns-leak-detection';
import { dnsStatus, ipStatus, webrtcStatus } from '@/lib/format';
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

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <div>
    <div class="lc-header">
      <span class="lc-prompt">leak-check</span><span class="lc-prompt-sep">$</span> status<span class="lc-cursor"></span>
    </div>
    <p class="lc-comment">privacy quick check</p>
  </div>

  <div class="lc-panel">
    ${statusRow('row-ipv4', 'ipv4')}
    ${statusRow('row-ipv6', 'ipv6')}
    ${statusRow('row-webrtc', 'webrtc')}
    ${statusRow('row-dns', 'dns')}
  </div>

  <p class="lc-note">webrtc check contacts one or more public stun servers; dns check contacts bash.ws</p>

  <button id="details" class="lc-btn" type="button">more details</button>
`;

document.querySelector<HTMLButtonElement>('#details')!.addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('/report.html') });
});

detectPublicIp().then((result) => {
  renderStatusRow('row-ipv4', ipStatus(result.v4), true);
  renderStatusRow('row-ipv6', ipStatus(result.v6), true);
});

detectWebrtcLeak().then((result) => {
  renderStatusRow('row-webrtc', webrtcStatus(result));
});

detectDnsLeak().then((result) => {
  renderStatusRow('row-dns', dnsStatus(result));
});
