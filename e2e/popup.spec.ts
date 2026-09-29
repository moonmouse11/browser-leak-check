import { expect, recordHosts, test } from './fixtures';

test('shows a loading state before the IP/WebRTC checks resolve', async ({
  context,
  extensionId,
}) => {
  // Hold the IP-echo and bash.ws responses until the loading state has been
  // asserted - otherwise a fast network resolves the checks first. WebRTC
  // waits on the IP-echo result, so holding ipify holds it too.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await context.route(/ipify\.org|bash\.ws/, async (route) => {
    await released;
    await route.continue().catch(() => {});
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('#row-ipv4 .lc-row-value')).toHaveText('checking');
  await expect(popup.locator('#row-webrtc .lc-row-value')).toHaveText('checking');
  await expect(popup.locator('#row-dns .lc-row-value')).toHaveText('checking');

  release();
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

test('opens the options page from "sources"', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const [options] = await Promise.all([context.waitForEvent('page'), popup.click('#sources')]);
  await options.waitForLoadState();

  expect(options.url()).toBe(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('input[type=checkbox]').first()).toBeVisible();
});

test.describe('with the webrtc and dns checks deselected', () => {
  test.use({ selection: ['ipify', 'icanhazip'] });

  test('shows both as off and never contacts bash.ws', async ({ context, extensionId }) => {
    const hosts = recordHosts(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(popup.locator('#row-webrtc .lc-row-value')).toHaveText(/^off/);
    await expect(popup.locator('#row-dns .lc-row-value')).toHaveText(/^off/);
    await expect(popup.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking', { timeout: 10_000 });

    expect([...hosts].filter((host) => host.includes('bash.ws'))).toEqual([]);
  });
});
