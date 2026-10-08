import { marketMatch, normalizeMarketOffer, marketOfferKey, merchantKey } from './market.js';
import { ingestDataset, captureScores, validateBackup } from './ingestion.js';
import { validateSource } from './sources.js';
import { validatePreferences, matchReview } from './ranking.js';
import { matchWine, identifyWine } from './identity.js';
import { canonicalGeography } from './geography.js';
import { normalizeVintageAssessment, matchVintage, wineGeography } from './vintages.js';
export function applyAction(state, action, now = new Date().toISOString()) {
  if (!action || typeof action !== 'object') throw new Error('Invalid engine action.');
  if (action.type === 'manual-review') {
    const wine = state.wines[action.wineId];
    if (!wine || !state.listings.some(l => l.wineId === wine.id)) throw new Error('Select an inventory wine.');
    const source = state.sources.find(s => s.id === 'critic-import');
    if (!source?.enabled) throw new Error('Enable Approved critic review imports in Sources first.');
    return ingestDataset(state, source.id, { rows: [{ ...action.review, raw_title: wine.rawTitle, producer: wine.producer, cuvee: wine.cuvee, vineyard: wine.vineyard, appellation: wine.appellation, region: wine.region, subregion: wine.subregion, country: wine.country, type: wine.type, vintage: wine.rawVintage || wine.vintage, bottle_ml: wine.bottleMl, pack_count: wine.packCount, packaging: wine.packaging, classification: wine.classification, designation: wine.designation, confidence: 1, verification: action.review?.verified === true ? 'manually_verified' : 'source_import' }] }, now);
  }
  if(action.type==='manual-market') {
    const wine=state.wines[action.wineId];
    if(!wine || !state.listings.some(l=>l.wineId===wine.id)) throw new Error('Select an inventory wine.');
    const offer=action.offer || {};
    return ingestDataset(state,'market-import',{rows:[{...offer,raw_title:wine.rawTitle,producer:wine.producer,cuvee:wine.cuvee,vineyard:wine.vineyard,appellation:wine.appellation,region:wine.region,subregion:wine.subregion,country:wine.country,type:wine.type,vintage:wine.rawVintage || wine.vintage,classification:wine.classification,designation:wine.designation,bottle_ml:wine.bottleMl,pack_count:offer.pack_count || wine.packCount,packaging:offer.packaging || wine.packaging}]},now);
  }
  if (action.type === 'import') return ingestDataset(state, action.sourceId, action.dataset, now);
  if(action.type==='manual-vintage') {
    const source=state.sources.find(s=>s.id==='vintage-import');
    if(!source?.enabled) throw new Error('Enable Curated vintage assessments in Sources first.');
    return ingestDataset(state,source.id,{rows:[action.assessment]},now);
  }
  if (action.type === 'restore') {
    const restored = validateBackup(action.state);
    // Imported backups cannot turn on unattended network retrieval.
    for (const source of restored.sources) source.accessApproved = false;
    if(restored.marketResearch){for(const s of restored.marketResearch.sources){s.enabled=false;s.termsReviewed=false;}restored.marketResearch.schedule.enabled=false;for(const j of restored.marketResearch.jobs)if(['queued','running'].includes(j.status))j.status='cancelled';}
    restored.revision = state.revision + 1;
    return restored;
  }
  const next = structuredClone(state);
  if(action.type==='market-control') {
    const record=next.market.find(r=>r.id===action.recordId);
    if(!record || typeof action.excluded!=='boolean') throw new Error('Invalid market offer control.');
    if(action.duplicateOf && (action.duplicateOf===record.id || !next.market.some(r=>r.id===action.duplicateOf))) throw new Error('Choose a different existing duplicate offer.');
    next.marketControls ||= {}; next.marketControls[record.id]={excluded:action.excluded,duplicateOf:action.duplicateOf || '',at:now};
  } else if(action.type==='merchant-reliability') {
    const record=next.market.find(r=>r.id===action.recordId),confidence=Number(action.confidence);
    if(!record || !Number.isFinite(confidence) || confidence<0 || confidence>1) throw new Error('Merchant confidence must be 0–1.');
    next.merchantReliability ||= {}; next.merchantReliability[merchantKey(record)]=confidence;
  } else if(action.type==='market-format') {
    const record=next.market.find(r=>r.id===action.recordId);
    if(!record) throw new Error('Market offer not found.');
    const corrected=identifyWine({raw_title:record.rawTitle,...record.wine,raw_vintage:record.wine.rawVintage,bottle_ml:action.bottleMl,pack_count:action.packCount,packaging:action.packaging});
    record.originalWine ||= record.wine;
    record.wine=corrected;record.wineId=corrected.id;record.bottleMl=corrected.bottleMl;record.packCount=corrected.packCount;record.packaging=corrected.packaging;record.unitPrice=record.price/corrected.packCount;record.pricePer750=record.unitPrice*750/corrected.bottleMl;
    next.wines[corrected.id]=corrected;
    next.marketCorrections ||= {};next.marketCorrections[record.id]={bottleMl:corrected.bottleMl,packCount:corrected.packCount,packaging:corrected.packaging,at:now};
  } else if(action.type==='geography') {
    const wine=next.wines[action.wineId];
    if(!wine) throw new Error('Wine not found.');
    const fields=Object.fromEntries(['country','region','subregion','appellation','vineyard','type','style'].filter(k=>action.fields?.[k]!=null).map(k=>[k,String(action.fields[k]).trim()]));
    if(Object.values(fields).some(v=>v.length>250)) throw new Error('Geographic fields must be at most 250 characters.');
    const geo=canonicalGeography(fields,{inferTitle:false});
    if(!geo.path.length || geo.conflict) throw new Error('Supply a consistent geographic hierarchy.');
    next.geographyCorrections ||= {}; next.geographyCorrections[wine.id]={fields,at:now};
  } else if(action.type==='vintage-decision') {
    const wine=next.wines[action.wineId],record=next.vintages.find(r=>r.id===action.recordId);
    if(!wine || !record || !['approved','rejected'].includes(action.decision)) throw new Error('Invalid vintage match decision.');
    const match=matchVintage(wine,record,wineGeography(next,wine));
    if(action.decision==='approved' && !match.accepted) throw new Error('Wrong vintage, geography, wine type or unsupported provenance cannot be approved. Correct the underlying mapping first.');
    next.vintageDecisions ||= {}; next.vintageDecisions[`${wine.id}:${record.id}`]={wineId:wine.id,recordId:record.id,state:action.decision,at:now};
  } else if(action.type==='vintage-edit') {
    const record=next.vintages.find(r=>r.id===action.recordId);
    if(!record?.geography) throw new Error('Assessment not found; reimport legacy data with provenance first.');
    const allowed=['country','region','subregion','appellation','vineyard','type','style','original_rating','rating_system','scale'];
    const fields=Object.fromEntries(allowed.filter(k=>action.fields?.[k]!=null).map(k=>[k,String(action.fields[k]).trim()]));
    if(Object.values(fields).some(v=>v.length>250)) throw new Error('Assessment correction fields must be at most 250 characters.');
    const fixed=normalizeVintageAssessment({...record.rawGeography,vintage:record.vintage,publication:record.publication,original_rating:record.rawRating,rating_system:record.ratingSystem,scale:record.scale,professional:record.professional,provisional:record.provisional,source_reference:record.sourceReference,context_tags:record.contextTags,notes:record.notes,...fields},next.sources.find(s=>s.id===record.sourceId),record);
    if(!fixed.eligible) throw new Error('Correction must retain consistent geography and professional provenance.');
    const revisions=[...(record.revisions || []),{rawRating:record.rawRating,normalizedScore:record.normalizedScore,observedAt:record.observedAt,retrievedAt:record.retrievedAt,geography:record.geography,at:now,event:'manual_correction'}].slice(-50);
    Object.assign(record,fixed,{rawGeography:record.rawGeography,mappingFields:fields,revisions});
    next.vintageCorrections ||= {}; next.vintageCorrections[record.id]={fields,at:now};
  } else if (action.type === 'identity') {
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
    if(next.geographyCorrections?.[old.id]) next.geographyCorrections[corrected.id]=structuredClone(next.geographyCorrections[old.id]);
    for(const d of Object.values(next.vintageDecisions || {})) if(d.wineId===old.id) next.vintageDecisions[`${corrected.id}:${d.recordId}`]={...d,wineId:corrected.id};
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
    const match = listing && next.reviews.includes(item) ? matchReview(next, listing, item) : next.market.includes(item) ? marketMatch(wine,item.wine || next.wines[item.wineId]) : matchWine(wine, item.wine || next.wines[item.wineId], { format: item.formatSpecific === true });
    if (action.decision === 'approved' && !match.reviewable && !match.automatic) throw new Error('Vintage, producer, or package conflicts cannot be overridden by match review.');
    next.decisions[item.id] = { wineId: wine.id, state: action.decision, at: now, confidence: match.confidence, note: String(action.note || 'Reviewed in terminal').slice(0, 1000) };
  } else throw new Error('Unknown engine action.');
  next.revision++;
  captureScores(next, now, action.type);
  return next;
}
