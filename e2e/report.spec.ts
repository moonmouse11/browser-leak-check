import { expect, test } from './fixtures';

test('renders IP, WebRTC leak, and fingerprint surface sections', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking', {
    timeout: 10_000,
  });
  await expect(page.locator('#row-webrtc .lc-row-value')).not.toHaveText('checking', {
    timeout: 10_000,
  });

  // 8 fingerprint-surface signals: UA, platform, screen, timezone,
  // languages, canvas hash, WebGL, audio fingerprint.
  await expect(page.locator('#fingerprint .lc-row')).toHaveCount(8);
});
