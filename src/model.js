export const STORAGE_KEY = 'wine-journal.v1';
export const TYPES = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Fortified', 'Other'];
export const CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'NZD', 'ZAR', 'JPY', 'INR'];
export const MAX_WINES = 5000;

export function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function text(value, label, max, required = false) {
  if (value != null && typeof value !== 'string') throw new Error(`${label} must be text.`);
  const clean = (value ?? '').trim();
  if (required && !clean) throw new Error(`Please enter ${label.toLowerCase()}.`);
  if (clean.length > max) throw new Error(`${label} is too long (maximum ${max} characters).`);
  return clean;
}

function numeric(value, label) {
  if (!['string', 'number'].includes(typeof value) || (typeof value === 'string' && !value.trim())) {
    throw new Error(`${label} must be a number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
  return number;
}

export function normalizeWine(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('This is not a valid wine record.');
  const id = text(input.id, 'Wine ID', 80, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('This wine has an invalid ID.');
  const name = text(input.name, 'Wine name', 120, true);
  if (!TYPES.includes(input.type)) throw new Error('Please choose a wine type.');
  if (!['wishlist', 'purchased'].includes(input.status)) throw new Error('Please choose a valid list.');
  if (!CURRENCIES.includes(input.currency)) throw new Error('Please choose a supported currency.');
  let vintage = null;
  if (input.vintage !== '' && input.vintage != null) {
    vintage = numeric(input.vintage, 'Vintage');
    if (!Number.isInteger(vintage) || vintage < 1800 || vintage > new Date().getFullYear() + 1) throw new Error('Please enter a valid vintage year.');
  }
  let price = null;
  if (input.price !== '' && input.price != null) {
    price = numeric(input.price, 'Price');
    if (price < 0 || price > 10000000) throw new Error('Price must be between 0 and 10,000,000.');
    price = Math.round(price * 100) / 100;
  }
  const quantity = numeric(input.quantity, 'Bottle count');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error('Bottle count must be a whole number between 1 and 9,999.');
  const purchaseDate = input.status === 'purchased' ? text(input.purchaseDate, 'Purchase date', 10, true) : '';
  if (purchaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) || !Number.isFinite(Date.parse(purchaseDate)) || new Date(purchaseDate).toISOString().slice(0, 10) !== purchaseDate)) {
    throw new Error('Please enter a valid purchase date.');
  }
  const createdAt = text(input.createdAt, 'Date added', 40, true);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('This wine has an invalid date added.');
  return { id, name, producer: text(input.producer, 'Producer', 120), vintage, type: input.type,
    region: text(input.region, 'Region', 120), status: input.status, price, currency: input.currency,
    quantity, purchaseDate, notes: text(input.notes, 'Notes', 2000), createdAt };
}

export function parseCollection(raw) {
  if (raw === null) return [];
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('This data could not be read. Please use a Wine Journal JSON backup.'); }
  if (!data || data.version !== 1 || !Array.isArray(data.wines)) throw new Error('Please choose a Wine Journal backup file.');
  if (data.wines.length > MAX_WINES) throw new Error(`A collection can contain up to ${MAX_WINES.toLocaleString()} wines.`);
  const wines = data.wines.map(normalizeWine);
  if (new Set(wines.map(w => w.id)).size !== wines.length) throw new Error('The backup contains duplicate wine IDs.');
  return wines;
}

export function serializeCollection(wines) {
  return JSON.stringify({ version: 1, wines }, null, 2);
}

export function saveCollection(storage, wines) {
  // Validate before writing. A failed write must never become an apparent save.
  const serialized = serializeCollection(wines);
  parseCollection(serialized);
  storage.setItem(STORAGE_KEY, serialized);
}

export function mergeCollection(current, imported) {
  const existing = new Set(current.map(w => w.id));
  const merged = [...current, ...imported.filter(w => !existing.has(w.id))];
  if (merged.length > MAX_WINES) throw new Error(`A collection can contain up to ${MAX_WINES.toLocaleString()} wines.`);
  return merged;
}

export function filterWines(wines, { status = 'all', query = '', type = 'all', sort = 'newest' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  const result = wines.filter(w => (status === 'all' || w.status === status)
    && (type === 'all' || w.type === type)
    && [w.name, w.producer, w.region, w.vintage ?? '', w.notes].join(' ').toLocaleLowerCase().includes(term));
  return result.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
