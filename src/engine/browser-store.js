import { ENGINE_KEY } from './ingestion.js';

// IndexedDB has substantially more capacity than the small localStorage quota.
// Keep the whole snapshot transactional, including inventory and its history.
export class BrowserEngineStore {
  constructor() { this.browserDatabase = true; this.database = null; }
  open() {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('wine-intelligence', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('engine');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other wine-app tabs and reload to open browser storage.'));
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
    }).catch(error => { this.database = null; throw error; });
    return this.database;
  }
  async getItem(key = ENGINE_KEY) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('engine', 'readonly'), request = transaction.objectStore('engine').get(key);
      transaction.oncomplete = () => resolve(request.result ?? null);
      transaction.onabort = () => reject(transaction.error || new Error('Browser storage read failed.'));
      transaction.onerror = () => {};
    });
  }
  async setItem(key, state, expectedRevision) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('engine', 'readwrite'), store = transaction.objectStore('engine');
      let failure;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure || transaction.error || new Error('Browser storage write failed.'));
      transaction.onerror = () => {};
      const current = store.get(key);
      current.onsuccess = () => {
        if (expectedRevision != null && (current.result?.revision ?? 0) !== expectedRevision) {
          failure = new Error('Inventory changed in another tab. Reload this page before trying again.'); transaction.abort(); return;
        }
        try { store.put(state, key); } catch (error) { failure = error; transaction.abort(); }
      };
    });
  }
  getLegacy() { return localStorage.getItem(ENGINE_KEY); }
  removeLegacy() { localStorage.removeItem(ENGINE_KEY); }
}
