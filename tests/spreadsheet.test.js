import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import readExcel from 'read-excel-file/node';
import { suggestColumns, suggestHeader, mapSpreadsheet, checkWorkbook } from '../src/engine/spreadsheet.js';
import { ingestDataset, initialState } from '../src/engine/ingestion.js';

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
test('spreadsheet mappings reject duplicates and preserve text, defaults and date observations', () => {
  const data = [['Wine','Price','Date'], ['<img onerror=bad>',80,new Date('2026-10-01T00:00:00Z')]];
  assert.throws(() => mapSpreadsheet(data,0,['raw_title','price','price']));
  const row = mapSpreadsheet(data,0,['raw_title','price','observed_at'],{currency:'USD'})[0];
  assert.equal(row.raw_title,'<img onerror=bad>'); assert.equal(row.observed_at,'2026-10-01T00:00:00.000Z'); assert.equal(row.currency,'USD');
  assert.throws(() => mapSpreadsheet(data,3,[]));
  assert.throws(() => checkWorkbook(new ArrayBuffer(12)), /xlsx/);
});
