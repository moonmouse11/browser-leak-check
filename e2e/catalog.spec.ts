import { STATUS_SOURCES } from '../lib/config';
import { expect, isAllowedHost, recordHosts, test } from './fixtures';
import { recommendedSelection } from '../lib/selection';

test('opens with idle cards and contacts nothing until a check is started', async ({ context, extensionId }) => {
  const hosts = recordHosts(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('.lc-card')).toHaveCount(9);
  await expect(page.locator('#card-ip')).toHaveAttribute('data-state', 'idle');
  await page.waitForTimeout(1500);

  // No application-level request at all: the catalog never auto-runs.
  expect([...hosts].filter((host) => host !== extensionId)).toEqual([]);
});

test('runs a single check from its card without touching the others', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  const hosts = recordHosts(context);
  await page.locator('#card-status .lc-card-run').click();

  await expect(page.locator('#card-status')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
  await expect(page.locator('#status-detail table')).toBeVisible();

  // Other cards did not run.
  await expect(page.locator('#card-ip')).toHaveAttribute('data-state', 'idle');
  await expect(page.locator('#card-whois')).toHaveAttribute('data-state', 'idle');

  // Only the status endpoints were contacted.
  const contacted = [...hosts].filter((host) => host !== extensionId);
  expect(contacted.length).toBeGreaterThan(0);
  const statusHosts = STATUS_SOURCES.map((source) => new URL(source.url).host);
  expect(contacted.every((host) => statusHosts.includes(host))).toBe(true);
});

test('run all completes every check except bandwidth, and records history', async ({ context, extensionId }) => {
  const hosts = recordHosts(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await page.getByRole('button', { name: 'run all' }).click();

  for (const id of ['ip', 'webrtc', 'dns', 'visibility', 'connectivity', 'status', 'whois']) {
    await expect(page.locator(`#card-${id}`)).toHaveAttribute('data-state', /done|off/, { timeout: 40_000 });
  }

  // Bandwidth is opt-in only: idle card, no traffic to the measurement host.
  await expect(page.locator('#card-bandwidth')).toHaveAttribute('data-state', 'idle');
  expect([...hosts].some((host) => host.includes('speed.cloudflare.com'))).toBe(false);

  // The run was recorded in local history, and the card reflects it.
  await expect(page.locator('#card-history .lc-card-summary')).not.toHaveText('0 entries', { timeout: 5_000 });

  // Everything the run contacted stays inside the allowlist.
  const selection = recommendedSelection();
  expect([...hosts].filter((host) => !isAllowedHost(host, selection, extensionId))).toEqual([]);
});

test('history can be cleared from the report page', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await page.locator('#card-ip .lc-card-run').click();
  await expect(page.locator('#card-ip')).toHaveAttribute('data-state', 'done', { timeout: 20_000 });
  await expect(page.locator('#history-detail table')).toBeVisible({ timeout: 5_000 });

  await page.getByRole('button', { name: 'clear history' }).click();
  await expect(page.locator('#history-detail table')).toHaveCount(0);
  await expect(page.locator('#history-detail')).toContainText('no runs recorded yet');
});

test('visibility card is off when no trace source is selected', async ({ context, extensionId }) => {
  // The recommended selection contains no trace source (they are opt-in).
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/report.html`);

  await expect(page.locator('#card-visibility')).toHaveAttribute('data-state', 'off');
  await expect(page.locator('#card-visibility .lc-card-run')).toBeDisabled();
});
