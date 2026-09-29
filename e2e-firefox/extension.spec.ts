import { mkdirSync, writeFileSync } from 'node:fs';
import { By } from 'selenium-webdriver';
import { HTTP_SOURCES, STUN_SOURCES } from '../lib/config';
import { recommendedSelection } from '../lib/selection';
import { buttonByText, expect, extensionUrl, test, waitFor, waitForRow } from './fixtures';

test.describe('fresh install', () => {
  test.use({ selection: null });

  test('first run to report: selection screen, checks, per-source table', async ({ driver }) => {
    await driver.get(extensionUrl('popup.html'));
    await waitFor(
      driver,
      async () => (await driver.findElements(By.css('form.lc-selection'))).length > 0,
      15_000,
      'selection screen not shown',
    );

    await (await buttonByText(driver, 'save and run checks')).click();
    const ipv4 = await waitForRow(driver, '#row-ipv4');
    expect(ipv4).not.toBe('lookup failed');

    await driver.get(extensionUrl('report.html'));
    const selected = recommendedSelection();
    const expected = [...HTTP_SOURCES, ...STUN_SOURCES].filter((source) => selected.includes(source.id));
    const rows = await waitFor(
      driver,
      async () => {
        const found = await driver.findElements(By.css('#source-table tr[data-source]'));
        return found.length === expected.length ? found : undefined;
      },
      30_000,
      `report did not list ${expected.length} sources`,
    );
    expect(await Promise.all(rows.map((row) => row.getAttribute('data-source')))).toEqual(
      expected.map((source) => source.id),
    );
  });
});

test('the e2e build lists the echo source on the options page', async ({ driver }) => {
  await driver.get(extensionUrl('options.html'));

  const echo = await waitFor(driver, async () => (await driver.findElements(By.css('input[value="e2e-echo"]')))[0]);
  expect(echo).toBeDefined();
});

test.describe('origin capture', () => {
  test.use({ selection: ['e2e-echo', 'ipify', 'icanhazip'] });

  test('records the Origin header Firefox sends to an IP-echo source', async ({ driver, echo }) => {
    await driver.get(extensionUrl('popup.html'));
    await waitForRow(driver, '#row-ipv4');

    const request = echo.requests.find((entry) => entry.path === '/');
    expect(request, 'the extension never queried the echo source').toBeDefined();

    const origin = String(request!.headers.origin ?? '(no Origin header)');
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/firefox-origin.txt', `${origin}\n`);
    writeFileSync('test-results/firefox-echo-headers.json', `${JSON.stringify(request!.headers, null, 2)}\n`);

    expect(origin.length).toBeGreaterThan(0);
  });
});
