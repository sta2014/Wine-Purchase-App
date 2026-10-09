import {QUALITY_WEIGHTS} from './quality-settings.js';
import {criticConsensus} from './consensus.js';
import { assessVintage, VINTAGE_POLICY, wineGeography, buildVintageIndex, vintageCandidates } from './vintages.js';
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
function matched(state, wine, item, format, inventorySourceId) {
  const other = item.wine || state.wines[item.wineId];
  if (!other) return { accepted: false, confidence: 0, reasons: ['Unknown canonical wine'] };
  // A retailer's own reported score is tied to its exact inventory identity.
  // This uses no cross-source producer guess and never verifies the score itself.
  const localReport = item.verification === 'retailer_reported' && item.sourceId === inventorySourceId && state.sources.find(s=>s.id===item.sourceId)?.category === 'inventory' && wine.beverageId === other.beverageId && (wine.vintage != null || ['non-vintage','multi-vintage'].includes(wine.vintageKind)) && ![...wine.warnings,...other.warnings].some(w=>/conflict|Multiple/.test(w)) && (wine.type === other.type || wine.type === 'Unknown' || other.type === 'Unknown') && (!wine.country || !other.country || normalized(wine.country)===normalized(other.country));
  const match = localReport && !format ? {confidence:1,automatic:true,reviewable:false,reasons:['Exact retailer inventory identity; score independently unverified']} : matchWine(wine, other, { format });
  const decision = state.decisions[item.id];
  const approved = decision?.state === 'approved' && decision.wineId === wine.id && match.reviewable;
  const rejected = decision?.state === 'rejected' && decision.wineId === wine.id;
  return { ...match, accepted: !rejected && (match.automatic || approved) && match.confidence >= (approved ? .75 : state.preferences.matchThreshold), manuallyApproved: approved };
}
export function matchReview(state, listing, review) {
  return matched(state, state.wines[listing.wineId], review, review.formatSpecific === true, listing.sourceId);
}
export function analyzeListing(state, listing, now = new Date(), reviewIndex = null, vintageIndex = null, unused = null) {
  const wine = state.wines[listing.wineId];
  const demo = Boolean(state.sources.find(s => s.id === listing.sourceId)?.isDemo);
  const active = new Set(state.sources.filter(s => s.enabled && Boolean(s.isDemo) === demo).map(s => s.id));
  const exclusions = [], pendingMatches = [];
  const reviewCandidates = (reviewIndex?.get(reviewIndexKey(wine)) || (reviewIndex ? [] : state.reviews)).filter(r => active.has(r.sourceId));
  const reviews = [];
  for (const r of reviewCandidates) {
    const match = matched(state, wine, r, r.formatSpecific === true, listing.sourceId);
    if (match.reviewable && !match.accepted && !state.decisions[r.id]) pendingMatches.push({observation:r,...match});
    if (!match.accepted) continue;
    if (r.confidence < state.preferences.matchThreshold) { exclusions.push({id:r.id,source:r.sourceName,reason:'Review data confidence below threshold'}); continue; }
    reviews.push({...r,matchConfidence:match.confidence,manuallyApproved:match.manuallyApproved});
  }
  const professional = reviews.filter(r => !r.excludedReason && r.kind === 'critic' && !isCommunity(r.publication || r.critic) && r.score != null);
  const criticComposite = compositeCritics(professional);
  const quality = criticComposite.score, criticComponent = quality;
  const latestCriticRun = state.runs.filter(r => r.category === 'critic' || state.sources.find(s=>s.id===r.sourceId)?.category === 'critic').at(-1);
  const criticStatus = quality != null ? criticComposite.verifiedCount ? 'Verified review found' : 'Reported scores — awaiting independent verification' : pendingMatches.some(m=>m.observation.kind==='critic') ? 'Ambiguous match' : latestCriticRun && ['Error', 'Authentication Required'].includes(latestCriticRun.status) ? 'Lookup failure / source unavailable' : latestCriticRun && ['success', 'not_modified'].includes(latestCriticRun.status) ? 'No matching review in imported/queried data' : 'Critic source unavailable — not yet searched';
  const geography=wineGeography(state,wine);
  const vintageIntelligence=assessVintage(state,wine,vintageIndex?vintageCandidates(vintageIndex,geography,wine.vintage):state.vintages,{demo,geography});
  const vintage=vintageIntelligence.score, assessments=vintageIntelligence.sources, vintageComponent=vintageIntelligence.component;
  for(const c of vintageIntelligence.candidates) if(!c.match.accepted && c.record.geography?.leafId===vintageIntelligence.geography.leafId) exclusions.push({id:c.record.id,source:c.record.publication || c.record.sourceName,reason:c.match.reasons.join('; ')});
  const windows = reviews.filter(r => r.drinkFrom != null && r.kind === 'critic');
  const year = now.getFullYear();
  const drinkNow = windows.length ? windows.some(r => r.drinkFrom <= year && r.drinkTo >= year) : null;
  const windowConflict = windows.length > 1 && windows.some(r => r.drinkFrom <= year && r.drinkTo >= year) && windows.some(r => r.drinkFrom > year || r.drinkTo < year);
  const staleInventory = +now - Date.parse(listing.observedAt) > state.preferences.inventoryMaxAgeHours * 3600000;
  const consensusIntelligence=criticConsensus(professional,criticComposite),consensus=consensusIntelligence.score;
  const values={quality,vintage,consensus};
  const weights=state.preferences.weights;
  const availableWeight=Object.entries(values).filter(([,v])=>v!=null).reduce((sum,[k])=>sum+weights[k],0);
  const breakdown=Object.entries(values).map(([key,value])=>({key,value,weight:weights[key],effectiveWeight:value==null || !availableWeight?0:weights[key]*100/availableWeight,contribution:value==null || !availableWeight?0:value*weights[key]/availableWeight}));
  const coverage=availableWeight/100;
  const score=availableWeight?breakdown.reduce((sum,b)=>sum+b.contribution,0):null;
  const count=Object.values(values).filter(v=>v!=null).length;
  const reliable=quality!=null && (criticComposite.publicationCount>=2 || vintage!=null);
  const evidence={quality:criticComposite.confidence || 0,vintage:vintageIntelligence.confidence || 0,consensus:consensus==null?0:consensus/100};
  const rankingConfidence=Object.entries(evidence).reduce((n,[k,v])=>n+weights[k]*v/100,0);
  const completeThreeFactors=count===3;
  const verifiedComplete=completeThreeFactors && criticComposite.verifiedCount>0;
  const rankingStatus=score==null?'Insufficient evidence':!reliable?'Provisional — insufficient independent evidence':completeThreeFactors?'Three-factor coverage':'Incomplete quality score';
  const warnings = [...listing.warnings, ...(listing.criticWarnings || []), ...criticComposite.conflicts];
  if (quality == null) warnings.push('No matching professional critic score.');
  if (vintage == null) warnings.push(vintageIntelligence.status);
  if(vintageIntelligence.fallback) warnings.push(vintageIntelligence.fallbackReason);
  if(vintageIntelligence.spread>=8) warnings.push('Professional vintage sources disagree.');
  if (!windows.length) warnings.push('Drinking window unknown.');
  if (windowConflict) warnings.push('Critic drinking windows disagree.');
  if (staleInventory) warnings.push('Inventory stale: confirm retailer availability before purchase.');
  return {listing,wine,quality,criticComponent,criticComposite,criticStatus,vintage,vintageComponent:vintage,vintageIntelligence,drinkNow,windows,professional,consensus,consensusIntelligence,assessments,exclusions,pendingMatches,breakdown,coverage,score,rankingConfidence,rankingStatus,completeThreeFactors,verifiedComplete,reliable,missingFactors:Object.keys(values).filter(k=>values[k]==null),staleInventory,warnings,recommendation:rankingStatus};
}
const reviewIndexKey = wine => JSON.stringify([wine.canonicalProducer || wine.beverageId, wine.vintage ?? wine.vintageKind ?? 'unknown']);
export function rankInventory(state, filters = {}, now = new Date()) {
  const active = new Set(state.sources.filter(s => s.enabled).map(s => s.id));
  const reviewIndex = new Map(), vintageIndex = buildVintageIndex(state.vintages);
  for(const r of state.reviews) { const other=r.wine || state.wines[r.wineId]; if(!other) continue; const producer=reviewIndexKey(other); if(!reviewIndex.has(producer)) reviewIndex.set(producer,[]); reviewIndex.get(producer).push(r); }
  return filterRankedInventory(state.listings.filter(l=>active.has(l.sourceId)).map(l=>analyzeListing(state,l,now,reviewIndex,vintageIndex)),filters);
}
const geoKeyForFilter = normalized;
export function filterRankedInventory(analyses, filters = {}) {
  const search = normalized(filters.query || '');
  const rows = analyses.filter(a => {
    const { listing: l, wine: w } = a;
    if (filters.available !== false && !l.isAvailable) return false;
    if (filters.source && l.sourceId !== filters.source) return false;
    if (filters.currency && l.currency !== filters.currency) return false;
    if (filters.type && normalized(a.vintageIntelligence.geography.type) !== normalized(filters.type)) return false;
    if (filters.region && normalized(w.region) !== normalized(filters.region) && normalized(a.vintageIntelligence.geography.region) !== normalized(filters.region)) return false;
    if (filters.country && normalized(a.vintageIntelligence.geography.country) !== normalized(filters.country)) return false;
    if (search && !normalized([w.rawTitle, w.producer, w.cuvee, w.region, w.appellation, w.country].join(' ')).includes(search)) return false;
    for (const [key, value, direction] of [['maxPrice', l.unitPrice, 'max'], ['minPrice', l.unitPrice, 'min'], ['minVintage', w.vintage, 'min'], ['maxVintage', w.vintage, 'max'], ['minCritic', a.quality, 'min'], ['minVintageScore', a.vintage, 'min'], ['minQuantity', l.availableQuantity, 'min'], ['minCoverage', a.coverage * 100, 'min']]) {
      if (filters[key] !== '' && filters[key] != null && (value == null || (direction === 'min' ? value < Number(filters[key]) : value > Number(filters[key])))) return false;
    }
    if (filters.bottleMl && w.bottleMl !== Number(filters.bottleMl)) return false;
    if (filters.packCount && w.packCount !== Number(filters.packCount)) return false;
    if (filters.publication && !a.professional.some(r => publicationName(r.publication || r.critic) === filters.publication)) return false;
    if (filters.verifiedOnly && !a.criticComposite.verifiedCount) return false;
    if (filters.hideUncertain && a.pendingMatches.some(m => m.observation.kind === 'critic')) return false;
    if(filters.producer && !normalized(w.producer || w.rawTitle).includes(normalized(filters.producer)))return false;
    if(filters.maxLotPrice && l.price>Number(filters.maxLotPrice))return false;
    if(filters.subregion && !a.vintageIntelligence.geography.path.some(n=>n.level==='subregion' && geoKeyForFilter(n.name)===geoKeyForFilter(filters.subregion))) return false;
    if(filters.style && geoKeyForFilter(a.vintageIntelligence.geography.style)!==geoKeyForFilter(filters.style)) return false;
    if(filters.appellation && geoKeyForFilter(a.vintageIntelligence.geography.appellation)!==geoKeyForFilter(filters.appellation)) return false;
    if(filters.vintageTier && !(Array.isArray(filters.vintageTier)?filters.vintageTier:filters.vintageTier.split('|')).includes(a.vintageIntelligence.tier)) return false;
    if(filters.vintageConfidence && !['Low','Medium','High','Very High'].slice(['Low','Medium','High','Very High'].indexOf(filters.vintageConfidence)).includes(a.vintageIntelligence.confidenceLabel)) return false;
    if(filters.completeThree && !a.verifiedComplete)return false;
    for(const [key,value] of [['minConsensus',a.consensus],['minQualityScore',a.score],['minRankingConfidence',a.rankingConfidence*100],['minLotPrice',l.price]])if(filters[key]!=='' && filters[key]!=null && (value==null || value<Number(filters[key])))return false;
    if (filters.drinkNow && a.drinkNow !== true) return false;
    return true;
  });
  const sort = filters.sort ?? 'opportunity';
  if(['vintage','vintageTier','vintageContribution'].includes(sort)) { rows.sort((a,b)=>(sort==='vintageContribution'?b.breakdown.find(x=>x.key==='vintage').contribution-a.breakdown.find(x=>x.key==='vintage').contribution:sort==='vintageTier'?(a.vintage==null?99:VINTAGE_POLICY.tiers.findIndex(([t])=>t===a.vintageIntelligence.tier))-(b.vintage==null?99:VINTAGE_POLICY.tiers.findIndex(([t])=>t===b.vintageIntelligence.tier)):(b.vintage ?? -1)-(a.vintage ?? -1)) || (b.score ?? -1)-(a.score ?? -1)); return rows.map((a,i)=>({...a,rank:i+1})); }
  const get=sort==='consensus'?a=>a.consensus:sort==='quality'?a=>a.quality:sort==='confidence'?a=>a.rankingConfidence:a=>a.score;
  rows.sort((a,b)=>Number(b.reliable)-Number(a.reliable) || (get(b) ?? -1)-(get(a) ?? -1) || b.rankingConfidence-a.rankingConfidence || a.listing.id.localeCompare(b.listing.id));
  return rows.map((a, i) => ({ ...a, rank: i + 1 }));
}
export function validatePreferences(input) {
  const p = structuredClone(input);
  const keys=Object.keys(QUALITY_WEIGHTS);
  if(!p.weights || keys.some(k=>!Number.isFinite(Number(p.weights[k])) || p.weights[k]<0 || p.weights[k]>100) || Math.abs(keys.reduce((n,k)=>n+Number(p.weights[k]),0)-100)>0.000001)throw new Error('The three quality weights must total 100%.');
  p.weights=Object.fromEntries(keys.map(k=>[k,Number(p.weights[k])]));
  if(!Number.isFinite(Number(p.inventoryMaxAgeHours)) || p.inventoryMaxAgeHours<1 || p.inventoryMaxAgeHours>8760)throw new Error('Freshness limits must be 1–8760 hours.');
  if(!Number.isFinite(Number(p.matchThreshold)) || p.matchThreshold<.95 || p.matchThreshold>1)throw new Error('Automatic match threshold must be .95–1.');
  p.preferredRegions ||= [];
  return p;
}
