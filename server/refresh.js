import { ingestDataset } from '../src/engine/ingestion.js';
import { sourceStatus } from '../src/engine/sources.js';
import { JSONFeedAdapter } from './adapters.js';
export class RefreshService {
  constructor(database, { adapter = new JSONFeedAdapter(), env = process.env, clock = () => new Date() } = {}) { this.database = database; this.adapter = adapter; this.env = env; this.clock = clock; this.running = false; }
  async run(force = false, category = null) {
    if (this.running) return { skipped: 'Refresh already running' };
    this.running = true;
    const outcomes = [];
    try {
      const candidates = this.database.load().sources;
      for (const s of candidates) {
        const now = this.clock();
        if ((category && s.category !== category) || !s.enabled || s.method !== 'json' || !s.accessApproved || !s.url || (!force && s.nextDue && Date.parse(s.nextDue) > +now)) continue;
        try {
          const result = await this.adapter.fetch(s, this.env, now);
          let state = this.database.load();
          const current = state.sources.find(x => x.id === s.id);
          if (!current?.enabled || current.url !== s.url || current.method !== s.method || !current.accessApproved) { outcomes.push({ sourceId: s.id, status: 'Configuration changed; response discarded' }); continue; }
          if (!result.notModified) state = ingestDataset(state, s.id, result.dataset, now.toISOString());
          const source = state.sources.find(x => x.id === s.id);
          Object.assign(source, { etag: result.etag, lastModified: result.lastModified, lastChecked: now.toISOString(), lastSuccess: now.toISOString(), nextDue: new Date(+now + source.refreshHours * 3600000).toISOString(), failures: 0, error: '', status: 'Active' });
          if (result.notModified) {
            state.runs.push({ id: crypto.randomUUID(), sourceId: s.id, at: now.toISOString(), status: 'not_modified', count: 0 });
            // A 304 proves transport freshness, not a newer price or inventory observation.
            state.revision++;
          }
          this.database.save(state);
          outcomes.push({ sourceId: s.id, status: result.notModified ? 'Not modified' : 'Refreshed' });
        } catch (error) {
          const state = this.database.load(), source = state.sources.find(x => x.id === s.id);
          if (!source || !source.enabled) continue;
          source.failures++; source.error = error.authRequired ? 'Authentication Required' : error.message.replace(/https?:\/\/\S+/g, '[endpoint]');
          source.status = error.authRequired ? 'Authentication Required' : 'Error'; source.lastChecked = now.toISOString();
          source.nextDue = new Date(+now + Math.min(24, Math.pow(2, source.failures - 1)) * 3600000).toISOString();
          state.runs.push({ id: crypto.randomUUID(), sourceId: s.id, at: now.toISOString(), status: source.status, error: source.error }); state.revision++;
          this.database.save(state); outcomes.push({ sourceId: s.id, status: source.status, error: source.error });
        }
      }
    } finally { this.running = false; }
    return { outcomes };
  }
  start(intervalMs = 60000) { this.timer = setInterval(() => this.run().catch(error => console.error('Refresh persistence failure:', error.message)), intervalMs); this.timer.unref(); return this; }
  stop() { clearInterval(this.timer); }
}
