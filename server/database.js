import { ensureVintageSources } from '../src/engine/sources.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initialState } from '../src/engine/ingestion.js';

const tables = { wines: 'wines', listings: 'inventory_listings', market: 'market_observations', reviews: 'critic_reviews', vintages: 'vintage_assessments', history: 'inventory_history', scoreHistory: 'opportunity_history', runs: 'import_runs' };
export class EngineDatabase {
  constructor(file = '.local/wine-engine.sqlite') {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, data TEXT NOT NULL);');
    for (const table of Object.values(tables)) this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, wine_id TEXT, source_id TEXT, observed_at TEXT, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS ${table}_wine ON ${table}(wine_id, observed_at); CREATE INDEX IF NOT EXISTS ${table}_source ON ${table}(source_id, observed_at);`);
    if (!this.db.prepare("SELECT key FROM metadata WHERE key='settings'").get()) this.save(initialState());
  }
  load() {
    const state = JSON.parse(this.db.prepare("SELECT data FROM metadata WHERE key='settings'").get().data);
    for (const [key, table] of Object.entries(tables)) {
      const records = this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map(r => JSON.parse(r.data));
      state[key] = key === 'wines' ? Object.fromEntries(records.map(w => [w.id, w])) : records;
    }
    return ensureVintageSources(state);
  }
  save(state) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const settings = { ...state };
      for (const [key, table] of Object.entries(tables)) {
        delete settings[key];
        this.db.exec(`DELETE FROM ${table}`);
        const insert = this.db.prepare(`INSERT INTO ${table}(id,wine_id,source_id,observed_at,data) VALUES (?,?,?,?,?)`);
        const rows = key === 'wines' ? Object.values(state[key]) : state[key];
        for (const [i, row] of rows.entries()) insert.run(['history', 'scoreHistory'].includes(key) ? `${i}` : row.id, row.wineId ?? row.id ?? null, row.sourceId ?? null, row.observedAt ?? row.at ?? null, JSON.stringify(row));
      }
      this.db.prepare("INSERT INTO metadata(key,data) VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(settings));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
