import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialState, ingestDataset } from '../../src/engine/ingestion.js';

async function readEngineRaw(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('wine-intelligence', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { return await new Promise((resolve, reject) => { const r = db.transaction('engine').objectStore('engine').get('wine-intelligence.v1'); r.onsuccess = () => resolve(r.result == null ? null : JSON.stringify(r.result)); r.onerror = () => reject(r.error); }); }
    finally { db.close(); }
  });
}

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

test('legacy engine data migrates to IndexedDB without changing journal data', async ({ page }) => {
  const legacy = ingestDataset(initialState(), 'flickinger', { rows: [{ ...wine, price: 80 }] });
  await page.getByRole('button', { name: 'Personal journal', exact: true }).click();
  await page.getByRole('button', { name: 'Add a wine', exact: true }).click();
  await page.getByLabel('Wine name').fill('Keep my journal');
  await page.getByRole('button', { name: 'Save wine', exact: true }).click();
  const journal = await page.evaluate(() => localStorage.getItem('wine-journal.v1'));
  await page.evaluate(state => localStorage.setItem('wine-intelligence.v1', JSON.stringify(state)), legacy);
  await page.reload();
  await page.getByRole('button', { name: 'Buying terminal', exact: true }).click();
  await expect(page.locator('#engine-results .terminal-table tbody tr')).toHaveCount(1);
  expect(JSON.parse(await readEngineRaw(page))).toEqual(legacy);
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('wine-journal.v1'))).toEqual(journal);
  await page.reload(); await expect(page.locator('#engine-results .terminal-table tbody tr')).toHaveCount(1);
});

test('failed migration retains the original data and exports a recovery copy', async ({ page }) => {
  const legacy = JSON.stringify(ingestDataset(initialState(), 'flickinger', { rows: [{ ...wine, price: 80 }] }));
  await page.evaluate(raw => localStorage.setItem('wine-intelligence.v1', raw), legacy);
  await page.addInitScript(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.reload();
  await expect(page.locator('#engine-notice')).toContainText('blocked to protect it');
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBe(legacy);
  expect(await readEngineRaw(page)).toBeNull();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export engine backup', exact: true }).click();
  expect((await readFile(await (await promise).path())).toString()).toBe(legacy);
});

test('corrupt legacy data stays intact and can be exported without silently starting a new inventory', async ({ page }) => {
  const bad = '{broken original inventory';
  await page.evaluate(raw => localStorage.setItem('wine-intelligence.v1', raw), bad);
  await page.reload(); await expect(page.locator('#engine-notice')).toContainText('blocked to protect it');
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBe(bad);
  expect(await readEngineRaw(page)).toBeNull();
});

test('large inventory exceeds the old storage quota but saves, reloads and restores with history', async ({ page }) => {
  test.setTimeout(90000);
  const rows = Array.from({ length: 900 }, (_, i) => ({ ...wine, raw_title: `Example Estate Lot ${i} ${'Reserve '.repeat(20)} 2019 750ml`, cuvee: `Lot ${i} ${'Reserve '.repeat(20)}`, price: 80, available_quantity: 3 }));
  await importRows(page, 'flickinger', rows);
  const raw = await readEngineRaw(page);
  expect(raw.length).toBeGreaterThan(5 * 1024 * 1024);
  const quotaFailed = await page.evaluate(value => {
    try { localStorage.setItem('quota-proof', value); localStorage.removeItem('quota-proof'); return false; }
    catch (error) { return error.name === 'QuotaExceededError'; }
  }, raw);
  expect(quotaFailed).toBe(true);
  await page.reload(); await expect(page.locator('#engine-results .terminal-table tbody tr')).toHaveCount(100);
  await expect(page.locator('#engine-result-count')).toContainText('900');
  await page.getByRole('button', {name:'Next page',exact:true}).click();
  await expect(page.locator('.rank-number').first()).toHaveText('101');
  await importRows(page, 'flickinger', rows);
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export engine backup', exact: true }).click();
  const buffer = await readFile(await (await promise).path());
  expect(buffer.length).toBeGreaterThan(10 * 1024 * 1024);
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#engine-backup-file').setInputFiles({ name: 'large-backup.json', mimeType: 'application/json', buffer });
  await expect(page.locator('#engine-notice')).toContainText('Engine backup restored');
  await page.reload();
  const saved = JSON.parse(await readEngineRaw(page));
  expect(saved.listings).toHaveLength(900); expect(saved.history).toHaveLength(1800);
  expect(await page.evaluate(() => localStorage.getItem('wine-intelligence.v1'))).toBeNull();
});

test('a stale browser tab cannot overwrite a newer committed inventory', async ({ page, context }) => {
  await importRows(page, 'flickinger', [{ ...wine, price: 80 }]);
  const other = await context.newPage();
  await other.route('**/api/**', route => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
  await other.goto('/'); await expect(other.locator('#engine-results .terminal-table tbody tr')).toHaveCount(1);
  await importRows(page, 'flickinger', [{ ...wine, price: 60 }]);
  await other.getByRole('button', { name: 'Import data', exact: true }).click();
  await other.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'stale.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ ...wine, price: 90 }])) });
  await other.getByRole('button', { name: 'Validate and import', exact: true }).click();
  await expect(other.locator('#engine-form-message')).toContainText('Inventory changed in another tab');
  expect(JSON.parse(await readEngineRaw(page)).listings[0].price).toBe(60);
  await other.close();
});

test('price research uses exact package queries and leaves verified comparisons unchanged', async ({ page }) => {
  await importRows(page, 'flickinger', [{ ...wine, raw_title: 'Example Estate Reserve 2019 6x750ml OWC', pack_count: 6, packaging: 'owc', price: 480, currency: 'USD' }]);
  const before = await readEngineRaw(page);
  await page.getByRole('button', { name: 'Research prices', exact: true }).click();
  const dialog = page.locator('#engine-dialog');
  await expect(dialog.getByLabel('Wine web search query')).toHaveValue(/2019 750ml 6 bottles original wooden case/);
  const link = dialog.getByRole('link', { name: /Search Google/ });
  expect(new URL(await link.getAttribute('href')).searchParams.get('q')).toContain('-site:wine-searcher.com');
  await expect(dialog.getByRole('button', { name: 'Find retailer results' })).toBeDisabled();
  await expect(dialog).toContainText('connect an engine');
  await page.locator('#engine-dialog-close').click();
  expect(await readEngineRaw(page)).toEqual(before);
  await expect(page.locator('.terminal-table tbody tr')).toContainText('0 confirmed merchant comps');
});

test('connected search renders escaped unverified leads without promoting snippet prices', async ({ page }) => {
  await importRows(page, 'flickinger', [{ ...wine, price: 80, currency: 'USD' }]);
  const state = JSON.parse(await readEngineRaw(page));
  let researched = '';
  await page.route('https://engine.example/api/**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/research') researched = route.request().postDataJSON().wineId;
    const body = path === '/api/engine' ? state : { status: 'ok', provider: 'Test search fixture', query: 'Example', retrievedAt: new Date().toISOString(), message: 'Search leads only.', results: [{ url: 'https://merchant.example/wine', title: 'Synthetic merchant', merchantHost: 'merchant.example', description: '<img src=x onerror=alert(1)> $100 search snippet', verification: 'unverified' }] };
    await route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
  });
  await page.getByRole('button', { name: 'Connect engine', exact: true }).click();
  await page.getByLabel('Engine API URL').fill('https://engine.example/api');
  await page.locator('#engine-connect-form').getByRole('button', { name: 'Connect engine', exact: true }).click();
  await expect(page.locator('#engine-mode')).toContainText('CONNECTED ENGINE');
  await page.getByRole('button', { name: 'Research prices', exact: true }).click();
  await page.getByRole('button', { name: 'Find retailer results' }).click();
  await expect(page.locator('#engine-research-results')).toContainText('UNVERIFIED SEARCH LEAD');
  await expect(page.locator('#engine-research-results')).toContainText('<img');
  await expect(page.locator('#engine-research-results img')).toHaveCount(0);
  expect(researched).toEqual(state.listings[0].wineId);
  await page.locator('#engine-dialog-close').click();
  await expect(page.locator('.terminal-table tbody tr')).toContainText('0 confirmed merchant comps');
  expect(JSON.parse(await readEngineRaw(page)).market).toHaveLength(0);
});

test('inventory, enrichment, filtering, explanations and source switches persist', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await importRows(page, 'flickinger', [{ ...wine, price: 80, currency: 'USD', available_quantity: 4, external_id: 'offer-1' }, { ...wine, raw_title: 'Example Estate Reserve 2019 Magnum', bottle_ml: 1500, price: 180, currency: 'USD', available_quantity: 1, external_id: 'offer-2' }]);
  await importRows(page, 'market-import', [{ ...wine, price: 100, currency: 'USD', merchant: 'Independent merchant', source_url: 'https://example.com/quote',merchant_country:'US',merchant_confidence:1,availability_status:'CONFIRMED_IN_STOCK',availability_verified:true,verified_at:new Date().toISOString(),verification_method:'manual_merchant_check',verification_evidence:'Synthetic browser test only' }]);
  await importRows(page, 'critic-import', [{ ...wine, critic: 'Authorized publication', score: 94, scale: 100, drink_from: 2024, drink_to: 2035 }]);
  await importRows(page, 'vintage-import', [{ publication:'Wine Advocate', source_reference:'Synthetic test chart, not factual data', region: 'Bordeaux', type: 'Red', vintage: 2019, score: 95, scale: 100 }]);
  const rows = page.locator('.terminal-table tbody tr');
  await expect(rows).toHaveCount(2);
  const pricedRow = rows.filter({ hasText: '20.0%' });
  await expect(pricedRow).toHaveCount(1);
  await pricedRow.getByRole('button', { name: 'Explain' }).click();
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
  await expect(rows.first()).toContainText('0 confirmed merchant comps');
  await page.reload();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('0 confirmed merchant comps');
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
  expect(await readEngineRaw(page)).toBeNull();
});

test('invalid imports and storage failures cannot report success or overwrite data', async ({ page }) => {
  await importRows(page, 'flickinger', [{ ...wine, price: 80 }]);
  const before = await readEngineRaw(page);
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('raw_title,price\nBad wine,not-a-price') });
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('#engine-form-message')).toContainText('Row 1');
  expect(await readEngineRaw(page)).toBe(before);
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ ...wine, price: 60 }])) });
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('#engine-dialog')).toBeVisible();
  await expect(page.locator('#engine-form-message')).toContainText('Browser storage is full');
  expect(await readEngineRaw(page)).toBe(before);
});

test('direct Excel export previews sheets and columns before importing and survives reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/synthetic-retailer-export.xlsx');
  await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review Excel columns', exact: true })).toBeVisible();
  await expect(page.locator('.terminal-table tbody tr')).toHaveCount(2); // Preview only, no saved inventory yet.
  expect(await readEngineRaw(page)).toBeNull();
  await expect(page.getByRole('combobox', { name: 'Worksheet', exact: true })).toHaveValue('1');
  await expect(page.getByLabel('Header row number')).toHaveValue('2');
  await expect(page.getByRole('combobox', { name: 'Map Wine Name', exact: true })).toHaveValue('raw_title');
  await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await expect(page.locator('#engine-notice')).toContainText('2 Excel rows imported');
  const saved = JSON.parse(await readEngineRaw(page));
  expect(saved.listings[0].unitPrice).toBe(80); expect(saved.listings[0].packCount).toBe(3); expect(saved.listings[1].bottleMl).toBe(1500);
  await page.reload(); await expect(page.locator('.terminal-table tbody tr')).toHaveCount(2);
});
test('Excel rows with MV, NV, zero and out-of-range vintages import with visible warnings and survive reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Import data', exact: true }).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/unusual-vintages.xlsx');
  await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await expect(page.locator('#engine-notice')).toContainText('2 vintage values kept as unknown');
  const rows = page.locator('#engine-results .terminal-table tbody tr');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('.vintage-warning')).toHaveCount(2);
  await expect(page.locator('#engine-results')).toContainText('Non-vintage (NV)');
  await expect(page.locator('#engine-results')).toContainText('Multi-vintage (MV)');
  const flagged = rows.filter({ hasText: 'import value: 0' });
  await flagged.getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('#engine-dialog')).toContainText('Vintage value “0”');
  await expect(page.locator('#engine-dialog')).toContainText('imported as unknown');
  await page.locator('#engine-dialog-close').click();
  await page.reload();
  await expect(rows).toHaveCount(4); await expect(page.locator('.vintage-warning')).toHaveCount(2);
  const saved = JSON.parse(await readEngineRaw(page));
  expect(saved.listings.map(l => l.price)).toEqual([480,240,190,360]);
  expect(saved.wines[saved.listings[2].wineId].rawVintage).toBe('0');
});
test('repeated Excel wine offers import without manual IDs and reimport without multiplying stock', async ({ page }) => {
  const importFile = async () => {
    await page.getByRole('button', { name: 'Import data', exact: true }).click();
    await page.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/repeated-offers.xlsx');
    await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
    await expect(page.locator('#engine-dialog')).not.toBeVisible();
  };
  await importFile();
  await expect(page.locator('#engine-notice')).toContainText('3 repeated offers kept separate');
  const rows = page.locator('#engine-results .terminal-table tbody tr');
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Separate offer' })).toHaveCount(3);
  const read = () => readEngineRaw(page).then(raw => JSON.parse(raw));
  const first = await read();
  expect(first.listings.map(l => [l.price,l.availableQuantity])).toEqual([[480,1],[240,2],[190,3],[360,4],[480,1]]);
  await rows.filter({ hasText: 'Separate offer' }).first().getByRole('button', { name: 'Explain', exact: true }).click();
  await expect(page.locator('#engine-dialog')).toContainText('Lot-level history is uncertain');
  await page.locator('#engine-dialog-close').click();
  await importFile();
  const second = await read();
  expect(second.listings.map(l => l.id)).toEqual(first.listings.map(l => l.id));
  expect(second.listings).toHaveLength(5); expect(second.history).toHaveLength(10);
  await page.reload(); await expect(rows).toHaveCount(5);
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

// All scores below are synthetic test inputs, never assertions about real wines.
test('critic evidence, independent manual verification, conflicts and filters persist', async ({ page }) => {
  await importRows(page, 'flickinger', [{ ...wine, price:80, WA:'96+', VM:95 }]);
  const table=page.locator('#engine-results'); await expect(table).toContainText('95.5'); await expect(table).toContainText('awaiting independent verification');
  await page.getByRole('button',{name:'Professional critics',exact:true}).click();
  const dialog=page.locator('#engine-dialog'); await expect(dialog).toContainText('96+'); await expect(dialog).toContainText('Retailer reported — unverified');
  const form=page.locator('#critic-review-form'); await form.getByLabel('Publication',{exact:true}).fill('Wine Advocate'); await form.getByLabel('Original score',{exact:true}).fill('94');
  await form.getByLabel('Source reference',{exact:true}).fill('SYNTHETIC licensed test reference');
  await form.getByRole('checkbox').check(); await form.getByRole('button',{name:'Save review and re-rank'}).click(); await expect(dialog).not.toBeVisible();
  await expect(table).toContainText('94.5'); await expect(table).toContainText('1 verified reviews');
  await page.getByLabel('With independently verified reviews',{exact:true}).check(); await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('combobox',{name:'Professional publication',exact:true}).selectOption('Wine Advocate');
  await page.getByRole('button',{name:'Professional critics',exact:true}).click(); await expect(dialog).toContainText('differs from verified review');
  await dialog.getByRole('button',{name:'Close',exact:true}).click(); await page.reload();
  const saved=JSON.parse(await readEngineRaw(page)); expect(saved.reviews).toHaveLength(3); expect(saved.reviews.filter(r=>r.verified)).toHaveLength(1);
  await importRows(page,'flickinger',[{...wine,price:80,WA:'96+',VM:95}]); expect(JSON.parse(await readEngineRaw(page)).reviews).toHaveLength(3);
  await page.getByRole('button',{name:'Explain',exact:true}).click(); await expect(dialog).toContainText('Professional critic calculation'); await expect(dialog).toContainText('critic contribution');
});

test('Excel critic columns survive mapping, uncertain cells do not block inventory, and packages remain intact', async ({ page }) => {
  await page.getByRole('button',{name:'Import data',exact:true}).click(); const dialog=page.locator('#engine-dialog');
  await dialog.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/critic-scores.xlsx'); await dialog.getByRole('button',{name:'Validate and import'}).click();
  await expect(dialog.getByLabel('Map WA',{exact:true})).toHaveValue('wa'); await expect(dialog.getByLabel('Map VM',{exact:true})).toHaveValue('vn'); await expect(dialog.getByLabel('Map Ratings',{exact:true})).toHaveValue('ratings');
  await dialog.getByRole('button',{name:'Confirm Excel import'}).click(); await expect(dialog).not.toBeVisible();
  await expect(page.locator('#engine-results tbody tr')).toHaveCount(2); await expect(page.locator('#engine-notice')).toContainText('5 retailer-reported critic reviews saved');
  const state=JSON.parse(await readEngineRaw(page)); expect(state.reviews).toHaveLength(5); expect(state.listings[0].packCount).toBe(6); expect(state.listings[0].unitPrice).toBe(80); expect(state.listings[1].bottleMl).toBe(1500); expect(state.listings[1].criticWarnings.length).toBe(2);
  await page.reload(); await expect(page.locator('#engine-results')).toContainText('95.6');
});

test('verified manual review requires a reference and no provider access remains explicit', async ({ page }) => {
  await importRows(page,'flickinger',[{...wine,price:80}]); await page.getByRole('button',{name:'Professional critics',exact:true}).click(); const dialog=page.locator('#engine-dialog');
  await expect(dialog).toContainText('Critic source unavailable'); await expect(dialog.getByRole('button',{name:'Force re-search approved critic feeds'})).toBeDisabled();
  const form=page.locator('#critic-review-form'); await form.getByLabel('Publication',{exact:true}).fill('Vinous'); await form.getByLabel('Original score',{exact:true}).fill('97'); await form.getByRole('checkbox').check();
  await form.getByRole('button',{name:'Save review and re-rank'}).click(); await expect(form.locator('[role="status"]')).toContainText('Supply the original publication URL');
  expect(JSON.parse(await readEngineRaw(page)).reviews).toHaveLength(0); await form.getByRole('checkbox').uncheck(); await form.getByRole('button',{name:'Save review and re-rank'}).click(); await expect(dialog).not.toBeVisible();
  await page.getByLabel('With independently verified reviews',{exact:true}).check(); await expect(page.locator('#engine-results')).toContainText('No wines meet these filters');
});


test('one bad inventory price no longer blocks import, retains critic alignment and exports a persistent report',async({page})=>{
  await importRows(page,'flickinger',[{...wine,external_id:'old-offer',price:80}]);
  await importRows(page,'flickinger',[{...wine,external_id:'invalid',price:0,WA:100},{...wine,external_id:'valid',price:90,WA:95}],true);
  await expect(page.locator('#engine-notice')).toContainText('1 rows imported');await expect(page.locator('#engine-notice')).toContainText('1 rows with unusable prices set aside');await expect(page.locator('#engine-results tbody tr')).toHaveCount(2);
  let state=JSON.parse(await readEngineRaw(page));expect(state.listings.some(l=>l.externalId==='invalid')).toBe(false);expect(state.listings.find(l=>l.externalId==='old-offer').isAvailable).toBe(true);expect(state.reviews.map(r=>r.score)).toEqual([95]);
  await page.getByRole('button',{name:'Review excluded price rows',exact:true}).click();const dialog=page.locator('#engine-dialog');await expect(dialog).toContainText('Price is outside');await expect(dialog).toContainText('existing stock was preserved');
  const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download excluded rows'}).click();const report=JSON.parse((await readFile(await (await downloaded).path())).toString());expect(report.rows[0].price).toBe(0);expect(report.rows[0].row.WA).toBe(100);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'Review excluded price rows'})).toBeVisible();state=JSON.parse(await readEngineRaw(page));expect(state.runs.at(-1).rejectedPriceRows).toHaveLength(1);
});


test('Excel $400.00 imports normally and excluded prices identify the physical worksheet row',async({page})=>{
  await page.getByRole('button',{name:'Import data',exact:true}).click();const dialog=page.locator('#engine-dialog');
  await dialog.getByLabel('Excel, CSV or JSON file').setInputFiles('tests/fixtures/price-diagnostics.xlsx');await dialog.getByRole('button',{name:'Validate and import'}).click();await dialog.getByRole('button',{name:'Confirm Excel import'}).click();await expect(dialog).not.toBeVisible();
  await expect(page.locator('#engine-results')).toContainText('$400.00');await expect(page.locator('#engine-results tbody tr')).toHaveCount(1);
  await page.getByRole('button',{name:'Review excluded price rows',exact:true}).click();await expect(dialog.locator('tbody tr td').first()).toHaveText('4');await expect(dialog).toContainText('Imported price: 0');
  const state=JSON.parse(await readEngineRaw(page));expect(state.listings[0].price).toBe(400);expect(state.reviews.map(r=>r.score)).toEqual([96]);
});
