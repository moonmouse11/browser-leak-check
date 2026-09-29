import { expect, recordHosts, test } from './fixtures';

test.use({ selection: null });

test('asks for sources on first run and contacts nothing until they are saved', async ({
  context,
  extensionId,
}) => {
  const hosts = recordHosts(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.locator('form.lc-selection')).toBeVisible();
  await popup.setViewportSize({ width: 340, height: 1400 });
  await popup.screenshot({ path: 'test-results/first-run.png', fullPage: true });
  // Give anything that would fire on load a moment to show up.
  await popup.waitForTimeout(1500);
  expect([...hosts].filter((host) => host !== extensionId)).toEqual([]);

  await popup.getByRole('button', { name: 'save and run checks' }).click();

  await expect(popup.locator('#row-ipv4 .lc-row-value')).not.toHaveText('checking', { timeout: 10_000 });
  expect([...hosts].some((host) => host === 'api.ipify.org')).toBe(true);
});
