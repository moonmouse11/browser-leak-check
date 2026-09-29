import { expect, isAllowedHost, recordHosts, test } from './fixtures';
import { recommendedSelection } from '../lib/selection';

test('a popup + report session contacts only the hosts of the saved selection', async ({
  context,
  extensionId,
}) => {
  const hosts = recordHosts(context);

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#row-dns .lc-row-value')).not.toHaveText('checking', { timeout: 15_000 });

  const [report] = await Promise.all([context.waitForEvent('page'), popup.click('#details')]);
  await report.getByRole('button', { name: 're-run checks' }).click();
  await expect(report.locator('#row-dns .lc-row-value')).not.toHaveText('checking', { timeout: 15_000 });
  await expect(report.locator('#checked-at')).toContainText('checked at', { timeout: 15_000 });

  const selection = recommendedSelection();
  expect([...hosts].filter((host) => !isAllowedHost(host, selection, extensionId))).toEqual([]);
});
