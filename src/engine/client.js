import { ENGINE_KEY, initialState, validateBackup } from './ingestion.js';
import { applyAction } from './actions.js';
import { BrowserEngineStore } from './browser-store.js';
export class EngineClient {
  constructor(storage = new BrowserEngineStore()) {
    this.storage = storage; this.mode = 'browser'; this.error = ''; this.base = ''; this.token = '';
    this.state = initialState(); this.loaded = false; this.actions = Promise.resolve(); this.ready = this.initialize();
  }
  async initialize() {
    try {
      let raw = await this.storage.getItem(ENGINE_KEY);
      const legacy = !raw && this.storage.browserDatabase ? this.storage.getLegacy() : null;
      raw ||= legacy; this.recoveryRaw = raw;
      this.state = raw ? validateBackup(raw) : initialState();
      if (legacy) {
        await this.storage.setItem(ENGINE_KEY, this.state, 0);
        // Remove only the old engine snapshot, after the new transaction commits.
        try { this.storage.removeLegacy(); } catch { /* A retained copy is harmless. */ }
      }
      this.recoveryRaw = null;
    } catch (error) {
      if (!this.recoveryRaw && this.storage.browserDatabase) { try { this.recoveryRaw = this.storage.getLegacy(); } catch {} }
      this.error = `Saved engine data could not be loaded or migrated. Imports and edits are blocked to protect it. Export a recovery backup before restoring. ${error.message}`; this.blocked = true;
    } finally { this.loaded = true; }
  }
  connect(base = `${import.meta.env.BASE_URL}api`, token = '') {
    const work = this.actions.then(() => this.performConnect(base, token));
    this.actions = work.catch(() => {}); return work;
  }
  async performConnect(base, token) {
    await this.ready;
    if (/^https?:/.test(base)) {
      const u = new URL(base);
      if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error('Remote engines require HTTPS.');
      if (u.username || u.password) throw new Error('Do not put credentials in the engine URL.');
    }
    const response = await fetch(base.replace(/\/$/, '') + '/engine', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Engine authentication required.' : `Engine unavailable (HTTP ${response.status}).`);
    const state = validateBackup(await response.json());
    this.base = base.replace(/\/$/, ''); this.token = token; this.mode = 'server'; this.state = state; this.blocked = false; this.error = '';
  }
  action(action) {
    const work = this.actions.then(() => this.performAction(action));
    this.actions = work.catch(() => {}); return work;
  }
  async performAction(action) {
    await this.ready;
    if (this.mode === 'browser') {
      if (this.blocked && action.type !== 'restore') throw new Error(this.error);
      const next = action.type === 'import' && typeof Worker !== 'undefined'
        ? await new Promise((resolve, reject) => {
          const worker = new Worker(new URL('./import-worker.js', import.meta.url), { type: 'module' });
          worker.onmessage = ({ data }) => { worker.terminate(); data.error ? reject(new Error(data.error)) : resolve(data.state); };
          worker.onerror = event => { worker.terminate(); reject(new Error(event.message || 'Import processing failed. Previous inventory is unchanged.')); };
          worker.postMessage({ state: this.state, action });
        }) : applyAction(this.state, action);
      try { await this.storage.setItem(ENGINE_KEY, next, this.blocked && action.type === 'restore' ? undefined : this.state.revision); }
      catch (error) {
        if (error.name === 'QuotaExceededError') throw new Error('Browser storage is full. Your previous saved inventory is unchanged. Export a backup and free device storage before retrying.');
        throw error;
      }
      if (this.storage.browserDatabase) { try { this.storage.removeLegacy(); } catch {} }
      this.state = next; this.recoveryRaw = null; this.blocked = false; this.error = ''; return;
    }
    const response = await fetch(this.base + '/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ action, expectedRevision: this.state.revision }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Engine update failed.');
    this.state = validateBackup(result);
  }
  async reload() { if (this.mode === 'server') await this.connect(this.base, this.token); }
  async research(wineId) {
    if (this.mode !== 'server') throw new Error('Automatic web research requires a connected engine. Use the browser search links below for now.');
    const response = await fetch(this.base + '/research', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ wineId }), signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Web research failed.');
    return result;
  }
  async critics(wineId, force = false) {
    if (this.mode !== 'server') throw new Error('Independent automatic lookup requires a connected engine and an approved critic feed. Use publication search links and add a verified review here.');
    const response = await fetch(this.base + '/critics', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ wineId, force }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Critic lookup failed.');
    await this.reload(); return result;
  }
  async vintages(wineId, force=false) {
    if(this.mode!=='server') throw new Error('Automatic vintage refresh requires a connected engine and an approved feed. Documented imports and stored assessments work in this browser.');
    const response=await fetch(this.base+'/vintages',{method:'POST',headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`}:{})},body:JSON.stringify({wineId,force})});
    const result=await response.json();
    if(!response.ok) throw new Error(result.error || 'Vintage refresh failed.');
    await this.reload(); return result;
  }
  async market(wineId,force=false) {
    if(this.mode!=='server') throw new Error('Automatic market refresh requires a connected engine and approved merchant or licensed feeds. Verified manual offers work on this device.');
    const response=await fetch(this.base+'/market',{method:'POST',headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`}:{})},body:JSON.stringify({wineId,force})});
    const result=await response.json();if(!response.ok) throw new Error(result.error || 'Market refresh failed.');await this.reload();return result;
  }
  async refresh() {
    if (this.mode !== 'server') throw new Error('Automatic retrieval requires a running engine service and an approved feed. Browser mode supports manual imports.');
    const response = await fetch(this.base + '/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify({ force: true }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Refresh failed.');
    await this.reload(); return result;
  }
}
