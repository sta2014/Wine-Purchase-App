import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import readExcel from 'read-excel-file/node';
import { suggestColumns, suggestHeader, mapSpreadsheet, checkWorkbook } from '../src/engine/spreadsheet.js';
import { ingestDataset, initialState } from '../src/engine/ingestion.js';
import { identifyWine, matchWine, packageSummary } from '../src/engine/identity.js';

test('real XLSX fixture reads multiple sheets, detects retailer headers, and normalizes package totals', async () => {
  const buffer = readFileSync(new URL('./fixtures/synthetic-retailer-export.xlsx', import.meta.url));
  checkWorkbook(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const sheets = await readExcel(buffer);
  assert.equal(sheets.length, 2);
  const data = sheets.find(s => s.sheet === 'Inventory').data, header = suggestHeader(data);
  assert.equal(header, 1);
  const rows = mapSpreadsheet(data, header, suggestColumns(data[header]));
  const state = ingestDataset(initialState(), 'flickinger', { rows });
  assert.equal(state.listings.length, 2); assert.equal(state.listings[0].unitPrice, 80); assert.equal(state.listings[0].packCount, 3); assert.equal(state.listings[1].bottleMl, 1500);
});
test('retailer package formats distinguish physical bottles from standard-bottle equivalents', () => {
  const data = [['Wine Name', 'Producer', 'Cuvee', 'Vintage', 'Format', 'Unit Price', 'Quantity'], ...[['6x750ml', 480, 1], ['3x750ml', 240, 2], ['1.5 L', 190, 3], ['3.0L', 360, 4]].map(([format, price, qty]) => ['Example Estate Reserve 2019', 'Example Estate', 'Reserve', 2019, format, price, qty])];
  const rows = mapSpreadsheet(data, 0, suggestColumns(data[0]), { bottle_ml: 750, pack_count: 1, packaging: 'loose', currency: 'USD' });
  const state = ingestDataset(initialState(), 'flickinger', { rows });
  assert.deepEqual(state.listings.map(r => [r.packCount, r.bottleMl, r.packageMl, r.standardBottleEquivalent, r.price, r.unitPrice, r.pricePer750, r.availableQuantity]), [
    [6, 750, 4500, 6, 480, 80, 80, 1], [3, 750, 2250, 3, 240, 80, 80, 2], [1, 1500, 1500, 2, 190, 190, 95, 3], [1, 3000, 3000, 4, 360, 360, 90, 4],
  ]);
  assert.equal(new Set(state.listings.map(r => r.wineId)).size, 4);
  assert.equal(matchWine(state.listings[0].wine, state.listings[3].wine).automatic, false);
});
test('title formats and named magnums normalize consistently, while contradictory explicit formats stay flagged', () => {
  const base = { producer: 'Example Estate', vintage: 2019 };
  const wine = text => identifyWine({ ...base, raw_title: `Example Estate Reserve 2019 ${text}` });
  assert.equal(wine('6×750ml').id, wine('6x750ml').id);
  assert.equal(wine('double magnum').id, wine('3.0L').id);
  assert.equal(wine('magnum').id, wine('1.5 L').id);
  assert.deepEqual(packageSummary(wine('double magnum')), { physicalBottles: 1, bottleMl: 3000, packageMl: 3000, standardBottleEquivalent: 4 });
  const titleRows = mapSpreadsheet([['Wine Name', 'Price'], ['Example Estate Reserve 2019 6x750ml', 480]], 0, ['raw_title', 'price'], { pack_count: 1, bottle_ml: 750 });
  assert.equal(identifyWine(titleRows[0]).packCount, 6);
  const conflict = identifyWine({ ...base, raw_title: 'Example Estate Reserve 2019 6x750ml', format: '3x750ml' });
  assert.equal(matchWine(conflict, conflict).automatic, false);
  const owc = mapSpreadsheet([['Wine', 'Format'], ['Example Estate Reserve 2019', '6x750ml OWC']], 0, ['raw_title', 'format'], { packaging: 'loose', pack_count: 1 });
  assert.equal(identifyWine(owc[0]).packaging, 'owc');
  for (const format of ['0x750ml', '999x750ml', '0L', '999L']) assert.throws(() => identifyWine({ ...base, raw_title: 'Example Estate Reserve 2019', format }));
});
test('spreadsheet mappings reject duplicates and preserve text, defaults and date observations', () => {
  const data = [['Wine','Price','Date'], ['<img onerror=bad>',80,new Date('2026-10-01T00:00:00Z')]];
  assert.throws(() => mapSpreadsheet(data,0,['raw_title','price','price']));
  const row = mapSpreadsheet(data,0,['raw_title','price','observed_at'],{currency:'USD'})[0];
  assert.equal(row.raw_title,'<img onerror=bad>'); assert.equal(row.observed_at,'2026-10-01T00:00:00.000Z'); assert.equal(row.currency,'USD');
  assert.throws(() => mapSpreadsheet(data,3,[]));
  assert.throws(() => checkWorkbook(new ArrayBuffer(12)), /xlsx/);
});
