import { identifyWine, number, packageSummary } from './identity.js';
import { identifyListings } from './listings.js';
import { defaultSources, validateSource, STATUSES } from './sources.js';
import { rankInventory, validatePreferences } from './ranking.js';
export const ENGINE_KEY = 'wine-intelligence.v1';
export const DEFAULT_WEIGHTS = { value: 35, quality: 35, vintage: 10, window: 10, confidence: 10 };
export function initialState() {
  return { schemaVersion: 1, revision: 0, sources: defaultSources(), wines: {}, listings: [], market: [], reviews: [], vintages: [], history: [], scoreHistory: [], runs: [], decisions: {}, preferences: { weights: { ...DEFAULT_WEIGHTS }, marketMaxAgeHours: 48, inventoryMaxAgeHours: 48, matchThreshold: .95, preferredRegions: [] } };
}
const header = s => String(s).trim().toLowerCase().replace(/[\s\/-]+/g, '_');
const ALIASES = { wine_name: 'raw_title', wine: 'raw_title', name: 'raw_title', title: 'raw_title', vintage_year: 'vintage', size_ml: 'bottle_ml', bottle_size_ml: 'bottle_ml', bottle_size: 'format', size: 'format', pack_size: 'pack_count', bottle_count: 'pack_count', quantity: 'available_quantity', available: 'available_quantity', asking_price: 'price', askingprice: 'price', score_scale: 'scale', drinking_start: 'drink_from', drinking_end: 'drink_to', url: 'source_url', sku: 'external_id', color: 'type', colour: 'type', wine_type: 'type' };
export function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field) quoted = !quoted;
      else throw new Error('Unexpected quote in CSV.');
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(f => f.trim())) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  row.push(field); if (row.some(f => f.trim())) rows.push(row);
  if (!rows.length) throw new Error('The CSV is empty.');
  const keys = rows.shift().map(k => ALIASES[header(k)] ?? header(k));
  if (new Set(keys).size !== keys.length || keys.some(k => !k)) throw new Error('CSV column names must be nonempty and unique.');
  if (!rows.length) throw new Error('No data rows found; empty inventory must use an explicit complete JSON snapshot.');
  return rows.map((r, i) => { if (r.length !== keys.length) throw new Error(`CSV row ${i + 2} has ${r.length} fields; expected ${keys.length}.`); return Object.fromEntries(keys.map((k, j) => [k, r[j]])); });
}
export function parseDataset(text) {
  if (text.length > 10 * 1024 * 1024) throw new Error('Import exceeds 10 MB.');
  if (/^\s*[\[{]/.test(text)) {
    const value = JSON.parse(text);
    const rows = Array.isArray(value) ? value : value.rows;
    if (!Array.isArray(rows)) throw new Error('JSON needs an array or an object containing rows.');
    return { rows, completeSnapshot: !Array.isArray(value) && value.completeSnapshot === true };
  }
  return { rows: parseCSV(text), completeSnapshot: false };
}
export function safeURL(value) {
  if (!value) return '';
  const u = new URL(String(value));
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Provenance URL must be HTTP(S), without credentials.');
  return u.href;
}
const stamp = (value, now) => {
  const ms = value ? Date.parse(value) : Date.parse(now);
  if (!Number.isFinite(ms) || ms > Date.parse(now) + 5 * 60000) throw new Error('Observation date is invalid or in the future.');
  return new Date(ms).toISOString();
};
export function normalizeRow(raw, kind, source, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each row must be an object.');
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [ALIASES[header(k)] ?? header(k), v]));
  const observedAt = stamp(r.observed_at, now);
  const provenance = { sourceId: source.id, sourceName: source.name, sourceURL: safeURL(r.source_url), retrievedAt: now, observedAt, rawTitle: String(r.raw_title ?? ''), confidence: number(r.confidence ?? 1, 'Data confidence', { min: 0, max: 1 }), warnings: [] };
  if (kind === 'vintage') {
    const region = String(r.region ?? '').trim(), type = String(r.type ?? '').trim();
    if (!region || !type) throw new Error('Vintage assessments require region and wine type.');
    const scale = number(r.scale ?? 100, 'Vintage scale', { min: 1, max: 100 });
    return { ...provenance, region, type, vintage: number(r.vintage, 'Vintage', { min: 1800, max: new Date().getFullYear() + 1, integer: true }), score: number(r.score, 'Vintage score', { min: 0, max: scale }), scale, notes: String(r.notes ?? '').slice(0, 2000) };
  }
  const wine = identifyWine(r);
  provenance.rawTitle = wine.rawTitle;
  provenance.warnings = [...wine.warnings];
  const base = { ...provenance, wine, wineId: wine.id, bottleMl: wine.bottleMl, packCount: wine.packCount, packaging: wine.packaging, ...packageSummary(wine) };
  if (['inventory', 'market'].includes(kind)) {
    const currency = String(r.currency ?? 'USD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency requires a three-letter code.');
    if (!Intl.supportedValuesOf('currency').includes(currency)) throw new Error('Invalid currency.');
    const basis = r.price_basis || 'package';
    if (!['package', 'bottle'].includes(basis)) throw new Error('price_basis must be package or bottle.');
    const price = number(r.price ?? r.unit_price, 'Price', { min: .01, max: 1e8 });
    const packagePrice = basis === 'bottle' || (r.price == null && r.unit_price != null) ? price * wine.packCount : price;
    const unitPrice = packagePrice / wine.packCount;
    const availableQuantity = number(r.available_quantity, 'Available packages', { min: 0, max: 1e6, integer: true, optional: true });
    const isAvailable = r.is_available === false || String(r.is_available).toLowerCase() === 'false' || availableQuantity === 0 ? false : true;
    const priceTerms = String(r.price_terms ?? 'unspecified').toLowerCase();
    if (!['unspecified', 'ex_tax', 'tax_included', 'landed'].includes(priceTerms)) throw new Error('Unknown price_terms.');
    if (priceTerms === 'unspecified') base.warnings.push('Taxes/shipping terms unspecified; comparison is indicative, not executable arbitrage.');
    const saleType = String(r.sale_type ?? 'retail');
    if (!['retail', 'auction'].includes(saleType)) throw new Error('sale_type must be retail or auction.');
    return { ...base, price: packagePrice, unitPrice, pricePer750: unitPrice * 750 / wine.bottleMl, currency, availableQuantity, isAvailable, priceTerms, saleType, merchant: String(r.merchant ?? source.name).slice(0, 150), externalId: String(r.external_id ?? '').trim().slice(0, 150) };
  }
  if (['critic', 'community'].includes(kind)) {
    const critic = String(r.critic ?? r.publication ?? '').trim();
    if (!critic) throw new Error('Review critic/publication is required.');
    const scale = number(r.scale ?? 100, 'Score scale', { min: 1, max: 100 });
    const scoreText = String(r.score ?? '');
    const range = scoreText.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
    const score = r.score === '' || r.score == null ? null : number(range ? range[1] : r.score, 'Review score', { min: 0, max: scale });
    const scoreHigh = range ? number(range[2], 'Score range', { min: score, max: scale }) : score;
    const drinkFrom = number(r.drink_from, 'Drink from', { min: 1800, max: 2300, integer: true, optional: true });
    const drinkTo = number(r.drink_to, 'Drink to', { min: 1800, max: 2300, integer: true, optional: true });
    if ((drinkFrom == null) !== (drinkTo == null) || (drinkFrom != null && drinkFrom > drinkTo)) throw new Error('Drinking window requires ordered start and end years.');
    if (score == null && drinkFrom == null) throw new Error('Review needs a score or a drinking window.');
    return { ...base, critic: critic.slice(0, 150), score, scoreHigh, scale, drinkFrom, drinkTo, notes: String(r.notes ?? '').slice(0, 4000), kind };
  }
  throw new Error('Unknown dataset category.');
}
export function ingestDataset(state, sourceId, dataset, now = new Date().toISOString()) {
  const source = state.sources.find(s => s.id === sourceId);
  if (!source?.enabled) throw new Error('Select an enabled source.');
  const rows = dataset.rows;
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('A dataset may contain at most 10,000 rows.');
  if (!rows.length && !dataset.completeSnapshot) throw new Error('Empty import requires explicit completeSnapshot: true.');
  // Validate every row before any updates, including snapshot removal.
  let normalized = rows.map((r, i) => { try { return normalizeRow(r, source.category, source, now); } catch (error) { throw new Error(`Row ${i + 1}: ${error.message}`); } });
  if (source.category === 'inventory') normalized = identifyListings(normalized, source, state.listings);
  const next = structuredClone(state);
  const runId = crypto.randomUUID();
  const ids = new Set();
  for (const item of normalized) {
    if (item.wine) {
      const existing = next.wines[item.wineId];
      // Enrichment with fewer descriptive fields must not erase inventory metadata.
      next.wines[item.wineId] = existing ? { ...existing } : item.wine;
      if (existing) for (const field of ['region', 'country', 'type']) if (!existing[field] || existing[field] === 'Unknown') next.wines[item.wineId][field] = item.wine[field];
    }
    const id = source.category === 'inventory' ? item.id : crypto.randomUUID();
    if (ids.has(id)) throw new Error('Inventory offer IDs could not be assigned uniquely.');
    ids.add(id);
    const record = { ...item, id, runId };
    if (source.category === 'inventory') {
      const index = next.listings.findIndex(l => l.id === id);
      const old = next.listings[index];
      if (old && Date.parse(item.observedAt) < Date.parse(old.observedAt)) throw new Error('Inventory snapshot would overwrite a newer observation.');
      const listing = { ...record, firstSeen: old?.firstSeen ?? now, lastSeen: now };
      if (index < 0) next.listings.push(listing); else next.listings[index] = listing;
      next.history.push({ ...listing, event: old ? 'observed' : 'first_seen' });
    } else next[source.category === 'market' ? 'market' : source.category === 'vintage' ? 'vintages' : 'reviews'].push(record);
  }
  if (source.category === 'inventory' && dataset.completeSnapshot) {
    for (const listing of next.listings) if (listing.sourceId === source.id && !ids.has(listing.id) && listing.isAvailable) {
      listing.isAvailable = false; listing.availableQuantity = 0; listing.observedAt = now;
      next.history.push({ ...listing, event: 'absent_from_complete_snapshot', retrievedAt: now });
    }
  }
  next.runs.push({ id: runId, sourceId, category: source.category, at: now, count: rows.length, inferredOfferCount: normalized.filter(r => r.listingIdentity === 'inferred-offer').length, vintageWarningCount: normalized.filter(r => r.wine?.vintageKind === 'unknown' && r.wine.rawVintage).length, completeSnapshot: Boolean(dataset.completeSnapshot), status: 'success' });
  const saved = next.sources.find(s => s.id === sourceId);
  saved.lastChecked = now; saved.lastSuccess = now; saved.error = ''; saved.failures = 0;
  saved.nextDue = new Date(Date.parse(now) + saved.refreshHours * 3600000).toISOString();
  next.revision++;
  captureScores(next, now, runId);
  return next;
}
export function captureScores(state, at = new Date().toISOString(), runId = 'preferences') {
  for (const row of rankInventory(state, { available: false }, new Date(at))) state.scoreHistory.push({ listingId: row.listing.id, at, runId, score: row.score, coverage: row.coverage, discount: row.discount, preferences: structuredClone(state.preferences), algorithmVersion: 1 });
}
export function validateBackup(raw) {
  const state = structuredClone(typeof raw === 'string' ? JSON.parse(raw) : raw);
  if (state?.schemaVersion !== 1 || !state.wines || Array.isArray(state.wines) || typeof state.wines !== 'object' || !Array.isArray(state.sources) || !state.preferences?.weights || !Number.isSafeInteger(state.revision) || state.revision < 0 || !state.decisions || Array.isArray(state.decisions) || typeof state.decisions !== 'object') throw new Error('Choose an intelligence-engine v1 backup. Journal backups are separate.');
  if (state.sources.length > 200 || new Set(state.sources.map(s => s?.id)).size !== state.sources.length) throw new Error('Invalid backup sources.');
  state.sources = state.sources.map(s => ({ ...validateSource(s), ...(STATUSES.includes(s.status) ? { status: s.status } : {}) }));
  const sourceIds = new Set(state.sources.map(s => s.id));
  for (const key of ['listings', 'market', 'reviews', 'vintages', 'history', 'scoreHistory', 'runs']) if (!Array.isArray(state[key]) || state[key].length > 100000) throw new Error(`Invalid ${key} data.`);
  state.preferences = validatePreferences(state.preferences);
  for (const [key, wine] of Object.entries(state.wines)) {
    if (!wine || key !== wine.id || !Array.isArray(wine.warnings) || !Number.isFinite(wine.identityConfidence)) throw new Error('Backup contains inconsistent wine identities.');
    const rebuilt = identifyWine({ raw_title: wine.rawTitle, producer: wine.producer, cuvee: wine.cuvee, vineyard: wine.vineyard, appellation: wine.appellation, vintage: wine.vintage, raw_vintage: wine.rawVintage, bottle_ml: wine.bottleMl, pack_count: wine.packCount, packaging: wine.packaging, classification: wine.classification, designation: wine.designation });
    if (rebuilt.id !== wine.id || rebuilt.vintage !== wine.vintage || (wine.vintageKind && rebuilt.vintageKind !== wine.vintageKind)) throw new Error('Backup contains inconsistent wine identities or an unresolved vintage stored as a year.');
  }
  for (const item of [...state.listings, ...state.market, ...state.reviews, ...state.history, ...state.vintages]) {
    if (!item || !sourceIds.has(item.sourceId) || (item.wineId && !state.wines[item.wineId]) || !Number.isFinite(Date.parse(item.observedAt)) || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 || !Array.isArray(item.warnings)) throw new Error('Backup contains an invalid observation.');
    safeURL(item.sourceURL);
    if (item.price != null && (!Number.isFinite(item.price) || item.price <= 0)) throw new Error('Invalid backup price.');
    if (item.score != null && (!Number.isFinite(item.score) || item.score < 0 || item.score > item.scale)) throw new Error('Invalid backup score.');
  }
  for (const key of ['listings', 'market', 'reviews', 'vintages', 'runs']) if (new Set(state[key].map(r => r.id)).size !== state[key].length) throw new Error('Duplicate backup record IDs.');
  for (const l of [...state.listings, ...state.market]) if (!state.wines[l.wineId] || !Number.isFinite(l.unitPrice) || l.unitPrice <= 0 || !Intl.supportedValuesOf('currency').includes(l.currency) || typeof l.isAvailable !== 'boolean') throw new Error('Invalid backup listing.');
  for (const r of state.scoreHistory) if (!Number.isFinite(r.score) || !Number.isFinite(r.coverage) || !Number.isFinite(Date.parse(r.at))) throw new Error('Invalid backup opportunity history.');
  for (const [id, d] of Object.entries(state.decisions)) if (!d || !state.wines[d.wineId] || !['approved', 'rejected'].includes(d.state) || ![...state.market, ...state.reviews].some(r => r.id === id)) throw new Error('Invalid backup match decision.');
  return structuredClone(state);
}
