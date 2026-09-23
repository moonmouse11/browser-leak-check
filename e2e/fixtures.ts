import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const extensionPath = path.resolve(import.meta.dirname, '../.output/chrome-mv3');

// Chrome only exposes an unpacked extension's generated ID via the
// chrome://extensions page (piercing its shadow DOM) since this extension
// has no background service worker to read the ID off of.
async function readExtensionId(page: Page): Promise<string> {
  await page.goto('chrome://extensions/');
  await page.evaluate(() => {
    const manager = document.querySelector('extensions-manager') as HTMLElement & {
      shadowRoot: ShadowRoot;
    };
    const toolbar = manager.shadowRoot.querySelector('extensions-toolbar') as HTMLElement & {
      shadowRoot: ShadowRoot;
    };
    const devModeToggle = toolbar.shadowRoot.querySelector('#devMode') as HTMLElement;
    devModeToggle.click();
  });

  return page.evaluate(() => {
    const manager = document.querySelector('extensions-manager') as HTMLElement & {
      shadowRoot: ShadowRoot;
    };
    const itemList = manager.shadowRoot.querySelector('extensions-item-list') as HTMLElement & {
      shadowRoot: ShadowRoot;
    };
    const item = itemList.shadowRoot.querySelector('extensions-item') as HTMLElement;
    return item.getAttribute('id')!;
  });
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'leak-extension-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const page = await context.newPage();
    const id = await readExtensionId(page);
    await page.close();
    await use(id);
  },
});

export { expect } from '@playwright/test';
