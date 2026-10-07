import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyWine, matchWine, number } from '../src/engine/identity.js';
import { initialState, ingestDataset, parseCSV, parseDataset, validateBackup } from '../src/engine/ingestion.js';
import { rankInventory, validatePreferences } from '../src/engine/ranking.js';
import { applyAction } from '../src/engine/actions.js';
import { demoState } from '../src/engine/demo.js';
import { validateSource, sourceStatus } from '../src/engine/sources.js';

const at = '2026-10-06T12:00:00.000Z', now = new Date(at);
const row = (fields = {}) => ({ raw_title: 'Example Estate Reserve 2019 750ml', producer: 'Example Estate', cuvee: 'Reserve', vintage: 2019, bottle_ml: 750, pack_count: 1, packaging: 'loose', region: 'Example Bordeaux', country: 'France', type: 'Red', price: 80, currency: 'USD', available_quantity: 4, price_terms: 'ex_tax', ...fields });
const ingest = (state, sourceId, rows, time = at, completeSnapshot = false) => ingestDataset(state, sourceId, { rows, completeSnapshot }, time);
const inventory = () => ingest(initialState(), 'flickinger', [row()]);
const withMarket = (marketRows = [row({ price: 100, merchant: 'Retailer A' })]) => ingest(inventory(), 'market-import', marketRows);

test('repeated wines without retailer IDs keep separate offers and stable IDs on reorder and reimport', () => {
  const rows = [row({ price: 80, available_quantity: 3 }), row({ price: 95, available_quantity: 2 }), row({ price: 95, available_quantity: 2 })];
  const first = ingest(initialState(), 'flickinger', rows);
  assert.equal(first.listings.length, 3); assert.equal(new Set(first.listings.map(l => l.id)).size, 3);
  assert.deepEqual(first.listings.map(l => [l.price, l.availableQuantity]), [[80,3],[95,2],[95,2]]);
  assert.equal(new Set(first.listings.map(l => l.wineId)).size, 1);
  const second = ingest(first, 'flickinger', rows.toReversed(), '2026-10-06T13:00:00Z', true);
  assert.equal(second.listings.length, 3); assert.equal(second.history.length, 6);
  for (const listing of first.listings) assert.equal(second.listings.find(l => l.id === listing.id).price, listing.price);
  const changed = ingest(second, 'flickinger', [row({ price: 85, available_quantity: 1 }), ...rows.slice(1)], '2026-10-06T14:00:00Z', true);
  assert.equal(changed.listings.length, 3); assert.equal(changed.listings.find(l => l.id === first.listings[0].id).price, 85);
  assert.ok(changed.listings.every(l => l.warnings.some(w => w.includes('Lot-level history is uncertain'))));
  assert.equal(validateBackup(changed).listings.length, 3);
});

test('reused retailer IDs separate formats and retain histories when only one offer remains', () => {
  const rows = [row({ external_id: 'same' }), row({ external_id: 'same', raw_title: 'Example Estate Reserve 2019 1.5L', bottle_ml: 1500, price: 180 })];
  const first = ingest(initialState(), 'flickinger', rows);
  assert.equal(first.listings.length, 2);
  const reversed = ingest(first, 'flickinger', rows.toReversed(), '2026-10-06T13:00:00Z', true);
  for (const l of first.listings) assert.equal(reversed.listings.find(r => r.id === l.id).wineId, l.wineId);
  const remaining = ingest(reversed, 'flickinger', [rows[1]], '2026-10-06T14:00:00Z', true);
  assert.equal(remaining.listings.filter(l => l.isAvailable).length, 1);
  assert.equal(remaining.listings.find(l => l.isAvailable).id, first.listings.find(l => l.bottleMl === 1500).id);
  assert.equal(remaining.listings.find(l => l.bottleMl === 750).isAvailable, false);
});

test('unique retailer IDs retain their original identity and blank IDs fall back safely', () => {
  const first = ingest(initialState(), 'flickinger', [row({ external_id: '  offer-1  ' })]);
  assert.equal(first.listings[0].id, 'flickinger:offer-1');
  assert.equal(first.listings[0].listingIdentity, 'source-id');
  const blank = ingest(initialState(), 'flickinger', [row({ external_id: ' ' }), row({ external_id: '' })]);
  assert.equal(blank.listings.length, 2); assert.ok(blank.listings.every(l => l.externalId === ''));
  const original = inventory(); const duplicate = ingest(original, 'flickinger', [row(), row({ price: 90 })]);
  assert.equal(duplicate.listings[0].id, original.listings[0].id); assert.equal(duplicate.listings.length, 2);
  const before = JSON.stringify(duplicate);
  assert.throws(() => ingest(duplicate, 'flickinger', [row(),row({ price: -1 })], at, true));
  assert.equal(JSON.stringify(duplicate), before);
});

test('non-vintage and unusual year values retain inventory with safe provenance instead of blocking a file', () => {
  const values = ['NV', 'N.V.', 'Non-Vintage', 0, 9999, 1799, '2019/2020', new Date().getFullYear() + 5];
  let state = ingest(initialState(), 'flickinger', [row({ external_id: 'valid' }), ...values.map((vintage, i) => row({ vintage, external_id: `odd-${i}` }))]);
  assert.equal(state.listings.length, values.length + 1);
  assert.equal(state.runs.at(-1).vintageWarningCount, 5);
  for (const listing of state.listings.slice(1)) {
    const wine = state.wines[listing.wineId];
    assert.equal(wine.vintage, null); assert.ok(wine.rawVintage);
    assert.equal(matchWine(identifyWine(row()), wine).automatic, false);
  }
  assert.equal(state.wines[state.listings[1].wineId].vintageKind, 'non-vintage');
  const mv = identifyWine(row({ vintage: 'MV' })), spelled = identifyWine(row({ vintage: 'Multi-Vintage' }));
  assert.equal(mv.vintageKind, 'multi-vintage'); assert.equal(mv.id, spelled.id);
  assert.notEqual(mv.id, state.listings[1].wineId); assert.equal(mv.warnings.length, 0);
  const blends = ingest(initialState(), 'flickinger', [row({ vintage: 'MV' }), row({ vintage: 'NV' })]);
  assert.equal(blends.listings.length, 2); assert.equal(blends.runs[0].vintageWarningCount, 0);
  assert.equal(validateBackup(blends).listings.length, 2);
  assert.match(state.listings[4].warnings.join(' '), /0.*imported as unknown/);
  assert.notEqual(state.listings[4].wineId, state.listings[5].wineId);
  state = ingest(state, 'market-import', [row({ vintage: 0, price: 100 })]);
  assert.equal(rankInventory(state, {}, now).find(r => r.listing.externalId === 'odd-3').referencePrice, null);
  const restored = validateBackup(JSON.stringify(state));
  assert.equal(restored.wines[state.listings[4].wineId].rawVintage, '0');
  assert.equal(restored.listings.length, state.listings.length);
  const corrupt = structuredClone(restored); corrupt.wines[state.listings[4].wineId].vintage = 0;
  assert.throws(() => validateBackup(corrupt), /unresolved vintage/);
});

test('inferred future vintages are flagged and valid existing wine IDs stay unchanged', () => {
  const future = identifyWine(row({ vintage: '', raw_title: `Example Estate Reserve ${new Date().getFullYear() + 5} 750ml` }));
  assert.equal(future.vintage, null); assert.match(future.warnings.join(' '), /imported as unknown/);
  assert.equal(identifyWine(row()).id, identifyWine(row({ vintage: '' })).id);
  const old = inventory(); for (const wine of Object.values(old.wines)) { delete wine.rawVintage; delete wine.vintageKind; }
  assert.equal(validateBackup(old).listings.length, 1);
  assert.throws(() => ingest(inventory(), 'flickinger', [row({ vintage: 0, price: -1 })]));
});

test('canonical Château aliases and appellation abbreviations identify all four specified variants', () => {
  const names = ['Château Léoville Las Cases 2019', '2019 Leoville Las Cases', 'Ch. Leoville-Las-Cases 2019', 'Léoville Las Cases St-Julien 2019'];
  const wines = names.map(name => identifyWine({ name, bottle_ml: 750 }));
  assert.equal(new Set(wines.map(w => w.id)).size, 1);
  assert.equal(wines[0].appellation, 'Saint-Julien');
  assert.equal(matchWine(wines[0], wines[3]).confidence, 1);
});
test('format identity distinguishes volume, 3/6/12 packs, and wooden case versus loose', () => {
  const wines = [row(), row({ bottle_ml: 1500, raw_title: 'Example Estate Reserve 2019 1.5L' }), ...[3, 6, 12].map(pack_count => row({ pack_count, raw_title: `Example Estate Reserve 2019 ${pack_count}x750ml` })), row({ packaging: 'owc' })].map(identifyWine);
  assert.equal(new Set(wines.map(w => w.id)).size, wines.length);
  for (const w of wines.slice(1)) assert.equal(matchWine(wines[0], w).automatic, false);
  const extracted = identifyWine({ name: 'Ch. Margaux 2019 6x750ml OWC' });
  assert.equal(extracted.packCount, 6); assert.equal(extracted.bottleMl, 750); assert.equal(extracted.packaging, 'owc');
});
test('missing producer, missing vintage, unknown format, and contradictory title fields cannot price-match', () => {
  const w = identifyWine(row());
  for (const fields of [{ producer: '', raw_title: 'Unidentified bottle 2019 750ml' }, { vintage: '', raw_title: 'Example Estate Reserve 750ml' }, { bottle_ml: '', raw_title: 'Example Estate Reserve 2019' }, { bottle_ml: 1500 }]) {
    assert.equal(matchWine(w, identifyWine(row(fields))).automatic, false);
  }
});
test('strong fuzzy cuvée matches need an explicit review, while vintage conflicts cannot be approved', () => {
  const a = identifyWine(row({ cuvee: 'Reserve Cabernet' })), b = identifyWine(row({ cuvee: 'Reserve Cabernet Sauvignon' }));
  const match = matchWine(a, b); assert.equal(match.reviewable, true); assert.equal(match.automatic, false);
  let state = ingest(initialState(), 'flickinger', [row({ cuvee: 'Reserve Cabernet' })]);
  state = ingest(state, 'market-import', [row({ cuvee: 'Reserve Cabernet Sauvignon', price: 100 })]);
  assert.equal(rankInventory(state, {}, now)[0].referencePrice, null);
  state = applyAction(state, { type: 'decision', observationId: state.market[0].id, wineId: state.listings[0].wineId, decision: 'approved' }, at);
  assert.equal(rankInventory(state, {}, now)[0].referencePrice, 100);
  const wrong = ingest(inventory(), 'market-import', [row({ vintage: 2020, raw_title: 'Example Estate Reserve 2020 750ml' })]);
  assert.throws(() => applyAction(wrong, { type: 'decision', observationId: wrong.market[0].id, wineId: wrong.listings[0].wineId, decision: 'approved' }, at));
});
test('CSV supports BOM, CRLF, escaped quotes, quoted commas and multiline notes; malformed files fail', () => {
  const rows = parseCSV('\uFEFFName,Producer,Notes\r\n"Wine, red",Estate,"Said ""great""\nsecond line"\r\n');
  assert.equal(rows[0].raw_title, 'Wine, red'); assert.equal(rows[0].notes, 'Said "great"\nsecond line');
  for (const text of ['Name,Name\na,b', 'Name,Price\na', 'Name\n"unterminated', 'Name\n']) assert.throws(() => parseCSV(text));
  assert.throws(() => number('12,34', 'Price')); assert.equal(number('$1,234.50', 'Price'), 1234.5);
});
test('invalid row makes imports atomic, including complete snapshot removals', () => {
  const state = inventory(); const before = JSON.stringify(state);
  assert.throws(() => ingest(state, 'flickinger', [row(), row({ price: -1 })], at, true));
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => ingest(state, 'flickinger', [], at));
});
test('partial snapshots preserve absent offers; complete snapshots retire them and retain history', () => {
  let state = ingest(initialState(), 'flickinger', [row({ external_id: 'a' }), row({ external_id: 'b', cuvee: 'Grand Vin' })]);
  state = ingest(state, 'flickinger', [row({ external_id: 'a', price: 70 })], '2026-10-06T13:00:00Z');
  assert.equal(state.listings[1].isAvailable, true);
  state = ingest(state, 'flickinger', [row({ external_id: 'a', price: 65 })], '2026-10-06T14:00:00Z', true);
  assert.equal(state.listings[1].isAvailable, false);
  assert.equal(state.history.at(-1).event, 'absent_from_complete_snapshot');
  assert.equal(state.history.filter(h => h.id === 'flickinger:a').length, 3);
  assert.equal(state.scoreHistory.filter(h => h.listingId === 'flickinger:a').length, 3);
});
test('package totals and per-bottle pricing normalize correctly without comparing different packages', () => {
  let state = ingest(initialState(), 'flickinger', [row({ raw_title: 'Example Estate Reserve 2019 6x750ml', pack_count: 6, price: 480 })]);
  assert.equal(state.listings[0].unitPrice, 80); assert.equal(state.listings[0].pricePer750, 80);
  state = ingest(state, 'market-import', [row({ price: 120 })]);
  assert.equal(rankInventory(state, {}, now)[0].referencePrice, null);
  state = ingest(state, 'market-import', [row({ raw_title: 'Example Estate Reserve 2019 6x750ml', pack_count: 6, price: 100, price_basis: 'bottle', merchant: 'Six-pack merchant' })]);
  assert.equal(rankInventory(state, {}, now)[0].referencePrice, 100);
});
test('median market reference deduplicates merchants, preserves provenance, and calculates discount', () => {
  const state = withMarket([row({ price: 100, merchant: 'A', source_url: 'https://merchant.example/wine' }), row({ price: 120, merchant: 'B' }), row({ price: 10000, merchant: 'A', observed_at: '2026-10-05T12:00:00Z' })]);
  const a = rankInventory(state, {}, now)[0]; assert.equal(a.referencePrice, 110); assert.equal(a.marketEvidence.length, 2);
  assert.ok(Math.abs(a.discount - 30 / 110) < 1e-8); assert.equal(a.marketEvidence[0].sourceURL, 'https://merchant.example/wine');
});
test('currency, tax basis, auction quotes, low-confidence and stale data are excluded explicitly', () => {
  for (const fields of [{ currency: 'EUR' }, { price_terms: 'landed' }, { sale_type: 'auction' }, { confidence: .8 }, { observed_at: '2026-10-01T12:00:00Z' }]) {
    const a = rankInventory(withMarket([row({ price: 100, ...fields })]), {}, now)[0];
    assert.equal(a.referencePrice, null); assert.ok(a.exclusions.length);
  }
});
test('a newer unavailable quote suppresses the older available quote', () => {
  let state = withMarket(); state = ingest(state, 'market-import', [row({ price: 90, merchant: 'Retailer A', is_available: false })], '2026-10-06T13:00:00Z');
  assert.equal(rankInventory(state, {}, new Date('2026-10-06T13:00:00Z'))[0].referencePrice, null);
});
test('missing critic uses disclosed neutral contribution without imputing a critic score; minimum filters exclude unknowns', () => {
  const state = inventory(), a = rankInventory(state, {}, now)[0];
  assert.equal(a.score, 22.5); assert.equal(a.breakdown.find(b=>b.key==='quality').neutral, true); assert.equal(a.coverage, 0); assert.equal(a.quality, null); assert.equal(a.drinkNow, null);
  assert.equal(rankInventory(state, { minCritic: 90 }, now).length, 0);
  assert.equal(rankInventory(state, { minDiscount: 0 }, now).length, 0);
});
test('critic score ranges use lower bound, scales normalize, and community scores remain separate', () => {
  let state = ingest(inventory(), 'critic-import', [row({ critic: 'A', score: '95–97', scale: 100, drink_from: 2025, drink_to: 2035 }), row({ critic: 'B', score: 18, scale: 20 })]);
  state = ingest(state, 'community-import', [row({ critic: 'Community', score: 100, scale: 100 })]);
  const a = rankInventory(state, {}, now)[0]; assert.equal(a.quality, 92.5); assert.equal(a.drinkNow, true); assert.equal(a.community.length, 1);
  assert.equal(state.reviews[0].scoreHigh, 97);
});
test('vintage evidence is specific to region, year and type, with no cross-region substitution', () => {
  let state = ingest(inventory(), 'vintage-import', [{ region: 'Burgundy', type: 'Red', vintage: 2019, score: 100 }]);
  assert.equal(rankInventory(state, {}, now)[0].vintage, null);
  state = ingest(state, 'vintage-import', [{ country:'France', publication:'Wine Advocate', source_reference:'Synthetic test chart, not real ratings', region: 'Example Bordeaux', type: 'Red', vintage: 2019, score: 92 }]);
  assert.equal(rankInventory(state, {}, now)[0].vintage, 92);
});
test('disabled sources stop contributing while retained observations and journal storage are untouched', () => {
  const state = withMarket();
  const next = applyAction(state, { type: 'source', source: { ...state.sources.find(s => s.id === 'market-import'), enabled: false } }, at);
  assert.equal(rankInventory(next, {}, now)[0].referencePrice, null); assert.equal(next.market.length, 1); assert.equal(next.history.length, 1);
});
test('changing filters assigns ranks within the filtered universe, while weights change ordering', () => {
  let state = demoState(at), all = rankInventory(state, {}, now);
  const white = rankInventory(state, { type: 'White' }, now); assert.equal(white.length, 1); assert.equal(white[0].rank, 1);
  assert.equal(white[0].score, all.find(a => a.wine.type === 'White').score);
  state = applyAction(state, { type: 'preferences', preferences: { ...state.preferences, weights: { value: 0, quality: 100, vintage: 0, window: 0, confidence: 0 } } }, at);
  assert.equal(rankInventory(state, {}, now)[0].quality, 96);
  assert.equal(rankInventory(state, { bottleMl: 1500 }, now)[0].referencePrice, null);
});
test('stale inventory receives zero opportunity and a confirmation warning', () => {
  const a = rankInventory(withMarket(), {}, new Date('2026-10-10T12:00:00Z'))[0];
  assert.equal(a.score, 0); assert.equal(a.staleInventory, true);
});
test('engine backup round-trip is separate from journal format and source approvals are reset on restore', () => {
  const state = withMarket(); assert.deepEqual(validateBackup(JSON.stringify(state)), state);
  assert.throws(() => validateBackup('{"version":1,"wines":[]}'));
  state.sources[0].accessApproved = true;
  const restored = applyAction(initialState(), { type: 'restore', state }, at);
  assert.equal(restored.sources[0].accessApproved, false); assert.equal(restored.listings.length, 1);
});
test('invalid weights, confidence thresholds, URLs, and source methods are rejected', () => {
  assert.throws(() => validatePreferences({ ...initialState().preferences, weights: { value: 0, quality: 0, vintage: 0, window: 0, confidence: 0 } }));
  assert.throws(() => validatePreferences({ ...initialState().preferences, matchThreshold: .5 }));
  const s = initialState().sources[0];
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com?token=secret']) assert.throws(() => validateSource({ ...s, url }));
  assert.equal(sourceStatus({ ...s, method: 'licensed' }), 'Authentication Required');
});
test('sparse enrichment preserves inventory metadata and conflicting wine types cannot price-match', () => {
  let state = inventory();
  state = ingest(state, 'critic-import', [{ raw_title: row().raw_title, producer: 'Example Estate', cuvee: 'Reserve', vintage: 2019, critic: 'Licensed review', score: 95 }]);
  assert.equal(state.wines[state.listings[0].wineId].region, 'Example Bordeaux');
  assert.equal(state.wines[state.listings[0].wineId].type, 'Red');
  state = ingest(state, 'market-import', [row({ type: 'White', price: 200 })]);
  assert.equal(rankInventory(state, {}, now)[0].referencePrice, null);
  assert.match(rankInventory(state, {}, now)[0].exclusions[0].reason, /type/);
});
test('low-confidence reviews and vintage assessments do not silently inflate rankings', () => {
  let state = inventory();
  state = ingest(state, 'critic-import', [row({ critic: 'Uncertain review', score: 100, confidence: .5 })]);
  state = ingest(state, 'vintage-import', [{ country:'France', publication:'Wine Advocate', source_reference:'Synthetic test chart, not real ratings', region: 'Example Bordeaux', type: 'Red', vintage: 2019, score: 100, confidence: .5 }]);
  const result = rankInventory(state, {}, now)[0];
  assert.equal(result.quality, null); assert.equal(result.vintage, null); assert.equal(result.score, rankInventory(inventory(), {}, now)[0].score); assert.equal(result.exclusions.length, 2);
});
test('malformed engine backups reject missing sources, bad observations, and false currencies', () => {
  for (const change of [s => { s.sources.push(s.sources[0]); }, s => { s.listings[0].warnings = null; }, s => { s.listings[0].currency = 'ZZZ'; }, s => { s.listings[0].unitPrice = -1; }]) {
    const state = inventory(); change(state); assert.throws(() => validateBackup(state));
  }
  assert.throws(() => ingest(inventory(), 'market-import', [row({ currency: 'ZZZ' })]));
});
test('zero identity fields and contradictory producer or wooden-case titles cannot slip into price matching', () => {
  for (const field of ['bottle_ml', 'pack_count']) assert.throws(() => identifyWine(row({ [field]: 0 })));
  const unknownYear = identifyWine(row({ vintage: 0 }));
  assert.equal(unknownYear.vintage, null); assert.equal(matchWine(unknownYear, unknownYear).automatic, false);
  const owc = identifyWine(row({ raw_title: 'Example Estate Reserve 2019 750ml OWC', packaging: 'loose' }));
  assert.equal(matchWine(owc, identifyWine(row())).automatic, false);
  const wrong = identifyWine({ name: 'Château Margaux 2019 750ml', producer: 'Different estate', cuvee: 'Reserve' });
  assert.equal(matchWine(wrong, wrong).automatic, false);
});


test('inventory price quarantine keeps valid offers and exact critic-row alignment without inventing prices', () => {
  const rows=[row({external_id:'bad-first',price:0,WA:100}),row({external_id:'good-a',price:80,WA:94}),row({external_id:'bad-middle',price:'POA',WA:99}),row({external_id:'good-b',cuvee:'Grand Vin',price:120,WA:97}),...['',null,-5,'not-a-price',1e9].map((price,i)=>row({external_id:`bad-${i}`,price}))];
  const state=ingestDataset(initialState(),'flickinger',{rows,skipInvalidPrices:true,completeSnapshot:true},at);
  assert.equal(state.listings.length,2);assert.deepEqual(state.listings.map(l=>l.price),[80,120]);assert.deepEqual(state.reviews.map(r=>r.score),[94,97]);
  assert.equal(state.reviews[0].wineId,state.listings[0].wineId);assert.equal(state.reviews[1].wineId,state.listings[1].wineId);
  const run=state.runs.at(-1);assert.equal(run.count,2);assert.equal(run.inputCount,9);assert.equal(run.rejectedPriceRows.length,7);assert.equal(run.rejectedPriceRows[0].price,0);assert.equal(run.rejectedPriceRows[1].rowNumber,3);assert.equal(run.completeSnapshot,false);assert.equal(run.snapshotDowngraded,true);
  assert.equal(validateBackup(JSON.stringify(state)).runs.at(-1).rejectedPriceRows.length,7);
});
test('price quarantine prevents complete-snapshot retirement and changes nothing when all rows are invalid',()=>{
  const first=ingest(initialState(),'flickinger',[row({external_id:'keep'}),row({external_id:'update'})]);
  const result=ingestDataset(first,'flickinger',{rows:[row({external_id:'update',price:70}),row({external_id:'keep',price:0})],skipInvalidPrices:true,completeSnapshot:true},at);
  assert.equal(result.listings.find(l=>l.externalId==='keep').isAvailable,true);assert.equal(result.listings.find(l=>l.externalId==='keep').price,80);assert.equal(result.listings.find(l=>l.externalId==='update').price,70);
  const before=JSON.stringify(first);assert.throws(()=>ingestDataset(first,'flickinger',{rows:[row({price:0})],skipInvalidPrices:true,completeSnapshot:true},at),/No rows have usable prices/);assert.equal(JSON.stringify(first),before);
});
test('quarantine is opt-in and limited to inventory price failures; other errors remain atomic',()=>{
  assert.throws(()=>ingestDataset(initialState(),'flickinger',{rows:[row(),row({price:0})]},at),/Row 2/);
  assert.throws(()=>ingestDataset(initialState(),'market-import',{rows:[row({price:0})],skipInvalidPrices:true},at),/Row 1/);
  assert.throws(()=>ingestDataset(initialState(),'flickinger',{rows:[row(),row({price:0}),row({price:80,available_quantity:-1})],skipInvalidPrices:true},at),/Row 3/);
});


test('a displayed $400.00 price is valid; price diagnostics expose the actual read cell and worksheet row',()=>{
  const accepted=ingestDataset(initialState(),'flickinger',parseDataset(JSON.stringify({rows:[row({price:'$400.00',import_row:2429})],skipInvalidPrices:true})),at);
  assert.equal(accepted.listings[0].price,400);assert.equal(accepted.runs[0].rejectedPriceRows.length,0);
  assert.throws(()=>ingestDataset(initialState(),'flickinger',{rows:[row({price:0,import_row:2430})]},at),/Row 2430: Price is outside its valid range\. Imported price: 0/);
});
