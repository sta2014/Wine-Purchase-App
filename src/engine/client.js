import { ENGINE_KEY, initialState, validateBackup } from './ingestion.js';
import { applyAction } from './actions.js';
export class EngineClient {
  constructor(storage = localStorage) {
    this.storage = storage; this.mode = 'browser'; this.error = ''; this.base = ''; this.token = '';
    try { const raw = storage.getItem(ENGINE_KEY); this.state = raw ? validateBackup(raw) : initialState(); }
    catch { this.state = initialState(); this.error = 'Saved engine data cannot be read. Export a recovery copy before restoring a valid backup. Imports and edits are blocked to protect existing data.'; this.blocked = true; }
  }
  async connect(base = `${import.meta.env.BASE_URL}api`, token = '') {
    if (/^https?:/.test(base)) {
      const u = new URL(base);
      if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Remote engines require HTTPS.');
      if (u.username || u.password) throw new Error('Do not put credentials in the engine URL.');
    }
    const response = await fetch(base.replace(/\/$/, '') + '/engine', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Engine authentication required.' : `Engine unavailable (HTTP ${response.status}).`);
    const state = validateBackup(await response.json());
    this.base = base.replace(/\/$/, ''); this.token = token; this.mode = 'server'; this.state = state;
  }
  async action(action) {
    if (this.mode === 'browser') {
      if (this.blocked && action.type !== 'restore') throw new Error(this.error);
      const next = applyAction(this.state, action);
      this.storage.setItem(ENGINE_KEY, JSON.stringify(next));
      this.state = next; this.blocked = false; this.error = ''; return;
    }
    const response = await fetch(this.base + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ action, expectedRevision: this.state.revision }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Engine update failed.');
    this.state = validateBackup(result);
  }
  async reload() { if (this.mode === 'server') await this.connect(this.base, this.token); }
  async refresh() {
    if (this.mode !== 'server') throw new Error('Automatic retrieval requires a running engine service and an approved feed. Browser mode supports manual imports.');
    const response = await fetch(this.base + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ force: true }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Refresh failed.');
    await this.reload(); return result;
  }
}
