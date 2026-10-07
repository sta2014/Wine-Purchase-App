// Shared by the browser terminal, imports, and the server. No external requests.
export function normalized(value = '') {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\bch\.?\b/g, 'chateau').replace(/\bdom\.?\b/g, 'domaine')
    .replace(/\bst\.?\b/g, 'saint').replace(/×/g, 'x').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export const PRODUCERS = {
  'leoville las cases': 'Château Léoville Las Cases', 'chateau leoville las cases': 'Château Léoville Las Cases',
  'guigal': 'E. Guigal', 'e guigal': 'E. Guigal', 'william fevre': 'William Fèvre',
  'chateau margaux': 'Château Margaux', 'chateau lafite rothschild': 'Château Lafite Rothschild',
  'drc': 'Domaine de la Romanée-Conti', 'domaine de la romanee conti': 'Domaine de la Romanée-Conti',
};
const APPELLATIONS = ['Saint-Julien', 'Pauillac', 'Margaux', 'Saint-Émilion', 'Pomerol', 'Chablis', 'Côtes du Rhône'];
const bounded = (value, label, max = 250) => {
  if (value != null && !['string', 'number'].includes(typeof value)) throw new Error(`${label} must be text.`);
  const text = String(value ?? '').trim();
  if (text.length > max) throw new Error(`${label} exceeds ${max} characters.`);
  return text;
};
const supplied = value => value !== undefined && value !== null && value !== '';
export function number(value, label, { min = 0, max = 1e9, integer = false, optional = false } = {}) {
  if ((value == null || value === '') && optional) return null;
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '') throw new Error(`${label} must be numeric.`);
  const displayed = typeof value === 'string' ? value.trim().replace(/^[£$€]/, '').trim() : value;
  if (typeof displayed === 'string' && displayed.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(displayed)) throw new Error(`${label}: ambiguous comma/decimal format.`);
  const cleaned = typeof displayed === 'string' ? displayed.replace(/,/g, '') : displayed;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${label} is outside its valid range.`);
  return n;
}
// Collision-free deterministic ID: the encoded key itself, not a short hash.
export const identifier = (parts) => 'wine:' + encodeURIComponent(JSON.stringify(parts));
export function parsePackageFormat(value = '') {
  const text = String(value);
  const pack = text.match(/\b(\d{1,3})\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/i);
  const size = pack ?? text.match(/\b(\d+(?:\.\d+)?)\s*(ml|cl|l)\b/i);
  const namedMl = /\bdouble[\s-]+magnum\b/i.test(text) ? 3000 : /\bmagnum\b/i.test(text) ? 1500 : null;
  const bottleMl = size ? Number(size[pack ? 2 : 1]) * ({ ml: 1, cl: 10, l: 1000 })[size[pack ? 3 : 2].toLowerCase()] : namedMl;
  const count = text.match(/\b(?:case|pack)\s*(?:of\s*)?(\d+)\b/i);
  return { bottleMl, packCount: pack ? Number(pack[1]) : count ? Number(count[1]) : null, namedMl };
}
export function packageSummary(wine) {
  return { physicalBottles: wine.packCount, bottleMl: wine.bottleMl, packageMl: wine.packCount * wine.bottleMl, standardBottleEquivalent: wine.packCount * wine.bottleMl / 750 };
}
export function identifyWine(row, aliases = PRODUCERS) {
  const rawTitle = bounded(row.raw_title ?? row.name ?? row.wine, 'Wine title');
  if (!rawTitle) throw new Error('A wine title is required.');
  const warnings = [];
  const years = [...new Set(rawTitle.match(/\b(?:18|19|20)\d{2}\b/g) ?? [])];
  if (years.length > 1) warnings.push('Multiple vintage years in title; identity requires review.');
  const vintage = supplied(row.vintage) ? number(row.vintage, 'Vintage', { min: 1800, max: new Date().getFullYear() + 1, integer: true }) : years.length === 1 ? Number(years[0]) : null;
  if (vintage && years.length === 1 && Number(years[0]) !== vintage) warnings.push('Explicit vintage conflicts with title.');
  let title = normalized(rawTitle).replace(/\b(?:18|19|20)\d{2}\b/g, '').trim();
  const aliasKeys = Object.keys(aliases).sort((a, b) => b.length - a.length);
  const explicitProducer = bounded(row.producer ?? row.canonical_producer, 'Producer');
  const inferred = aliasKeys.find(alias => (` ${title} `).includes(` ${alias} `));
  const producer = (aliases[normalized(explicitProducer)] ?? explicitProducer) || (inferred ? aliases[inferred] : '');
  const canonicalProducer = normalized(producer);
  if (explicitProducer && inferred && normalized(aliases[inferred]) !== canonicalProducer) warnings.push('Explicit producer conflicts with known producer in title.');
  if (!producer) warnings.push('Producer not identified; provide an explicit producer.');
  for (const alias of aliasKeys) if (normalized(aliases[alias]) === canonicalProducer) title = (` ${title} `).replace(` ${alias} `, ' ').trim();
  if (canonicalProducer) title = (` ${title} `).replace(` ${canonicalProducer} `, ' ').trim();
  const knownAppellation = { 'chateau leoville las cases': 'Saint-Julien', 'chateau margaux': 'Margaux', 'chateau lafite rothschild': 'Pauillac' }[canonicalProducer];
  const appellation = bounded(row.appellation, 'Appellation') || APPELLATIONS.find(a => (` ${title} `).includes(` ${normalized(a)} `)) || knownAppellation || '';
  if (appellation) title = (` ${title} `).replace(` ${normalized(appellation)} `, ' ').trim();
  const titleFormat = parsePackageFormat(rawTitle), columnFormat = parsePackageFormat(row.format);
  if (supplied(row.format) && !columnFormat.bottleMl) throw new Error('Package format needs a size such as 6x750ml, 1.5L, or double magnum.');
  if (titleFormat.bottleMl && columnFormat.bottleMl && titleFormat.bottleMl !== columnFormat.bottleMl) warnings.push('Package format column conflicts with bottle size in title.');
  if (titleFormat.packCount && columnFormat.packCount && titleFormat.packCount !== columnFormat.packCount) warnings.push('Package format column conflicts with pack count in title.');
  for (const f of [titleFormat, columnFormat]) if (f.namedMl && f.bottleMl !== f.namedMl) warnings.push('Named bottle format conflicts with displayed volume.');
  const extractedMl = columnFormat.bottleMl ?? titleFormat.bottleMl;
  const bottleMl = number(supplied(row.bottle_ml) ? row.bottle_ml : extractedMl ?? 750, 'Bottle ml', { min: 50, max: 30000, integer: true });
  const formatKnown = supplied(row.bottle_ml) || Boolean(extractedMl);
  if (!formatKnown) warnings.push('750ml assumed; explicit bottle format needed for trusted comparisons.');
  if (extractedMl && row.bottle_ml && extractedMl !== bottleMl) warnings.push('Explicit bottle size conflicts with title.');
  const extractedPack = columnFormat.packCount ?? titleFormat.packCount;
  const packCount = number(supplied(row.pack_count) ? row.pack_count : extractedPack ?? 1, 'Pack count', { min: 1, max: 120, integer: true });
  if (extractedPack && row.pack_count && packCount !== extractedPack) warnings.push('Explicit pack count conflicts with title.');
  const woodenCase = /\bowc\b|original wooden case/i.test(`${rawTitle} ${row.format || ''}`);
  const packaging = normalized(row.packaging || (woodenCase ? 'owc' : 'loose'));
  if (row.packaging && woodenCase && packaging !== 'owc') warnings.push('Explicit packaging conflicts with wooden-case format.');
  if (!['owc', 'loose', 'carton'].includes(packaging)) throw new Error('Packaging must be loose, carton, or owc.');
  title = title.replace(/\b\d+\s*[x]\s*\d+(?:\s+\d+)?\s*(?:ml|cl|l)\b/g, '')
    .replace(/\b\d+(?:\s+\d+)?\s*(?:ml|cl|l)\b/g, '').replace(/\b(?:case|pack)\s+(?:of\s+)?\d+\b/g, '')
    .replace(/\b(?:double magnum|owc|magnum|original wooden case)\b/g, '').replace(/\s+/g, ' ').trim();
  const cuvee = bounded(row.cuvee, 'Cuvée') || title;
  const vineyard = bounded(row.vineyard, 'Vineyard');
  const classification = bounded(row.classification, 'Classification');
  const designation = bounded(row.designation, 'Designation');
  const region = bounded(row.region, 'Region');
  const country = bounded(row.country, 'Country');
  const type = bounded(row.type || 'Unknown', 'Wine type');
  const beverageKey = [canonicalProducer, normalized(cuvee), normalized(vineyard), normalized(appellation), vintage, normalized(classification), normalized(designation)];
  const beverageId = identifier(beverageKey);
  const id = identifier([...beverageKey, bottleMl, packCount, packaging]);
  return { id, beverageId, rawTitle, producer, canonicalProducer, cuvee, vineyard, appellation, region, country, vintage, bottleMl, packCount, packaging, type, classification, designation, formatKnown, warnings,
    identityConfidence: warnings.length ? .7 : producer && vintage ? 1 : .8 };
}
function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const x = new Set(normalized(a).split(' ')), y = new Set(normalized(b).split(' '));
  return 2 * [...x].filter(t => y.has(t)).length / (x.size + y.size);
}
export function matchWine(a, b, { format = true } = {}) {
  const conflicts = [];
  if (a.vintage == null || b.vintage == null || a.vintage !== b.vintage) conflicts.push('Vintage missing or different');
  if (format && (a.bottleMl !== b.bottleMl || a.packCount !== b.packCount || a.packaging !== b.packaging)) conflicts.push('Bottle/package format differs');
  if (format && (!a.formatKnown || !b.formatKnown)) conflicts.push('Bottle format unconfirmed');
  if (a.warnings.some(w => /conflict|Multiple/.test(w)) || b.warnings.some(w => /conflict|Multiple/.test(w))) conflicts.push('Conflicting identity fields');
  for (const field of ['vineyard', 'appellation', 'classification', 'designation']) if (a[field] && b[field] && normalized(a[field]) !== normalized(b[field])) conflicts.push(`${field} differs`);
  if (!a.canonicalProducer || !b.canonicalProducer) conflicts.push('Producer unidentified');
  if (a.canonicalProducer !== b.canonicalProducer) conflicts.push('Producer differs');
  if (a.type !== 'Unknown' && b.type !== 'Unknown' && normalized(a.type) !== normalized(b.type)) conflicts.push('Wine type differs');
  if (a.country && b.country && normalized(a.country) !== normalized(b.country)) conflicts.push('Country differs');
  if (conflicts.length) return { confidence: 0, automatic: false, reviewable: false, reasons: conflicts };
  const keyEqual = format ? a.id === b.id : a.beverageId === b.beverageId;
  const cuveeSimilarity = similarity(a.cuvee, b.cuvee);
  // Same producer/vintage is insufficient for different cuvées or vineyards.
  const confidence = keyEqual ? 1 : cuveeSimilarity >= .85 ? .94 : cuveeSimilarity >= .5 ? .76 : .35;
  return { confidence, automatic: keyEqual, reviewable: !keyEqual && confidence >= .75, reasons: keyEqual ? ['Exact canonical identity'] : ['Cuvée or optional identity fields need review'] };
}
