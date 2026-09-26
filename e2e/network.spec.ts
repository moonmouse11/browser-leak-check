import { expect, test } from './fixtures';

test('report page contacts only the documented third-party hosts', async ({
  context,
  extensionId,
}) => {
  const requestedHosts = new Set<string>();
  context.on('request', (request) => {
    try {
      requestedHosts.add(new URL(request.url()).host);
    } catch {
      // ignore non-URL requests
    }
  });

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#row-dns .lc-row-value')).not.toHaveText('checking', {
    timeout: 15_000,
  });

  const extensionHost = `${extensionId}`;
  const unexpected = [...requestedHosts].filter(
    (host) =>
      host !== extensionHost &&
      host !== 'api.ipify.org' &&
      host !== 'api6.ipify.org' &&
      host !== 'bash.ws' &&
      !host.endsWith('.bash.ws'),
  );

  expect(unexpected).toEqual([]);
});
