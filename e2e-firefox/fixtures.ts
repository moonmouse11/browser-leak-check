import { readdirSync } from 'node:fs';
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
const e2eOutput = path.resolve(import.meta.dirname, '../.output-e2e');

function extensionZip(): string {
  const zip = readdirSync(e2eOutput).find((file) => file.endsWith('-firefox.zip'));
  if (!zip) throw new Error('no e2e Firefox zip in .output-e2e/ - run npm run build:e2e:firefox');
  return path.join(e2eOutput, zip);
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
      .setPreference('extensions.webextensions.uuids', JSON.stringify({ [EXTENSION_ID]: EXTENSION_UUID }))
      // Out-of-process extensions (Firefox's default) break WebDriver
      // navigation to moz-extension:// pages: driver.get() never completes
      // and later commands see an empty document. In-process extensions
      // behave the same otherwise - requests still carry the extension's
      // principal, which is what the Origin capture measures.
      .setPreference('extensions.webextensions.remote', false);
    if (process.env.FIREFOX_BINARY) options.setBinary(process.env.FIREFOX_BINARY);

    const service = new firefox.ServiceBuilder(process.env.GECKODRIVER_PATH ?? 'geckodriver');
    const driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(options)
      .setFirefoxService(service)
      .build();

    try {
      await (driver as unknown as { installAddon(path: string, temporary: boolean): Promise<string> }).installAddon(
        extensionZip(),
        true,
      );

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
