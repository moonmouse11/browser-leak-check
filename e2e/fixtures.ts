import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';
import { ALL_SOURCES, DNS_SOURCE, HTTP_SOURCES } from '../lib/config';
import { recommendedSelection } from '../lib/selection';

// page.evaluate callbacks run inside the extension page, where the
// extension API exists; this file itself is compiled for Node.
declare const chrome: { storage: { local: { set(items: object): Promise<void> } } };

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

// Every host an application-level request may go to for a selection:
// its IP-echo services, plus bash.ws and its probe subdomains when the DNS
// check is selected. STUN is UDP, so it never shows up in a request log.
export function allowedHosts(selection: string[]): string[] {
  const hosts = HTTP_SOURCES.filter((source) => selection.includes(source.id)).map(
    (source) => new URL(source.url).host,
  );
  return selection.includes(DNS_SOURCE.id) ? [...hosts, new URL(DNS_SOURCE.url).host] : hosts;
}

export function isAllowedHost(host: string, selection: string[], extensionId: string): boolean {
  if (host === extensionId) return true;
  return allowedHosts(selection).some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export function recordHosts(context: BrowserContext): Set<string> {
  const hosts = new Set<string>();
  context.on('request', (request) => {
    try {
      hosts.add(new URL(request.url()).host);
    } catch {
      // ignore non-URL requests
    }
  });
  return hosts;
}

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  // The source selection saved before the test runs, as if the user had
  // already been through the first-run screen. null = a fresh install.
  selection: string[] | null;
}>({
  selection: [recommendedSelection(), { option: true }],

  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), 'leak-extension-pw-'));
    // Playwright's bundled "chromium" channel runs Chrome's new headless
    // mode, which (unlike the old headless shell) supports loading
    // extensions - so no window pops up during a run. PWHEADED=1 brings the
    // window back for debugging.
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: !process.env.PWHEADED,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context, selection }, use) => {
    const page = await context.newPage();
    const id = await readExtensionId(page);

    if (selection) {
      // The options page contacts nothing, so it's a safe place to write the
      // extension's storage from.
      await page.goto(`chrome-extension://${id}/options.html`);
      await page.evaluate(
        (stored) => chrome.storage.local.set({ selection: stored }),
        { version: 1, selected: selection, knownIds: ALL_SOURCES.map((source) => source.id) },
      );
    }

    await page.close();
    await use(id);
  },
});

export { expect } from '@playwright/test';
