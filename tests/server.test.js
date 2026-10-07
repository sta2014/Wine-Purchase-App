import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EngineDatabase } from '../server/database.js';
import { RefreshService } from '../server/refresh.js';
import { JSONFeedAdapter, credentialAvailable, isPublicAddress, robotsAllowed } from '../server/adapters.js';
import { createEngineServer } from '../server/index.js';
import { ingestDataset, initialState } from '../src/engine/ingestion.js';
const at = new Date('2026-10-06T12:00:00Z');
const sample = { name: 'Example Estate Reserve 2019 750ml', producer: 'Example Estate', cuvee: 'Reserve', vintage: 2019, bottle_ml: 750, price: 80, quantity: 3 };

test('SQLite persists listings and immutable observations across process-style reopen, and rolls back failed writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wine-db-')); const file = join(dir, 'engine.sqlite');
  let db = new EngineDatabase(file);
  const state = ingestDataset(db.load(), 'flickinger', { rows: [sample] }, at.toISOString()); db.save(state); db.close();
  db = new EngineDatabase(file); assert.equal(db.load().listings[0].price, 80); assert.equal(db.load().history.length, 1);
  const broken = structuredClone(state); broken.listings.push(broken.listings[0]); assert.throws(() => db.save(broken)); assert.equal(db.load().listings.length, 1);
  db.close(); rmSync(dir, { recursive: true });
});
test('refresh TTLs skip static review data while prices refresh; 304 retains timestamps and history', async () => {
  const db = new EngineDatabase(':memory:'); const state = db.load();
  for (const id of ['flickinger', 'critic-import']) Object.assign(state.sources.find(s => s.id === id), { method: 'json', url: 'https://feed.example/' + id, accessApproved: true, nextDue: null });
  db.save(state); let clock = at; const calls = [];
  const adapter = { async fetch(source) { calls.push(source.id); return source.id === 'flickinger' && calls.filter(id => id === 'flickinger').length === 1 ? { dataset: { rows: [sample] }, etag: 'v1', lastModified: '' } : { notModified: true, etag: 'v1', lastModified: '' }; } };
  const refresh = new RefreshService(db, { adapter, clock: () => clock });
  await refresh.run(); assert.deepEqual(calls, ['flickinger', 'critic-import']);
  const observedAt = db.load().listings[0].observedAt;
  clock = new Date(+at + 7 * 3600000); await refresh.run(); assert.deepEqual(calls, ['flickinger', 'critic-import', 'flickinger']);
  assert.equal(db.load().listings[0].observedAt, observedAt); assert.equal(db.load().history.length, 1); assert.equal(db.load().sources[0].etag, 'v1');
  db.close();
});
test('refresh authentication failure sets status, backs off, and preserves previous inventory', async () => {
  const db = new EngineDatabase(':memory:'); const state = ingestDataset(db.load(), 'flickinger', { rows: [sample] }, at.toISOString());
  Object.assign(state.sources[0], { method: 'json', accessApproved: true, url: 'https://feed.example/inventory', nextDue: null }); db.save(state);
  const refresh = new RefreshService(db, { clock: () => at, adapter: { async fetch() { const error = new Error('Denied'); error.authRequired = true; throw error; } } });
  await refresh.run(); assert.equal(db.load().sources[0].status, 'Authentication Required'); assert.equal(db.load().listings.length, 1); assert.ok(Date.parse(db.load().sources[0].nextDue) > +at);
  db.close();
});
test('concurrent refreshes are deduplicated and disabled sources never fetch', async () => {
  const db = new EngineDatabase(':memory:'); const state = db.load();
  Object.assign(state.sources[0], { method: 'json', accessApproved: true, url: 'https://feed.example/inventory' }); db.save(state);
  let release; const waiting = new Promise(resolve => { release = resolve; }); let calls = 0;
  const refresh = new RefreshService(db, { adapter: { async fetch() { calls++; await waiting; return { dataset: { rows: [sample] } }; } }, clock: () => at });
  const first = refresh.run(); assert.equal((await refresh.run()).skipped, 'Refresh already running'); release(); await first; assert.equal(calls, 1); db.close();
});
test('adapter obeys robots, conditional requests, access approval, and exact credential-host bindings', async () => {
  const source = { ...initialState().sources[0], method: 'json', accessApproved: true, url: 'https://feed.example/inventory', etag: 'cached-v1' };
  const calls = [];
  const adapter = new JSONFeedAdapter(async (url, headers) => { calls.push({ url, headers }); return url.endsWith('robots.txt') ? { status: 200, text: 'User-agent: *\nDisallow: /private\n', headers: {} } : { status: 304, text: '', headers: { etag: 'cached-v1' } }; });
  const result = await adapter.fetch(source, {}, at); assert.equal(result.notModified, true); assert.equal(calls[1].headers['If-None-Match'], 'cached-v1');
  await assert.rejects(() => adapter.fetch({ ...source, url: 'https://feed.example/private' }, {}, at), /robots/);
  await assert.rejects(() => adapter.fetch({ ...source, accessApproved: false }, {}, at));
  const authenticated = { ...source, authEnv: 'FEED_TOKEN' };
  assert.equal(credentialAvailable(authenticated, { FEED_TOKEN: 'dummy', WINE_SOURCE_CREDENTIAL_HOSTS: '{"FEED_TOKEN":["different.example"]}' }), false);
  assert.equal(credentialAvailable(authenticated, { FEED_TOKEN: 'dummy', WINE_SOURCE_CREDENTIAL_HOSTS: '{"FEED_TOKEN":["feed.example"]}' }), true);
  await assert.rejects(() => adapter.fetch(authenticated, { FEED_TOKEN: 'dummy' }, at), /bound/);
});
test('private/reserved addresses and robots longest-path rules are enforced', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '172.16.0.1', '::1', '::ffff:127.0.0.1', 'fd00::1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true); assert.equal(isPublicAddress('2606:4700::1111'), true);
  const robots = 'User-agent: *\nDisallow: /\nAllow: /export/\nDisallow: /export/private';
  assert.equal(robotsAllowed(robots, '/export/inventory.json'), true); assert.equal(robotsAllowed(robots, '/export/private/a'), false);
  assert.equal(robotsAllowed('User-agent: WineJournalBot\nDisallow: /\nUser-agent: *\nAllow: /', '/a'), false);
});
test('actual HTTP API authenticates, rejects origins and revision conflicts, and persists imports', async () => {
  const db = new EngineDatabase(':memory:'); const app = createEngineServer({ database: db, token: 'test-only-token', origins: ['https://allowed.example'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + app.server.address().port;
  try {
    assert.equal((await fetch(base + '/api/engine')).status, 401);
    assert.equal((await fetch(base + '/api/engine', { headers: { Authorization: 'Bearer test-only-token', Origin: 'https://evil.example' } })).status, 403);
    const headers = { Authorization: 'Bearer test-only-token', 'Content-Type': 'application/json' };
    let response = await fetch(base + '/api/action', { method: 'POST', headers, body: JSON.stringify({ expectedRevision: 0, action: { type: 'import', sourceId: 'flickinger', dataset: { rows: [sample] } } }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).listings[0].price, 80);
    response = await fetch(base + '/api/action', { method: 'POST', headers, body: JSON.stringify({ expectedRevision: 0, action: { type: 'import', sourceId: 'flickinger', dataset: { rows: [] } } }) });
    assert.equal(response.status, 409); assert.equal(db.load().history.length, 1);
  } finally { await new Promise(resolve => app.server.close(resolve)); db.close(); }
});
test('robots crawl-delay defers requests to the same host instead of over-fetching', async () => {
  const source = { ...initialState().sources[0], method: 'json', accessApproved: true, url: 'https://feed.example/inventory' };
  let requests = 0;
  const adapter = new JSONFeedAdapter(async url => { requests++; return url.endsWith('/robots.txt') ? { status: 200, text: 'User-agent: *\nCrawl-delay: 10', headers: {} } : { status: 304, text: '', headers: {} }; });
  await assert.rejects(() => adapter.fetch(source, {}, at), /crawl-delay/);
  assert.equal(requests, 1);
  await adapter.fetch(source, {}, new Date(+at + 11000)); assert.equal(requests, 2);
  await assert.rejects(() => adapter.fetch(source, {}, new Date(+at + 12000)), /crawl-delay/);
  assert.equal(requests, 2);
});
