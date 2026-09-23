import { expect, test } from './fixtures';

test('renders IP, WebRTC leak, and fingerprint surface sections', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#ipv4')).not.toHaveText('Checking…', { timeout: 10_000 });
  await expect(page.locator('#webrtc-summary')).not.toHaveText('Checking…', { timeout: 10_000 });

  // 8 fingerprint-surface signals: UA, platform, screen, timezone,
  // languages, canvas hash, WebGL, audio fingerprint.
  await expect(page.locator('#fingerprint dt')).toHaveCount(8);
});
