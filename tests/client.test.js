import test from 'node:test';
import assert from 'node:assert/strict';
import { EngineClient } from '../src/engine/client.js';
import { initialState } from '../src/engine/ingestion.js';

const action = price => ({ type: 'import', sourceId: 'flickinger', dataset: { rows: [{ name: 'Example Estate Reserve 2019 750ml', producer: 'Example Estate', vintage: 2019, price }] } });
function memoryStore() {
  return { state: null, async getItem() { return this.state; }, async setItem(key, state, revision) { assert.equal(this.state?.revision ?? 0, revision); this.state = structuredClone(state); } };
}
test('asynchronous browser edits serialize and retain both observations', async () => {
  const store = memoryStore(), client = new EngineClient(store);
  await Promise.all([client.action(action(80)), client.action(action(60))]);
  assert.equal(store.state.listings[0].price, 60); assert.equal(store.state.history.length, 2);
  assert.equal(client.state.revision, 2);
});
test('failed asynchronous saves leave the loaded and persisted dataset unchanged', async () => {
  const store = memoryStore(), client = new EngineClient(store);
  await client.action(action(80)); const before = JSON.stringify(client.state);
  store.setItem = async () => { throw new DOMException('Full', 'QuotaExceededError'); };
  await assert.rejects(client.action(action(60)), /Browser storage is full/);
  assert.equal(JSON.stringify(client.state), before); assert.equal(JSON.stringify(store.state), before);
});
test('connecting to a server waits for an in-flight browser save and preserves both datasets', async () => {
  const store = memoryStore(), client = new EngineClient(store); await client.ready;
  let release, begun; const waiting = new Promise(resolve => { release = resolve; }); const started = new Promise(resolve => { begun = resolve; });
  const save = store.setItem.bind(store); store.setItem = async (...args) => { begun(); await waiting; await save(...args); };
  const previousFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json(initialState()); };
  try {
    const edit = client.action(action(80)); await started;
    const connection = client.connect('https://engine.example/api');
    try { await Promise.resolve(); assert.equal(requests, 0); } finally { release(); }
    await Promise.all([edit, connection]);
    assert.equal(client.mode, 'server'); assert.equal(client.state.listings.length, 0);
    assert.equal(store.state.listings[0].price, 80);
  } finally { globalThis.fetch = previousFetch; release(); }
});
