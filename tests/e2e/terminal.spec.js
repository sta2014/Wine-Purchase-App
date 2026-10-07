import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const wine = { raw_title: 'Example Estate Reserve 2019', producer: 'Example Estate', cuvee: 'Reserve', vintage: 2019, bottle_ml: 750, pack_count: 1, packaging: 'loose', type: 'Red', region: 'Bordeaux', country: 'France' };
async function importRows(page, sourceId, rows, completeSnapshot = false) {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  const dialog = page.locator('#engine-dialog');
  await dialog.getByRole('combobox', { name: 'Import source', exact: true }).selectOption(sourceId);
  await dialog.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'authorized-export.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ rows, completeSnapshot })) });
  await dialog.getByRole('button', { name: 'Validate and import' }).click();
  await expect(dialog).not.toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await page.goto('/');
});

test('inventory, enrichment, filtering, explanations and source switches persist', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await importRows(page, 'flickinger', [{ ...wine, price: 80, currency: 'USD', available_quantity: 4, external_id: 'offer-1' }, { ...wine, raw_title: 'Example Estate Reserve 2019 Magnum', bottle_ml: 1500, price: 180, currency: 'USD', available_quantity: 1, external_id: 'offer-2' }]);
  await importRows(page, 'market-import', [{ ...wine, price: 100, currency: 'USD', merchant: 'Independent merchant', source_url: 'https://example.com/quote' }]);
  await importRows(page, 'critic-import', [{ ...wine, critic: 'Authorized publication', score: 94, scale: 100, drink_from: 2024, drink_to: 2035 }]);
  await importRows(page, 'vintage-import', [{ region: 'Bordeaux', type: 'Red', vintage: 2019, score: 95, scale: 100 }]);
  const rows = page.locator('.terminal-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('20.0%');
  await expect(rows.first()).toContainText('Compelling opportunity');
  await rows.first().getByRole('button', { name: 'Explain' }).click();
  await expect(page.locator('#engine-dialog')).toContainText('Independent merchant');
  await expect(page.locator('#engine-dialog')).toContainText('Authorized publication');
  await expect(page.locator('#engine-dialog')).toContainText('Price and inventory history');
  await page.locator('#engine-dialog-close').click();
  await page.getByLabel('Minimum market discount %', { exact: true }).fill('10');
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('td').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await page.locator('[data-toggle-source="market-import"]').click();
  await expect(page.locator('#engine-dialog')).toContainText('Disabled');
  await page.locator('#engine-dialog-close').click();
  await expect(rows.first()).toContainText('0 current merchants');
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('0 current merchants');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('snapshots retain history and backups restore safely without changing the journal', async ({ page }) => {
  await page.getByRole('button', { name: 'Personal journal', exact: true }).click();
  await page.getByRole('button', { name: 'Add a wine', exact: true }).click();
  await page.getByLabel('Wine name').fill('My existing personal wine');
  await page.getByRole('button', { name: 'Save wine' }).click();
  await page.getByRole('button', { name: 'Buying terminal', exact: true }).click();
  await importRows(page, 'flickinger', [{ ...wine, price: 80, external_id: 'one' }]);
  await importRows(page, 'flickinger', [{ ...wine, price: 70, external_id: 'one' }]);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export engine backup' }).click();
  const buffer = await readFile(await (await promise).path());
  const backup = JSON.parse(buffer);
  expect(backup.history).toHaveLength(2);
  expect(backup.scoreHistory).toHaveLength(2);
  await importRows(page, 'flickinger', [], true);
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(0);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#engine-backup-file').setInputFiles({ name: 'engine.json', mimeType: 'application/json', buffer });
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(1);
  await page.locator('#engine-backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":1}') });
  await expect(page.locator('#engine-notice')).toContainText('backup');
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Personal journal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My existing personal wine', exact: true })).toBeVisible();
});

test('synthetic example is isolated and preferences change ranking', async ({ page }) => {
  await page.getByRole('button', { name: 'Explore synthetic example' }).click();
  await expect(page.locator('#engine-mode')).toContainText('SYNTHETIC EXAMPLE');
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(4);
  await page.getByRole('button', { name: 'Preferences', exact: true }).click();
  for (const key of ['Value', 'Vintage', 'Window', 'Confidence']) await page.getByLabel(`${key} weight`, { exact: true }).fill('0');
  await page.getByLabel('Quality weight', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Save preferences and re-rank' }).click();
  await expect(page.locator('.terminal-table tbody tr').first()).toContainText('96.0');
  await page.getByRole('button', { name: 'Return to my inventory' }).click();
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBeNull();
});

test('invalid imports and storage failures cannot report success or overwrite data', async ({ page }) => {
  await importRows(page, 'flickinger', [{ ...wine, price: 80 }]);
  const before = await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'));
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('raw_title,price\nBad wine,not-a-price') });
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('#engine-form-message')).toContainText('Row 1');
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBe(before);
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ ...wine, price: 60 }])) });
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('#engine-dialog')).toBeVisible();
  await expect(page.locator('#engine-form-message')).toContainText('Full');
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBe(before);
});

test('direct Excel export previews sheets and columns before importing and survives reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/synthetic-retailer-export.xlsx');
  await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review Excel columns', exact: true })).toBeVisible();
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(2); // Preview only, no saved inventory yet.
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBeNull();
  await expect(page.getByRole('combobox', { name: 'Worksheet', exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Header row number')).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Map Wine Name', exact: true })).toHaveValue('raw_title');
  await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await expect(page.locator('#engine-notice')).toContainText('2 Excel rows imported');
  const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1')));
  expect(saved.listings[0].unitPrice).toBe(80); expect(saved.listings[0].packCount).toBe(3); expect(saved.listings[1].bottleMl).toBe(1500);
  await page.reload(); await expect(page.locator('.terminal-table tbody tr')).toHaveCount(2);
});
test('Excel package formats display package prices and standard-volume equivalents without changing physical bottle counts', async ({ page }) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/package-formats.xlsx');
  await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
  await expect(page.locator('#engine-dialog')).toContainText('Each listing format describes one package');
  await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  const rows = page.locator('#engine-results tbody tr');
  await expect(rows).toHaveCount(4);
  const six = rows.filter({ hasText: '6 bottles × 750ml' });
  await expect(six).toContainText('6 × 750ml equivalent');
  await expect(six).toContainText('$480.00');
  await expect(six).toContainText('$80.00 / physical bottle');
  const magnum = rows.filter({ hasText: '1 magnum × 1500ml' });
  await expect(magnum).toContainText('2 × 750ml equivalent');
  await expect(magnum).toContainText('$190.00 / physical bottle');
  await expect(magnum).toContainText('$95.00 / 750ml equivalent');
  const double = rows.filter({ hasText: '1 double magnum × 3000ml' });
  await expect(double).toContainText('4 × 750ml equivalent');
  await expect(double).toContainText('$360.00 / physical bottle');
  await expect(double).toContainText('$90.00 / 750ml equivalent');
  await page.reload(); await expect(rows).toHaveCount(4);
  await page.getByLabel('Physical bottles / package', { exact: true }).fill('1');
  await expect(rows).toHaveCount(2);
});
