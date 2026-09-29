import type { BrowserContext } from '@playwright/test';
import { expect, test } from './fixtures';

function isDocumentedHost(host: string, extensionId: string): boolean {
  return (
    host === extensionId ||
    host === 'api.ipify.org' ||
    host === 'api6.ipify.org' ||
    host === 'bash.ws' ||
    host.endsWith('.bash.ws')
  );
}

function recordHosts(context: BrowserContext): Set<string> {
  const requestedHosts = new Set<string>();
  context.on('request', (request) => {
    try {
      requestedHosts.add(new URL(request.url()).host);
    } catch {
      // ignore non-URL requests
    }
  });
  return requestedHosts;
}

for (const pageName of ['popup', 'report']) {
  test(`${pageName} page contacts only the documented third-party hosts`, async ({
    context,
    extensionId,
  }) => {
    const requestedHosts = recordHosts(context);

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/${pageName}.html`);

    await expect(page.locator('#row-dns .lc-row-value')).not.toHaveText('checking', {
      timeout: 15_000,
    });

    const unexpected = [...requestedHosts].filter((host) => !isDocumentedHost(host, extensionId));
    expect(unexpected).toEqual([]);
  });
}
