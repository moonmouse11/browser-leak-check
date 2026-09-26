import { expect, test } from './fixtures';

test('shows a loading state before the IP/WebRTC checks resolve', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('#row-ipv4 .lc-row-value')).toHaveText('checking');
  await expect(popup.locator('#row-webrtc .lc-row-value')).toHaveText('checking');
  await expect(popup.locator('#row-dns .lc-row-value')).toHaveText('checking');
});

test('resolves IP and WebRTC status and opens the report page from "More details"', async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking', {
    timeout: 10_000,
  });
  await expect(popup.locator('#row-webrtc .lc-row-value')).not.toHaveText('checking', {
    timeout: 10_000,
  });
  await expect(popup.locator('#row-dns .lc-row-value')).not.toHaveText('checking', {
    timeout: 10_000,
  });

  const [reportPage] = await Promise.all([
    context.waitForEvent('page'),
    popup.click('#details'),
  ]);
  await reportPage.waitForLoadState();

  expect(reportPage.url()).toBe(`chrome-extension://${extensionId}/report.html`);
});
