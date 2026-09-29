import { HTTP_SOURCES, STUN_SOURCES } from '../lib/config';
import { recommendedSelection } from '../lib/selection';
import { allowedHosts, expect, recordHosts, test } from './fixtures';

test('renders IP, WebRTC leak, DNS leak, and fingerprint surface sections', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking', {
    timeout: 15_000,
  });
  await expect(page.locator('#row-webrtc .lc-row-value')).not.toHaveText('checking');
  await expect(page.locator('#row-dns .lc-row-value')).not.toHaveText('checking');

  // Every selected source is a row in the per-source table.
  const selected = recommendedSelection();
  const expectedRows = [...HTTP_SOURCES, ...STUN_SOURCES]
    .filter((source) => selected.includes(source.id))
    .map((source) => source.id);
  await expect(page.locator('#source-table tr[data-source]')).toHaveCount(expectedRows.length);
  expect(await page.locator('#source-table tr[data-source]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-source')))).toEqual(
    expectedRows,
  );

  // The disclosure names the selected services, above the results.
  await expect(page.locator('#disclosure')).toContainText('ipify');
  await expect(page.locator('#disclosure')).toBeInViewport();

  // 8 fingerprint-surface signals: UA, platform, screen, timezone,
  // languages, canvas hash, WebGL, audio fingerprint.
  await expect(page.locator('#fingerprint .lc-row')).toHaveCount(8);
  await page.screenshot({ path: 'test-results/report.png', fullPage: true });
});

test('reuses the popup check instead of contacting every service again', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  for (const row of ['#row-ipv4', '#row-webrtc', '#row-dns']) {
    await expect(popup.locator(`${row} .lc-row-value`)).not.toHaveText('checking', { timeout: 15_000 });
  }
  // The cache is written once every part has finished.
  await popup.waitForTimeout(300);

  const hosts = recordHosts(context);
  const [report] = await Promise.all([context.waitForEvent('page'), popup.click('#details')]);
  await expect(report.locator('#source-table tr[data-source]').first()).toBeVisible({ timeout: 5_000 });
  await report.waitForTimeout(1000);

  const sourceHosts = allowedHosts(recommendedSelection());
  expect([...hosts].filter((host) => sourceHosts.some((s) => host === s || host.endsWith(`.${s}`)))).toEqual([]);
});

test('still finishes when WebRTC never answers (e.g. a stubbed API)', async ({ context, extensionId }) => {
  // What a WebRTC-blocking extension that stubs the API instead of removing
  // it looks like: an RTCPeerConnection whose offer never comes.
  await context.addInitScript(() => {
    RTCPeerConnection.prototype.createOffer = () => new Promise(() => {});
  });

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#checked-at')).toContainText('checked at', { timeout: 20_000 });
  await expect(page.locator('#row-webrtc .lc-row-value')).toHaveText('webrtc not responding');
  await expect(page.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking');
});
