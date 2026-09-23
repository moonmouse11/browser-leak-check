import type { StatusDisplay } from './format';

// Shared by the popup and report pages: both render a status row as
// <div id=rowId class="lc-row"><span class="lc-row-label">…</span><span
// class="lc-row-value">…</span><span class="lc-badge" data-variant="…"></span>
// </div> and only need to swap the value text and the badge's
// data-variant once a check resolves - the badge's label/color come from
// CSS (assets/theme.css), not from any JS-side icon/text mapping.
export function renderStatusRow(rowId: string, display: StatusDisplay, mono = false): void {
  const row = document.getElementById(rowId);
  if (!row) return;

  const badge = row.querySelector('.lc-badge');
  badge?.setAttribute('data-variant', display.variant);

  const value = row.querySelector('.lc-row-value');
  if (value) {
    value.className = `lc-row-value${mono ? ' lc-mono' : ''}`;
    value.textContent = display.text;
  }
}
