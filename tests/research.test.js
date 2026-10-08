import test from 'node:test';
import assert from 'node:assert/strict';
import { wineSearchQuery, browserSearchLinks } from '../src/engine/research.js';
import { identifyWine } from '../src/engine/identity.js';
import { WebResearchService } from '../server/research.js';
import { createEngineServer } from '../server/index.js';
import { EngineDatabase } from '../server/database.js';
import { ingestDataset } from '../src/engine/ingestion.js';

const row = { name: 'Example Estate Reserve 2019 6x750ml OWC', producer: 'Example Estate', cuvee: 'Reserve', price: 480, quantity: 3 };
const wine = identifyWine(row);
test('web search preserves wine vintage, bottle and package identity and excludes Wine-Searcher', () => {
  const query = wineSearchQuery(wine);
  for (const text of ['Example Estate', 'Reserve', '2019', '750ml', '6 bottles', 'original wooden case', '-site:wine-searcher.com']) assert.ok(query.includes(text));
  const magnum = wineSearchQuery(identifyWine({ ...row, name: 'Example Estate Reserve 2019 1.5L' }));
  assert.ok(magnum.includes('1500ml')); assert.ok(!magnum.includes('6 bottles'));
  const long = wineSearchQuery({ ...wine, producer: 'X'.repeat(250), cuvee: 'Y'.repeat(250) });
  assert.ok(long.length <= 400); assert.ok(long.includes('2019 750ml 6 bottles')); assert.ok(long.endsWith('-site:wine-searcher.com'));
  for (const link of browserSearchLinks('Wine & "test"')) assert.equal(new URL(link.url).searchParams.get('q'), 'Wine & "test"');
});
test('missing search credential never makes a network request or fabricates results', async () => {
  const service = new WebResearchService({ env: {}, request: () => { throw new Error('Unexpected request'); } });
  const result = await service.search(wine);
  assert.equal(result.status, 'configuration-required'); assert.deepEqual(result.results, []);
});
test('provider research deduplicates concurrent searches, caches with original time, and returns only unverified safe leads', async () => {
  let clock = Date.parse('2026-10-07T02:00:00Z'), calls = 0;
  const service = new WebResearchService({ env: { WINE_ENABLE_PAID_SEARCH:'true', BRAVE_SEARCH_API_KEY: 'test-only-key' }, clock: () => clock, request: async (url, headers) => {
    calls++; assert.equal(new URL(url).hostname, 'api.search.brave.com'); assert.equal(headers['X-Subscription-Token'], 'test-only-key');
    assert.equal(new URL(url).searchParams.get('q'), wineSearchQuery(wine));
    return { status: 200, text: JSON.stringify({ web: { results: [
      { title: 'Candidate $99', url: 'https://retailer.example/wine', description: 'May be the wrong size or vintage.' },
      { url: 'https://retailer.example/wine' }, { url: 'javascript:alert(1)' }, { url: 'https://secret@example.com/' }, { url: 'https://www.wine-searcher.com/find/wine' },
    ] } }) };
  } });
  const [first, concurrent] = await Promise.all([service.search(wine), service.search(wine)]);
  assert.equal(calls, 1); assert.deepEqual(first, concurrent); assert.equal(first.results.length, 1);
  assert.equal(first.results[0].verification, 'unverified'); assert.equal(first.results[0].price, undefined);
  clock += 3600000; const cached = await service.search(wine);
  assert.equal(cached.cached, true); assert.equal(cached.retrievedAt, first.retrievedAt); assert.equal(calls, 1);
  clock += 6 * 3600000; await service.search(wine); assert.equal(calls, 2);
});
test('provider errors hide credentials, quota and global request limits are enforced', async () => {
  const env = { WINE_ENABLE_PAID_SEARCH:'true', BRAVE_SEARCH_API_KEY: 'test-only-key' };
  await assert.rejects(() => new WebResearchService({ env, request: async () => { throw new Error(env.BRAVE_SEARCH_API_KEY); } }).search(wine), error => !error.message.includes(env.BRAVE_SEARCH_API_KEY));
  for (const status of [401, 403, 429, 500]) await assert.rejects(() => new WebResearchService({ env, request: async () => ({ status }) }).search(wine));
  await assert.rejects(() => new WebResearchService({ env, request: async () => ({ status: 200, text: '{}' }) }).search(wine), /valid web/);
  const service = new WebResearchService({ env, clock: () => 1000, request: async () => ({ status: 200, text: '{"web":{"results":[]}}' }) });
  await service.search(wine);
  await assert.rejects(() => service.search({ ...wine, vintage: 2020 }), /Search limit/);
});
test('research HTTP route authenticates and resolves stored inventory without modifying market, history or revision', async () => {
  const db = new EngineDatabase(':memory:'); db.save(ingestDataset(db.load(), 'flickinger', { rows: [row] }));
  const before = JSON.stringify(db.load()), id = db.load().listings[0].wineId;
  let calls = 0; const app = createEngineServer({ database: db, token: 'test-token', research: { search: async w => { calls++; assert.equal(w.id, id); return { status: 'ok', results: [] }; } } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}/api/research`;
  try {
    assert.equal((await fetch(base, { method: 'POST' })).status, 401);
    const post = wineId => fetch(base, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ wineId }) });
    assert.equal((await post('missing')).status, 404); assert.equal(calls, 0);
    assert.equal((await post(id)).status, 200); assert.equal(calls, 1); assert.equal(JSON.stringify(db.load()), before);
  } finally { await new Promise(resolve => app.server.close(resolve)); db.close(); }
});
