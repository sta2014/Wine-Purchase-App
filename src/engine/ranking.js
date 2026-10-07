import { compositeCritics, qualityComponent, QUALITY_POLICY, publicationName, isCommunity } from './critics.js';
import { matchWine, normalized } from './identity.js';
export function latest(records, key) {
  const map = new Map();
  for (const r of records) {
    const k = key(r), old = map.get(k);
    if (!old || Date.parse(r.observedAt) >= Date.parse(old.observedAt)) map.set(k, r);
  }
  return [...map.values()];
}
const median = values => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2; };
const clamp = value => Math.max(0, Math.min(100, value));
function matched(state, wine, item, format) {
  const other = item.wine || state.wines[item.wineId];
  if (!other) return { accepted: false, confidence: 0, reasons: ['Unknown canonical wine'] };
  const match = matchWine(wine, other, { format });
  const decision = state.decisions[item.id];
  const approved = decision?.state === 'approved' && decision.wineId === wine.id && match.reviewable;
  const rejected = decision?.state === 'rejected' && decision.wineId === wine.id;
  return { ...match, accepted: !rejected && (match.automatic || approved) && match.confidence >= (approved ? .75 : state.preferences.matchThreshold), manuallyApproved: approved };
}
export function analyzeListing(state, listing, now = new Date(), reviewIndex = null) {
  const wine = state.wines[listing.wineId];
  const demo = Boolean(state.sources.find(s => s.id === listing.sourceId)?.isDemo);
  const active = new Set(state.sources.filter(s => s.enabled && Boolean(s.isDemo) === demo).map(s => s.id));
  const exclusions = [], market = [], pendingMatches = [];
  const observations = latest(state.market.filter(r => active.has(r.sourceId)), r => JSON.stringify([r.sourceId, r.merchant, r.wineId, r.currency, r.priceTerms, r.saleType]));
  for (const observation of observations) {
    const match = matched(state, wine, observation, true);
    if (match.reviewable && !match.accepted && !state.decisions[observation.id]) pendingMatches.push({ observation, ...match });
    if (!match.accepted) { if (state.wines[observation.wineId]?.canonicalProducer === wine.canonicalProducer) exclusions.push({ id: observation.id, source: observation.sourceName, reason: match.reasons.join('; ') }); continue; }
    let reason = '';
    if (!observation.isAvailable) reason = 'Latest quote unavailable';
    else if (observation.currency !== listing.currency) reason = 'Currency differs; no verified FX conversion';
    else if (observation.priceTerms !== listing.priceTerms) reason = 'Tax/shipping basis differs';
    else if (observation.saleType !== 'retail') reason = 'Auction price excluded; buyer premium/fees not comparable';
    else if (Date.parse(observation.observedAt) > +now || +now - Date.parse(observation.observedAt) > state.preferences.marketMaxAgeHours * 3600000) reason = 'Market quote stale or future-dated';
    else if (observation.confidence < state.preferences.matchThreshold) reason = 'Source data confidence below threshold';
    if (reason) exclusions.push({ id: observation.id, source: observation.sourceName, reason });
    else market.push({ ...observation, matchConfidence: match.confidence, manuallyApproved: match.manuallyApproved });
  }
  // One current observation per merchant avoids duplicating a merchant through multiple feeds.
  const marketEvidence = latest(market, r => normalized(r.merchant));
  const referencePrice = marketEvidence.length ? median(marketEvidence.map(r => r.unitPrice)) : null;
  const discount = referencePrice == null ? null : (referencePrice - listing.unitPrice) / referencePrice;
  const reviewCandidates = (reviewIndex?.get(wine.canonicalProducer) || (reviewIndex ? [] : state.reviews)).filter(r => active.has(r.sourceId));
  for (const r of reviewCandidates) { const match = matched(state, wine, r, r.formatSpecific === true); if (match.reviewable && !match.accepted && !state.decisions[r.id]) pendingMatches.push({ observation: r, ...match }); }
  const reviews = reviewCandidates.filter(r => {
    const match = matched(state, wine, r, r.formatSpecific === true);
    if (!match.accepted) return false;
    if (r.confidence < state.preferences.matchThreshold) { exclusions.push({ id: r.id, source: r.sourceName, reason: 'Review data confidence below threshold' }); return false; }
    return true;
  }).map(r => ({ ...r, matchConfidence: matched(state, wine, r, r.formatSpecific === true).confidence, manuallyApproved: matched(state, wine, r, r.formatSpecific === true).manuallyApproved }));
  const professional = reviews.filter(r => r.kind === 'critic' && !isCommunity(r.publication || r.critic) && r.score != null);
  const criticComposite = compositeCritics(professional);
  const quality = criticComposite.score, criticComponent = qualityComponent(quality);
  const latestCriticRun = state.runs.filter(r => r.category === 'critic' || state.sources.find(s=>s.id===r.sourceId)?.category === 'critic').at(-1);
  const criticStatus = quality != null ? criticComposite.verifiedCount ? 'Verified review found' : 'Reported scores — awaiting independent verification' : pendingMatches.some(m=>m.observation.kind==='critic') ? 'Ambiguous match' : latestCriticRun && ['Error', 'Authentication Required'].includes(latestCriticRun.status) ? 'Lookup failure / source unavailable' : latestCriticRun && ['success', 'not_modified'].includes(latestCriticRun.status) ? 'No matching review in imported/queried data' : 'Critic source unavailable — not yet searched';
  const assessments = latest(state.vintages.filter(r => active.has(r.sourceId)), r => JSON.stringify([r.sourceId, normalized(r.region), normalized(r.type), r.vintage]))
    .filter(r => {
      if (normalized(r.region) !== normalized(wine.region) || normalized(r.type) !== normalized(wine.type) || r.vintage !== wine.vintage) return false;
      if (r.confidence < state.preferences.matchThreshold) { exclusions.push({ id: r.id, source: r.sourceName, reason: 'Vintage data confidence below threshold' }); return false; }
      return true;
    });
  const vintage = assessments.length ? assessments.reduce((sum, r) => sum + r.score / r.scale * 100, 0) / assessments.length : null;
  const windows = reviews.filter(r => r.drinkFrom != null && r.kind === 'critic');
  const year = now.getFullYear();
  const drinkNow = windows.length ? windows.some(r => r.drinkFrom <= year && r.drinkTo >= year) : null;
  const windowConflict = windows.length > 1 && windows.some(r => r.drinkFrom <= year && r.drinkTo >= year) && windows.some(r => r.drinkFrom > year || r.drinkTo < year);
  const staleInventory = +now - Date.parse(listing.observedAt) > state.preferences.inventoryMaxAgeHours * 3600000;
  const values = { value: discount == null ? null : clamp(discount / .4 * 100), quality: criticComponent, vintage, window: drinkNow == null ? null : windowConflict ? 50 : drinkNow ? 100 : 0,
    confidence: marketEvidence.length ? Math.min(wine.identityConfidence, ...marketEvidence.map(r => Math.min(r.matchConfidence, r.confidence))) * 100 : null };
  const weights = state.preferences.weights;
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + Number(w), 0);
  const breakdown = Object.entries(values).map(([key, value]) => ({ key, value, weight: Number(weights[key] ?? 0), neutral: key === 'quality' && value == null, contribution: (value == null ? key === 'quality' ? QUALITY_POLICY.neutral : 0 : value) * Number(weights[key] ?? 0) / totalWeight }));
  const coverage = breakdown.filter(b => b.value != null).reduce((sum, b) => sum + b.weight, 0) / totalWeight;
  const score = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  const warnings = [...listing.warnings, ...(listing.criticWarnings || []), ...criticComposite.conflicts];
  if (referencePrice == null) warnings.push('No current, trusted, like-for-like market price.');
  if (quality == null) warnings.push('No matching professional critic score.');
  if (vintage == null) warnings.push('No matching regional vintage assessment.');
  if (!windows.length) warnings.push('Drinking window unknown.');
  if (windowConflict) warnings.push('Critic drinking windows disagree.');
  if (staleInventory) warnings.push('Inventory stale: confirm retailer availability before purchase.');
  const preferred = state.preferences.preferredRegions.map(normalized).includes(normalized(wine.region));
  // Preference fit is disclosed, capped, and never substitutes for missing evidence.
  const preferenceBonus = preferred ? 5 * coverage : 0;
  return { listing, wine, referencePrice, discount, quality, criticComponent, criticComposite, criticStatus, vintage, drinkNow, windows, professional, community: reviews.filter(r => r.kind === 'community'), assessments, marketEvidence, exclusions, pendingMatches, breakdown, coverage,
    score: staleInventory ? 0 : clamp(score + preferenceBonus), preferenceBonus, staleInventory, warnings,
    recommendation: staleInventory ? 'Confirm stale inventory' : coverage < .5 ? 'Research before buying' : discount != null && discount >= .1 && quality != null && quality >= 90 ? 'Compelling opportunity' : discount != null && discount < 0 ? 'Above observed market' : 'Consider with context' };
}
export function rankInventory(state, filters = {}, now = new Date()) {
  const active = new Set(state.sources.filter(s => s.enabled).map(s => s.id));
  const search = normalized(filters.query || '');
  const reviewIndex = new Map();
  for(const r of state.reviews) { const producer=(r.wine || state.wines[r.wineId])?.canonicalProducer; if(!reviewIndex.has(producer)) reviewIndex.set(producer,[]); reviewIndex.get(producer).push(r); }
  const rows = state.listings.filter(l => active.has(l.sourceId)).map(l => analyzeListing(state, l, now, reviewIndex)).filter(a => {
    const { listing: l, wine: w } = a;
    if (filters.available !== false && !l.isAvailable) return false;
    if (filters.source && l.sourceId !== filters.source) return false;
    if (filters.currency && l.currency !== filters.currency) return false;
    if (filters.type && normalized(w.type) !== normalized(filters.type)) return false;
    if (filters.region && normalized(w.region) !== normalized(filters.region)) return false;
    if (filters.country && normalized(w.country) !== normalized(filters.country)) return false;
    if (search && !normalized([w.rawTitle, w.producer, w.cuvee, w.region, w.appellation, w.country].join(' ')).includes(search)) return false;
    for (const [key, value, direction] of [['maxPrice', l.unitPrice, 'max'], ['minPrice', l.unitPrice, 'min'], ['minVintage', w.vintage, 'min'], ['maxVintage', w.vintage, 'max'], ['minCritic', a.quality, 'min'], ['minDiscount', a.discount == null ? null : a.discount * 100, 'min'], ['minQuantity', l.availableQuantity, 'min'], ['minCoverage', a.coverage * 100, 'min']]) {
      if (filters[key] !== '' && filters[key] != null && (value == null || (direction === 'min' ? value < Number(filters[key]) : value > Number(filters[key])))) return false;
    }
    if (filters.bottleMl && w.bottleMl !== Number(filters.bottleMl)) return false;
    if (filters.packCount && w.packCount !== Number(filters.packCount)) return false;
    if (filters.publication && !a.professional.some(r => publicationName(r.publication || r.critic) === filters.publication)) return false;
    if (filters.verifiedOnly && !a.criticComposite.verifiedCount) return false;
    if (filters.hideUncertain && a.pendingMatches.some(m => m.observation.kind === 'critic')) return false;
    if (filters.drinkNow && a.drinkNow !== true) return false;
    return true;
  });
  const sort = filters.sort ?? 'opportunity';
  rows.sort(sort === 'price' ? (a, b) => a.listing.unitPrice - b.listing.unitPrice : sort === 'quality' ? (a, b) => (b.quality ?? -1) - (a.quality ?? -1) : (a, b) => b.score - a.score || b.coverage - a.coverage || a.listing.unitPrice - b.listing.unitPrice || a.listing.id.localeCompare(b.listing.id));
  return rows.map((a, i) => ({ ...a, rank: i + 1 }));
}
export function validatePreferences(input) {
  const p = structuredClone(input);
  const keys = ['value', 'quality', 'vintage', 'window', 'confidence'];
  if (!p.weights || keys.some(k => !Number.isFinite(Number(p.weights[k])) || Number(p.weights[k]) < 0 || Number(p.weights[k]) > 100) || keys.reduce((n, k) => n + Number(p.weights[k]), 0) === 0) throw new Error('Weights must be 0–100, with at least one positive weight.');
  p.weights = Object.fromEntries(keys.map(k => [k, Number(p.weights[k])]));
  for (const k of ['marketMaxAgeHours', 'inventoryMaxAgeHours']) if (!Number.isFinite(Number(p[k])) || Number(p[k]) < 1 || Number(p[k]) > 8760) throw new Error('Freshness limits must be 1–8760 hours.');
  if (!Number.isFinite(Number(p.matchThreshold)) || Number(p.matchThreshold) < .95 || Number(p.matchThreshold) > 1) throw new Error('Automatic match threshold must be .95–1.');
  if (!Array.isArray(p.preferredRegions) || p.preferredRegions.length > 30 || p.preferredRegions.some(r => typeof r !== 'string' || r.length > 100)) throw new Error('Invalid preferred regions.');
  return p;
}
