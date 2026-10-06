import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWine, parseCollection, serializeCollection, mergeCollection, saveCollection, filterWines, escapeHTML } from '../src/model.js';

const wine = (overrides = {}) => ({ id: 'test-wine-1', name: 'Côtes du Rhône', producer: 'E. Guigal', vintage: 2022, type: 'Red', region: 'France', status: 'wishlist', price: 18.5, currency: 'USD', quantity: 2, purchaseDate: '', notes: 'For a Sunday dinner', createdAt: '2026-01-01T12:00:00.000Z', ...overrides });

test('a backup round trip preserves wine details, prices, notes, and accented text', () => {
  const original = [wine(), wine({ id: 'wine-2', status: 'purchased', purchaseDate: '2026-01-02', price: 0, vintage: null })];
  assert.deepEqual(parseCollection(serializeCollection(original)), original);
  assert.deepEqual(parseCollection(null), []);
});
test('optional fields stay empty and zero price is preserved', () => {
  assert.equal(normalizeWine(wine({ price: '', vintage: '' })).price, null);
  assert.equal(normalizeWine(wine({ price: 0 })).price, 0);
  assert.equal(normalizeWine(wine({ name: '  Wine  ' })).name, 'Wine');
});
test('invalid records are rejected before import or saving', () => {
  for (const overrides of [{ name: '' }, { price: -1 }, { price: true }, { price: [] }, { quantity: 1.5 }, { quantity: 0 }, { quantity: true }, { vintage: 'no' }, { type: 'invalid' }, { status: 'invalid' }, { currency: 'bad' }, { createdAt: 'nonsense' }, { id: '<script>' }, { notes: 'x'.repeat(2001) }]) {
    assert.throws(() => normalizeWine(wine(overrides)), JSON.stringify(overrides));
  }
  assert.throws(() => normalizeWine(wine({ status: 'purchased', purchaseDate: '2026-02-30' })));
  assert.throws(() => normalizeWine(wine({ status: 'purchased', purchaseDate: '' })));
});
test('malformed or duplicate backup data is rejected', () => {
  for (const raw of ['', '{broken', 'null', '{}', '{"version":2,"wines":[]}', serializeCollection([wine(), wine()])]) assert.throws(() => parseCollection(raw));
});
test('import merges without replacing existing edits or creating duplicates', () => {
  const current = [wine({ notes: 'My latest note' })];
  const imported = [wine({ notes: 'Older note' }), wine({ id: 'new-id' })];
  const merged = mergeCollection(current, imported);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].notes, 'My latest note');
  assert.equal(current.length, 1);
});
test('storage errors propagate and invalid input never reaches storage', () => {
  let writes = 0;
  const storage = { setItem() { writes++; throw new Error('Quota exceeded'); } };
  assert.throws(() => saveCollection(storage, [wine({ quantity: 0 })]));
  assert.equal(writes, 0);
  assert.throws(() => saveCollection(storage, [wine()]), /Quota exceeded/);
  assert.equal(writes, 1);
});
test('search matches producer, region, vintage, and notes while respecting filters', () => {
  const wines = [wine(), wine({ id: 'white-wine', name: 'Chablis', producer: 'Another producer', type: 'White', status: 'purchased', purchaseDate: '2026-01-02', createdAt: '2026-01-03T12:00:00Z' })];
  assert.equal(filterWines(wines, { query: 'guigal' }).length, 1);
  assert.equal(filterWines(wines, { query: '2022', status: 'purchased', type: 'White' }).length, 1);
  assert.equal(filterWines(wines, { query: 'dinner', type: 'Red' }).length, 1);
  assert.equal(filterWines(wines, { query: 'missing' }).length, 0);
  assert.equal(filterWines(wines)[0].id, 'white-wine');
  assert.equal(filterWines(wines, { sort: 'name' })[0].name, 'Chablis');
  assert.equal(wines[0].id, 'test-wine-1');
});
test('user text is escaped for HTML and attribute contexts', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)"> & \'test\''), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;test&#39;');
});
