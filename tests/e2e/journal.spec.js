import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function addWine(page, { name = 'Côtes du Rhône', status = 'wishlist', type = 'Red', price = '18.50', quantity = '2' } = {}) {
  await page.getByRole('button', { name: 'Add a wine', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a wine', exact: true });
  await dialog.getByLabel('Wine name').fill(name);
  await dialog.getByLabel('Producer', { exact: true }).fill('E. Guigal');
  await dialog.getByRole('combobox', { name: 'Wine type', exact: true }).selectOption(type);
  await dialog.getByLabel('Vintage', { exact: true }).fill('2022');
  await dialog.getByLabel('Region or country').fill('Rhône Valley, France');
  await dialog.getByRole('combobox', { name: 'Add to', exact: true }).selectOption(status);
  await dialog.getByLabel('Number of bottles').fill(quantity);
  await dialog.getByLabel('Price per bottle').fill(price);
  await dialog.getByLabel('Notes', { exact: true }).fill('Recommended for Sunday dinner.');
  await dialog.getByRole('button', { name: 'Save wine' }).click();
  await expect(dialog).not.toBeVisible();
}

test('add, reload, purchase, edit, and remove a wine', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('Meet your next favorite bottle.')).toBeVisible();
  await addWine(page);
  await expect(page.locator('#wishlist-count')).toHaveText('1');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Côtes du Rhône', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark as purchased' }).click();
  await page.getByLabel('Purchase date', { exact: true }).fill('2026-01-02');
  await page.getByRole('button', { name: 'Save purchase' }).click();
  await expect(page.locator('#wishlist-count')).toHaveText('0');
  await expect(page.locator('#purchased-count')).toHaveText('1');
  await expect(page.locator('#bottles-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Edit Côtes du Rhône', exact: true }).click();
  await page.getByLabel('Wine name').fill('My favorite Rhône');
  await page.getByRole('button', { name: 'Save wine' }).click();
  await expect(page.getByRole('heading', { name: 'My favorite Rhône' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit My favorite Rhône' }).click();
  await page.getByRole('button', { name: 'Remove wine', exact: true }).click();
  await page.getByRole('button', { name: 'Keep wine' }).click();
  await expect(page.getByRole('dialog', { name: 'A little more about this wine.' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove wine', exact: true }).click();
  await page.getByRole('dialog', { name: 'Remove this wine?' }).getByRole('button', { name: 'Remove wine' }).click();
  await expect(page.getByText('Meet your next favorite bottle.')).toBeVisible();
  await page.reload();
  await expect(page.locator('#collection-total')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('search, wine type, and list filters compose correctly', async ({ page }) => {
  await page.goto('/');
  await addWine(page);
  await addWine(page, { name: 'Chablis', status: 'purchased', type: 'White' });
  await page.getByRole('button', { name: 'Wishlist', exact: true }).click();
  await expect(page.locator('.wine-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Côtes du Rhône', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'All wines', exact: true }).click();
  await page.getByRole('combobox', { name: 'Wine type filter' }).selectOption('White');
  await expect(page.locator('.wine-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search wines' }).fill('no such wine');
  await expect(page.locator('.wine-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all wines' }).click();
  await expect(page.locator('.wine-card')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Sort wines' }).selectOption('name');
  await expect(page.locator('.wine-card').first()).toContainText('Chablis');
});

test('export and import preserve records without duplicates; bad backups cannot erase records', async ({ page }) => {
  await page.goto('/');
  await addWine(page);
  await page.getByRole('button', { name: 'Backups' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadPromise;
  const buffer = await readFile(await download.path());
  expect(JSON.parse(buffer).wines[0].name).toBe('Côtes du Rhône');
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#backup-message')).toHaveText('0 wines imported. 1 already in your journal.');
  await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"wines":[]}') });
  await expect(page.locator('#backup-message')).toContainText('Backup not imported');
  await expect(page.locator('#collection-total')).toHaveText('1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Backups' }).click();
  await page.locator('#import-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#backup-message')).toHaveText('1 wine imported. 0 already in your journal.');
  await page.getByRole('button', { name: 'Close backups' }).click();
  await expect(page.getByRole('heading', { name: 'Côtes du Rhône', exact: true })).toBeVisible();
});

test('stored user text is displayed literally and the layout fits the viewport', async ({ page }) => {
  await page.goto('/');
  const name = '<img src=x onerror="window.bad=true">';
  await addWine(page, { name });
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  await expect(page.getByLabel('Wine name')).toHaveValue(name);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('broken saved data is protected and cannot be silently replaced', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('wine-journal.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Nothing has been overwritten');
  await expect(page.getByRole('button', { name: 'Add a wine', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem('wine-journal.v1'))).toBe('{broken');
});

test('storage failure does not report success or close the form', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add a wine', exact: true }).click();
  await page.getByLabel('Wine name').fill('A wine that cannot save');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Storage full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Save wine' }).click();
  await expect(page.getByRole('alert')).toContainText('could not save this wine');
  await expect(page.getByRole('dialog', { name: 'Add a wine' })).toBeVisible();
  await expect(page.locator('#collection-total')).toHaveText('0');
});
