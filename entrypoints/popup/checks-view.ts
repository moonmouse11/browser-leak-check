import { browser } from 'wxt/browser';
import { runChecks } from '@/lib/checks';
import { renderStatusRow } from '@/lib/dom';
import { agreementStatus, disclosureText, dnsStatus, webrtcStatus } from '@/lib/format';
import { classifyAgreement } from '@/lib/ip-sources';
import { writeCache } from '@/lib/session-cache';
import { sessionArea } from '@/lib/storage';

function statusRow(id: string, label: string): string {
  return `
    <div class="lc-row" id="${id}">
      <span class="lc-row-label">${label}</span>
      <span class="lc-row-value lc-mono lc-row-value--pending">checking</span>
      <span class="lc-badge" data-variant="pending"></span>
    </div>
  `;
}

// Runs every check against `selected` and renders rows as they finish; the
// completed result is cached for the report page.
export function renderPopupChecks(app: HTMLElement, header: HTMLElement, selected: string[]): void {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="lc-panel">
      ${statusRow('row-ipv4', 'ipv4')}
      ${statusRow('row-ipv6', 'ipv6')}
      ${statusRow('row-webrtc', 'webrtc')}
      ${statusRow('row-dns', 'dns')}
    </div>

    <p class="lc-note" id="disclosure"></p>

    <div class="lc-links">
      <button id="details" class="lc-btn" type="button">more details</button>
      <button id="sources" class="lc-btn lc-btn--secondary" type="button">sources</button>
    </div>
  `;
  body.style.display = 'contents';
  body.querySelector('#disclosure')!.textContent = disclosureText(selected);
  app.replaceChildren(header, body);

  body.querySelector('#details')!.addEventListener('click', () => {
    browser.tabs.create({ url: browser.runtime.getURL('/report.html') });
  });
  body.querySelector('#sources')!.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  const checks = runChecks(selected);

  checks.http.then((results) => {
    renderStatusRow('row-ipv4', agreementStatus(classifyAgreement(results, 'v4')), true);
    renderStatusRow('row-ipv6', agreementStatus(classifyAgreement(results, 'v6')), true);
  });
  checks.webrtc.then((result) => renderStatusRow('row-webrtc', webrtcStatus(result)));
  checks.dns.then((result) => renderStatusRow('row-dns', dnsStatus(result)));
  checks.all.then((results) => writeCache(sessionArea(), results));
}
