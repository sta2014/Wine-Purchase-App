import {ensureVintageSources} from '../src/engine/sources.js';
import {migrateQuality} from '../src/engine/quality-settings.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {initialState} from '../src/engine/ingestion.js';
const tables={wines:'wines',listings:'inventory_listings',reviews:'critic_reviews',vintages:'vintage_assessments',history:'inventory_history',scoreHistory:'quality_history',runs:'import_runs'};
export class EngineDatabase {
  constructor(file='.local/wine-engine.sqlite') {
    if(file!==':memory:')mkdirSync(dirname(file),{recursive:true});
    this.db=new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,data TEXT NOT NULL);');
    const saved=this.db.prepare("SELECT data FROM metadata WHERE key='settings'").get();
    if(saved && JSON.parse(saved.data).qualityModelVersion!==2){
      // Capture a recoverable entire database before removing dedicated pricing tables.
      if(file!==':memory:'){this.backupFile=`${file}.before-quality-${Date.now()}.sqlite`;this.db.exec(`VACUUM INTO '${this.backupFile.replaceAll("'","''")}'`);}
      const archive={settings:JSON.parse(saved.data),tables:{}};
      for(const {name} of this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name<>'metadata'").all())archive.tables[name]=this.db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}"`).all();
      this.db.exec('BEGIN IMMEDIATE');
      try {
        this.db.prepare("INSERT OR IGNORE INTO metadata VALUES ('before-quality-backup',?)").run(JSON.stringify(archive));
        const state=JSON.parse(saved.data);state.reviews=this.db.prepare('SELECT data FROM critic_reviews').all().map(r=>JSON.parse(r.data));state.runs=this.db.prepare('SELECT data FROM import_runs').all().map(r=>JSON.parse(r.data));state.scoreHistory=[];
        migrateQuality(state);
        for(const [key,table] of [['reviews','critic_reviews'],['runs','import_runs']]){
          this.db.exec(`DELETE FROM ${table}`);
          const insert=this.db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?)`);
          for(const row of state[key])insert.run(row.id,row.wineId ?? null,row.sourceId ?? null,row.observedAt ?? row.at ?? null,JSON.stringify(row));
        }
        delete state.reviews;delete state.runs;delete state.scoreHistory;
        this.db.prepare("UPDATE metadata SET data=? WHERE key='settings'").run(JSON.stringify(state));
        for(const table of ['market_observations','retailer_registry','search_jobs','retrieval_failures','historical_market_prices','opportunity_history'])this.db.exec(`DROP TABLE IF EXISTS ${table}`);
        this.db.exec('COMMIT');
      }catch(e){this.db.exec('ROLLBACK');throw e;}
    }
    for(const table of Object.values(tables))this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY,wine_id TEXT,source_id TEXT,observed_at TEXT,data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS ${table}_wine ON ${table}(wine_id,observed_at); CREATE INDEX IF NOT EXISTS ${table}_source ON ${table}(source_id,observed_at);`);
    if(!saved)this.save(initialState());
  }
  load(){
    const state=JSON.parse(this.db.prepare("SELECT data FROM metadata WHERE key='settings'").get().data);
    for(const [key,table] of Object.entries(tables)){const rows=this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map(r=>JSON.parse(r.data));state[key]=key==='wines'?Object.fromEntries(rows.map(w=>[w.id,w])):rows;}
    state.runs=state.runs.filter(r=>!String(r.category || '').includes('market'));for(const r of state.runs)delete r.marketResearch;
    return ensureVintageSources(state);
  }
  save(state){
    this.db.exec('BEGIN IMMEDIATE');
    try{const settings={...state};for(const [key,table] of Object.entries(tables)){delete settings[key];this.db.exec(`DELETE FROM ${table}`);const insert=this.db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?)`);const rows=key==='wines'?Object.values(state[key]):state[key];for(const [i,row] of rows.entries())insert.run(['history','scoreHistory'].includes(key)?String(i):row.id,row.wineId ?? row.id ?? null,row.sourceId ?? null,row.observedAt ?? row.at ?? null,JSON.stringify(row));}this.db.prepare("INSERT INTO metadata VALUES ('settings',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(settings));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  close(){this.db.close();}
}
