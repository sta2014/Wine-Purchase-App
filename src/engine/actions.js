import { ingestDataset, captureScores, validateBackup } from './ingestion.js';
import { validateSource } from './sources.js';
import { validatePreferences, matchReview } from './ranking.js';
import { matchWine, identifyWine } from './identity.js';
export function applyAction(state, action, now = new Date().toISOString()) {
  if (!action || typeof action !== 'object') throw new Error('Invalid engine action.');
  if (action.type === 'manual-review') {
    const wine = state.wines[action.wineId];
    if (!wine || !state.listings.some(l => l.wineId === wine.id)) throw new Error('Select an inventory wine.');
    const source = state.sources.find(s => s.id === 'critic-import');
    if (!source?.enabled) throw new Error('Enable Approved critic review imports in Sources first.');
    return ingestDataset(state, source.id, { rows: [{ ...action.review, raw_title: wine.rawTitle, producer: wine.producer, cuvee: wine.cuvee, vineyard: wine.vineyard, appellation: wine.appellation, region: wine.region, subregion: wine.subregion, country: wine.country, type: wine.type, vintage: wine.rawVintage || wine.vintage, bottle_ml: wine.bottleMl, pack_count: wine.packCount, packaging: wine.packaging, classification: wine.classification, designation: wine.designation, confidence: 1, verification: action.review?.verified === true ? 'manually_verified' : 'source_import' }] }, now);
  }
  if (action.type === 'import') return ingestDataset(state, action.sourceId, action.dataset, now);
  if (action.type === 'restore') {
    const restored = validateBackup(action.state);
    // Imported backups cannot turn on unattended network retrieval.
    for (const source of restored.sources) source.accessApproved = false;
    restored.revision = state.revision + 1;
    return restored;
  }
  const next = structuredClone(state);
  if (action.type === 'identity') {
    const old=next.wines[action.wineId];
    if (!old) throw new Error('Wine identity not found.');
    const fields=action.fields || {}, allowed=['producer','cuvee','vineyard','appellation','region','subregion','country','type','classification','designation'];
    const edits=Object.fromEntries(allowed.filter(k=>fields[k]!=null).map(k=>[k,fields[k]]));
    const corrected=identifyWine({raw_title:old.rawTitle,...old,...edits,raw_vintage:old.rawVintage || old.vintage,bottle_ml:old.bottleMl,pack_count:old.packCount});
    const correctedFields=Object.fromEntries(allowed.map(k=>[k,corrected[k] || '']));
    next.identityCorrections ||= {};
    for (const correction of Object.values(next.identityCorrections)) if (correction.newWineId===old.id) Object.assign(correction,{fields:correctedFields,newWineId:corrected.id,at:now});
    next.identityCorrections[old.id]={fields:correctedFields,newWineId:corrected.id,at:now};
    next.wines[corrected.id]=corrected;
    for (const listing of next.listings.filter(l=>l.wineId===old.id)) {
      listing.wineId=corrected.id; listing.wine=corrected;
      next.history.push({...listing,event:'identity_corrected',retrievedAt:now,previousWineId:old.id});
    }
    for (const review of next.reviews.filter(r=>r.wineId===old.id && r.verification==='retailer_reported')) {
      review.originalWine ||= review.wine; review.wine={...corrected,rawTitle:review.rawTitle}; review.wineId=corrected.id; review.reviewKey=''; review.matchingNotes='Canonical identity corrected manually; retailer score remains unverified.';
    }
  } else if (action.type === 'source') {
    const old = next.sources.find(s => s.id === action.source.id);
    const source = validateSource({ ...(old ?? {}), ...action.source });
    if (old && old.category !== source.category && next.runs.some(r => r.sourceId === source.id)) throw new Error('Cannot change the category of a source with imported history. Create a new source.');
    if (old && (old.url !== source.url || old.authEnv !== source.authEnv || old.method !== source.method)) { source.etag = ''; source.lastModified = ''; source.nextDue = null; source.error = ''; }
    if (old) next.sources[next.sources.indexOf(old)] = source; else next.sources.push(source);
  } else if (action.type === 'preferences') next.preferences = validatePreferences(action.preferences);
  else if (action.type === 'decision') {
    const item = [...next.market, ...next.reviews].find(r => r.id === action.observationId);
    const wine = next.wines[action.wineId];
    if (!item || !wine || !['approved', 'rejected'].includes(action.decision)) throw new Error('Invalid match review.');
    const listing = next.listings.find(l=>l.wineId===wine.id && l.sourceId===item.sourceId);
    const match = listing && next.reviews.includes(item) ? matchReview(next, listing, item) : matchWine(wine, item.wine || next.wines[item.wineId], { format: next.market.includes(item) || item.formatSpecific === true });
    if (action.decision === 'approved' && !match.reviewable && !match.automatic) throw new Error('Vintage, producer, or package conflicts cannot be overridden by match review.');
    next.decisions[item.id] = { wineId: wine.id, state: action.decision, at: now, confidence: match.confidence, note: String(action.note || 'Reviewed in terminal').slice(0, 1000) };
  } else throw new Error('Unknown engine action.');
  next.revision++;
  captureScores(next, now, action.type);
  return next;
}
