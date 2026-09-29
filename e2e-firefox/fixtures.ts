import { existsSync } from 'node:fs';
import path from 'node:path';
import { test as base } from '@playwright/test';
import { Builder, By, type WebDriver, type WebElement } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { ALL_SOURCES } from '../lib/config';
import { recommendedSelection } from '../lib/selection';
import { startEchoServer, type EchoServer } from './echo-server';

// Firefox gives every install a random moz-extension UUID; pinning it in
// the profile makes the extension's page URLs known to the tests.
export const EXTENSION_UUID = '4c0e6f6a-9b1d-4f3e-8a2c-5d7e9f1a3b5c';
const EXTENSION_ID = 'leak-check@localhost';

// Built by npm run build:e2e:firefox (the e2e build, with the echo source).
const extensionDir = path.resolve(import.meta.dirname, '../.output-e2e/firefox-mv3');

// geckodriver listens here; the add-on install below talks to it directly.
const GECKODRIVER_PORT = 4455;

// Installed from the unpacked directory, not a zip: with the extension in
// its own process (Firefox's default), pages of a zip-installed temporary
// add-on never load in this environment - the document stays empty. From
// a directory they load normally. selenium-webdriver's installAddon only
// takes a file, so this calls geckodriver's endpoint with a path instead.
async function installUnpacked(driver: WebDriver): Promise<void> {
  if (!existsSync(extensionDir)) throw new Error(`${extensionDir} missing - run npm run build:e2e:firefox`);
  const session = (await driver.getSession()).getId();
  const response = await fetch(`http://127.0.0.1:${GECKODRIVER_PORT}/session/${session}/moz/addon/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: extensionDir, temporary: true }),
  });
  if (!response.ok) throw new Error(`add-on install failed: ${response.status} ${await response.text()}`);
}

export function extensionUrl(page: string): string {
  return `moz-extension://${EXTENSION_UUID}/${page}`;
}

// Selenium's own polling, as a promise that resolves to what `check`
// returned once it's truthy.
export function waitFor<T>(
  driver: WebDriver,
  check: () => Promise<T | undefined | null | false>,
  timeoutMs = 15_000,
  message?: string,
): Promise<T> {
  return driver.wait(
    async () => (await check().catch(() => undefined)) || undefined,
    timeoutMs,
    message,
  ) as Promise<T>;
}

export async function rowText(driver: WebDriver, selector: string): Promise<string> {
  return driver.findElement(By.css(`${selector} .lc-row-value`)).getText();
}

// Waits until a status row has left its "checking" state.
export function waitForRow(driver: WebDriver, selector: string, timeoutMs = 20_000): Promise<string> {
  return waitFor(
    driver,
    async () => {
      const text = await rowText(driver, selector);
      return text && text !== 'checking' ? text : undefined;
    },
    timeoutMs,
    `${selector} still checking`,
  );
}

export async function buttonByText(driver: WebDriver, text: string): Promise<WebElement> {
  for (const button of await driver.findElements(By.css('button'))) {
    if ((await button.getText()).includes(text)) return button;
  }
  throw new Error(`no button "${text}"`);
}

export const test = base.extend<{
  // The saved source selection before the test starts; null = fresh install.
  selection: string[] | null;
  echo: EchoServer;
  driver: WebDriver;
}>({
  selection: [recommendedSelection(), { option: true }],

  echo: async ({}, use) => {
    const echo = await startEchoServer(8787);
    await use(echo);
    await echo.close();
  },

  driver: async ({ selection, echo: _echo }, use, testInfo) => {
    const options = new firefox.Options()
      .addArguments('-headless')
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }));
    if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);

    const service = new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH ?? 'geckodriver').setPort(
      GECKODRIVER_PORT,
    );
    const driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build();

    try {
      await installUnpacked(driver);

      if (selection) {
        // The options page contacts nothing, so it's a safe place to write
        // the extension's storage from.
        await driver.get(extensionUrl('options.html'));
        await driver.executeAsyncScript(
          `const done = arguments[arguments.length - 1];
           browser.storage.local.set({ selection: arguments[0] }).then(() => done(), (e) => done(String(e)));`,
          { version: 1, selected: selection, knownIds: ALL_SOURCES.map((source) => source.id) },
        );
      }

      await use(driver);
    } finally {
      // Selenium has no trace viewer: keep the last page for debugging.
      if (testInfo.status !== testInfo.expectedStatus) {
        const source = await driver.getPageSource().catch(() => '(page source unavailable)');
        await testInfo.attach('page.html', { body: source, contentType: 'text/html' });
      }
      await driver.quit();
    }
  },
});

export { expect } from '@playwright/test';
