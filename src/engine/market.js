import { matchWine, normalized, number, identifyWine } from './identity.js';
import { canonicalGeography } from './geography.js';

export const MARKET_POLICY = { version: 1, freshHours: 12, maxAgeHours: 48, fxMaxAgeHours: 24, minMerchantConfidence: .8, minVerificationConfidence: .95, minMatchConfidence: .95, baseCurrency: 'USD', scope: 'US', anchors: [[-.25,0],[0,20],[.05,35],[.1,50],[.2,75],[.3,90],[.4,100]] };
export const AVAILABILITY = ['CONFIRMED_IN_STOCK','LIMITED_IN_STOCK','LIKELY_IN_STOCK','PRE_ARRIVAL','FUTURES','OUT_OF_STOCK','SOLD','EXPIRED','UNKNOWN','ACTIVE_AUCTION'];
export const MARKET_PROVIDERS = [
  {id:'market-import',name:'Approved market price imports',method:'manual',note:'Verified merchant offers via authorized Excel, CSV, JSON or manual entry; stock evidence and a verification timestamp are required.'},
  {id:'merchant-feed',name:'Approved merchant inventory feed',method:'json',note:'Configure a permitted HTTPS inventory feed. No merchant feed is connected by default.'},
  {id:'market-aggregator',name:'Licensed market aggregator feed',method:'licensed',note:'Requires licensed/API access and an approved structured offer feed; search snippets are excluded.'},
];
const clamp = n => Math.max(0,Math.min(1,n));
export const median = values => { const s=[...values].sort((a,b)=>a-b),i=Math.floor(s.length/2); return s.length?s.length%2?s[i]:(s[i-1]+s[i])/2:null; };
const date = (v,now,label) => { if(!v) return null; const n=Date.parse(v); if(!Number.isFinite(n) || n>Date.parse(now)+300000) throw new Error(`${label} must be a valid non-future timestamp.`); return new Date(n).toISOString(); };
const text=(v,max=1000)=>String(v ?? '').slice(0,max);
const truth=v=>v===true || String(v).toLowerCase()==='true';
function url(v) { if(!v) return ''; const u=new URL(v); if(!['https:','http:'].includes(u.protocol) || u.username || u.password) throw new Error('Market links require HTTP(S) without credentials.'); return u.href; }
export function normalizeMarketOffer(r,base,source,now) {
  const availabilityStatus=text(r.availability_status || (base.isAvailable===false?'OUT_OF_STOCK':'UNKNOWN')).toUpperCase().replaceAll(/[- ]/g,'_');
  if(!AVAILABILITY.includes(availabilityStatus)) throw new Error('Unknown market availability status.');
  const offerType=text(r.offer_type || (base.saleType==='auction'?'historical_auction':'retail')).toLowerCase();
  if(!['retail','pre_arrival','futures','active_auction','historical_auction','historical','valuation','search_lead'].includes(offerType)) throw new Error('Unknown market offer type.');
  const verificationMethod=text(r.verification_method || 'unverified',80);
  if(!['unverified','manual_merchant_check','merchant_feed','licensed_feed','structured_merchant'].includes(verificationMethod)) throw new Error('Unknown availability verification method.');
  const verificationEvidence=text(r.verification_evidence,2000);
  const originalObservationAt=date(r.original_observation_at,now,'Historical observation date');
  const historicalReliability=text(r.historical_reliability || (originalObservationAt?'documented-date':'undated'),100);
  const verifiedAt=date(r.verified_at,now,'Last verification');
  const verified=truth(r.availability_verified) && !!verifiedAt && !!verificationEvidence && verificationMethod!=='unverified';
  const country=text(r.merchant_country,100), offerURL=url(r.offer_url || base.sourceURL),merchantURL=url(r.merchant_url);
  const taxTreatment=text(r.tax_treatment || base.priceTerms);
  if(!['unspecified','ex_tax','tax_included','landed'].includes(taxTreatment)) throw new Error('Unknown tax treatment.');
  const fxRate=number(r.fx_rate,'FX rate',{min:.000001,max:1e6,optional:true});
  const fxAt=date(r.fx_at,now,'FX timestamp');
  const normalizedCurrency=text(r.normalized_currency || base.currency,3).toUpperCase();
  if(!Intl.supportedValuesOf('currency').includes(normalizedCurrency)) throw new Error('Invalid comparison currency.');
  const taxRate=number(r.tax_rate,'Tax rate',{min:0,max:1,optional:true});
  return {...base,originalObservationAt,historicalReliability,condition:text(r.condition,500),provenanceDetails:text(r.provenance_details,1000),marketSchema:1,availabilityStatus,offerType,verificationMethod,verificationEvidence,availabilityVerified:verified,verifiedAt,
    verificationConfidence:number(r.verification_confidence ?? (verified?1:0),'Verification confidence',{min:0,max:1}),
    merchantCountry:country,merchantLocation:text(r.merchant_location,250),merchantURL,offerURL,sourceReference:text(r.source_reference,500),
    merchantConfidence:number(r.merchant_confidence ?? .5,'Merchant confidence',{min:0,max:1}),taxTreatment,taxRate,taxReference:text(r.tax_reference,500),
    shippingInformation:text(r.shipping_information,1000),shippingPrice:number(r.shipping_price,'Shipping price',{min:0,max:1e6,optional:true}),
    fxRate,fxAt,fxReference:text(r.fx_reference,500),normalizedCurrency,normalizedUnitPrice:base.currency===normalizedCurrency?base.unitPrice:fxRate?base.unitPrice*fxRate:null,
    sourceUpdatedAt:date(r.source_updated_at,now,'Source update'),freshHours:number(r.fresh_hours ?? source.freshHours ?? MARKET_POLICY.freshHours,'Fresh threshold',{min:1,max:8760}),
    maxAgeHours:number(r.max_age_hours ?? source.maxAgeHours ?? MARKET_POLICY.maxAgeHours,'Stale threshold',{min:1,max:8760}),
    currentBid:number(r.current_bid,'Current bid',{min:0,max:1e8,optional:true}),auctionEstimate:text(r.auction_estimate,250),buyerPremium:number(r.buyer_premium,'Buyer premium',{min:0,max:1,optional:true}),auctionClosesAt:dateFuture(r.auction_closes_at),
    originalListing:{rawTitle:base.rawTitle,format:text(r.format || `${base.packCount}x${base.bottleMl}ml`),price:r.price ?? r.unit_price,currency:base.currency,availability:text(r.availability_status || r.is_available),packaging:base.packaging},
  };
}
function dateFuture(v) { if(!v) return null; if(!Number.isFinite(Date.parse(v))) throw new Error('Invalid auction closing date.'); return new Date(v).toISOString(); }
export function marketOfferKey(r) { return r.marketKey || JSON.stringify([r.sourceId,normalized(r.merchant),r.externalId || cleanURL(r.offerURL || r.sourceURL) || r.wineId,r.wineId,r.currency,r.priceTerms,r.offerType]); }
export function upsertMarket(state,record,index=null) {
  const key=marketOfferKey(record), previous=index?index.get(key):state.market.find(r=>marketOfferKey(r)===key);
  if(previous) {
    if(Date.parse(record.observedAt)<Date.parse(previous.observedAt)) throw new Error('Market refresh would overwrite a newer observation.');
    const revisions=[...(previous.revisions || []),{price:previous.price,unitPrice:previous.unitPrice,currency:previous.currency,availabilityStatus:previous.availabilityStatus,observedAt:previous.observedAt,verifiedAt:previous.verifiedAt,retrievedAt:previous.retrievedAt,event:'refreshed'}];
    const correction=state.marketCorrections?.[previous.id];
    if(correction) {const wine=identifyWine({raw_title:record.rawTitle,...record.wine,raw_vintage:record.wine.rawVintage,bottle_ml:correction.bottleMl,pack_count:correction.packCount,packaging:correction.packaging});Object.assign(record,{originalWine:record.wine,wine,wineId:wine.id,bottleMl:wine.bottleMl,packCount:wine.packCount,packaging:wine.packaging,unitPrice:record.price/wine.packCount,pricePer750:record.price/wine.packCount*750/wine.bottleMl});state.wines[wine.id]=wine;}
    const id=previous.id; Object.assign(previous,record,{id,marketKey:key,revisions}); return previous;
  }
  record.marketKey=key; state.market.push(record); index?.set(key,record); return record;
}
export function cleanURL(value) { if(!value) return ''; try { const u=new URL(value);u.hash=''; for(const k of [...u.searchParams.keys()]) if(/^(utm_|srsltid|gclid|fbclid)/i.test(k)) u.searchParams.delete(k); return u.href.replace(/\/$/,''); } catch { return ''; } }
export const merchantKey=r=>r.merchantURL?new URL(r.merchantURL).hostname.replace(/^www\./,''):normalized(r.merchant).replace(/\b(wines?|wine merchants?|inc|llc|ltd|limited)\b/g,'').trim();
export function marketTitleKey(w) {return normalized(w.rawTitle).replace(/\b(?:18|19|20)\d{2}\b/g,'').replace(/\b\d+ x \d+(?: \d+)? (?:ml|cl|l)\b/g,'').replace(/\b\d+(?: \d+)?\s*(?:ml|cl|l)\b/g,'').replace(/\b(?:owc|original wooden case|magnum|double magnum)\b/g,'').replace(/^(?:chateau|domaine) /,'').replace(/\s+/g,' ').trim();}
export function marketMatch(wine,other) {
  if(!other) return {confidence:0,automatic:false,reviewable:false,reasons:['Unknown wine identity']};
  if(wine.packaging!=='loose' && wine.packCount!==other.packCount) return {confidence:0,automatic:false,reviewable:false,reasons:['Original case/package count differs; package premium cannot be normalized automatically']};
  // Bottle count can be normalized; bottle volume and value-sensitive packaging cannot.
  const a={...wine,packCount:other.packCount,id:wine.beverageId===other.beverageId?other.id:wine.id},b=other;
  const ga=canonicalGeography(wine),gb=canonicalGeography(other);
  for(const key of ['country','region','subregion','appellation']) if(ga[key] && gb[key] && normalized(ga[key])===normalized(gb[key])) a[key]=other[key];
  let match=matchWine(a,b,{format:true});
  const designation=marketTitleKey;
  if((!wine.canonicalProducer || !other.canonicalProducer) && wine.cuveeExplicit && other.cuveeExplicit && normalized(wine.cuvee)!==normalized(other.cuvee)) return {confidence:0,automatic:false,reviewable:false,reasons:['Explicit cuvées differ']};
  if((!wine.canonicalProducer || !other.canonicalProducer) && ![...wine.warnings,...other.warnings].some(w=>/conflict|Multiple/.test(w)) && (!ga.country || !gb.country || ga.country===gb.country) && (!ga.path.length || !gb.path.length || ga.path.some(n=>n.id===gb.leafId) || gb.path.some(n=>n.id===ga.leafId)) && wine.vintage!=null && wine.vintage===other.vintage && wine.formatKnown && other.formatKnown && wine.bottleMl===other.bottleMl && wine.packaging===other.packaging && designation(wine)===designation(other) && ['vineyard','classification','designation'].every(k=>normalized(wine[k])===normalized(other[k])) && !ga.conflict && !gb.conflict) match={confidence:1,automatic:true,reviewable:false,reasons:['Exact full wine designation and vintage; producer fields unavailable, bottle count normalized']};
  const cuveeEqual=normalized(wine.cuvee)===normalized(other.cuvee);
  const optionalExact=['vineyard','classification','designation'].every(k=>normalized(wine[k])===normalized(other[k]));
  const sameGeo=ga.leafId && ga.leafId===gb.leafId;
  if(match.reviewable && cuveeEqual && optionalExact && sameGeo && !wine.warnings.some(w=>/conflict|Multiple/.test(w)) && !other.warnings.some(w=>/conflict|Multiple/.test(w)) && wine.packaging===other.packaging && wine.bottleMl===other.bottleMl) return {...match,confidence:1,automatic:true,reviewable:false,reasons:['Exact beverage and geographic aliases; package count normalized']};
  return match;
}
export function buildMarketIndex(records) {
  const index=new Map();index.urls=new Map(); for(const r of records) { const w=r.wine; const key=w?.canonicalProducer || w?.beverageId || r.wineId; if(!index.has(key)) index.set(key,[]); index.get(key).push(r);if(w){const titleKey='title:'+marketTitleKey(w);if(!index.has(titleKey))index.set(titleKey,[]);index.get(titleKey).push(r);} const u=cleanURL(r.offerURL || r.sourceURL);if(u) {if(!index.urls.has(u)) index.urls.set(u,[]);index.urls.get(u).push(r);} } return index;
}
export function marketFreshness(r,now,preferences) {
  const verified=Date.parse(r.verifiedAt),observed=Date.parse(r.observedAt),retrieved=Date.parse(r.retrievedAt);
  if(![verified,observed,retrieved].every(Number.isFinite) || [verified,observed,retrieved].some(n=>n>+now)) return 'STALE';
  const age=(+now-Math.min(verified,observed,retrieved))/3600000;
  const max=Math.min(preferences.marketMaxAgeHours,r.maxAgeHours ?? MARKET_POLICY.maxAgeHours);
  return age>max?'STALE':age>(r.freshHours ?? MARKET_POLICY.freshHours)?'AGING':'FRESH';
}
export function assessMarket(state,listing,now=new Date(),index=null) {
  const wine=state.wines[listing.wineId],demo=!!state.sources.find(s=>s.id===listing.sourceId)?.isDemo;
  const p=state.preferences,scope=p.marketScope || MARKET_POLICY.scope,baseCurrency=p.baseCurrency || MARKET_POLICY.baseCurrency;
  const candidates=[],eligible=[],lookup=index || buildMarketIndex(state.market);
  const records=[...new Set([...(lookup.get(wine.canonicalProducer || wine.beverageId || wine.id) || []),...(lookup.get('title:'+marketTitleKey(wine)) || [])])];
  for(const r of records) {
    const source=state.sources.find(s=>s.id===r.sourceId); if(!source?.enabled || !!source.isDemo!==demo) continue;
    const other=r.wine || state.wines[r.wineId],match=marketMatch(wine,other),decision=state.decisions[r.id],control=state.marketControls?.[r.id];
    const approved=decision?.wineId===wine.id && decision.state==='approved' && match.reviewable;
    const freshness=marketFreshness(r,now,p),reasons=[];
    const underlying=lookup.urls?.get(cleanURL(r.offerURL || r.sourceURL)) || [];
    const currentReports=underlying.filter(x=>{const s=state.sources.find(v=>v.id===x.sourceId);return s?.enabled && !!s.isDemo===demo;});
    const newest=currentReports.reduce((latest,x)=>!latest || Date.parse(x.observedAt)>Date.parse(latest.observedAt)?x:latest,null);
    if(newest && Date.parse(newest.observedAt)>Date.parse(r.observedAt)) reasons.push('Superseded by a newer observation of the underlying merchant listing');
    if(currentReports.some(x=>x.id!==r.id && Date.parse(x.observedAt)===Date.parse(r.observedAt) && (!['CONFIRMED_IN_STOCK','LIMITED_IN_STOCK'].includes(x.availabilityStatus) || !x.isAvailable || (x.wine?.beverageId && x.wine.beverageId!==other?.beverageId)))) reasons.push('Conflicting current reports for the same underlying listing; verify before use');
    if(!match.automatic && !approved) reasons.push(...match.reasons);
    if(decision?.wineId===wine.id && decision.state==='rejected') reasons.push('Identity match manually rejected');
    if(control?.excluded) reasons.push(control.duplicateOf?'Marked duplicate':'Offer manually excluded');
    if(r.marketSchema!==1) reasons.push('Legacy quote has no explicit stock verification; reverify before use');
    if(!['CONFIRMED_IN_STOCK','LIMITED_IN_STOCK'].includes(r.availabilityStatus) || !r.isAvailable || r.availableQuantity===0) reasons.push(`Availability: ${r.availabilityStatus || 'UNKNOWN'}`);
    if(r.offerType!=='retail' || r.saleType!=='retail') reasons.push(`Separate market channel: ${r.offerType || r.saleType}`);
    if(!r.availabilityVerified || !r.verificationEvidence || !r.verifiedAt || r.verificationMethod==='unverified' || r.verificationConfidence<MARKET_POLICY.minVerificationConfidence) reasons.push('Current merchant stock not verified');
    if(!(r.offerURL || r.sourceURL) || !r.merchant) reasons.push('Missing merchant listing provenance');
    const inventorySource=state.sources.find(s=>s.id===listing.sourceId);
    if(normalized(r.merchant)===normalized(listing.merchant || inventorySource?.name)) reasons.push('Inventory merchant excluded from external comparison');
    if(freshness==='STALE') reasons.push('Market offer stale or future-dated');
    const reliability=state.merchantReliability?.[merchantKey(r)] ?? r.merchantConfidence ?? 0;
    if(reliability<MARKET_POLICY.minMerchantConfidence) reasons.push('Merchant reliability below configured threshold');
    if(r.confidence<p.matchThreshold) reasons.push('Source data confidence below threshold');
    if(scope==='US' && !/^(us|usa|united states|united states of america)$/i.test(r.merchantCountry || '')) reasons.push('Outside US scope or merchant country unknown');
    let convertedPrice=r.unitPrice;
    if(listing.currency!==baseCurrency) reasons.push('Inventory currency differs from comparison currency');
    if(r.currency!==baseCurrency) {
      if(r.normalizedCurrency!==baseCurrency || !r.fxRate || !r.fxAt || !r.fxReference || +now-Date.parse(r.fxAt)>MARKET_POLICY.fxMaxAgeHours*3600000 || Date.parse(r.fxAt)>+now) reasons.push('Verified current FX conversion unavailable or stale');
      else convertedPrice*=r.fxRate;
    }
    const warnings=[];
    if(r.taxTreatment!==listing.priceTerms) {
      if(r.taxTreatment==='tax_included' && listing.priceTerms==='ex_tax' && r.taxRate!=null && r.taxReference) {convertedPrice/=1+r.taxRate;warnings.push('Tax removed using documented rate; eligibility to buy tax-exclusive must be checked');}
      else reasons.push('Tax/shipping basis differs; no documented normalization');
    }
    if(r.taxTreatment==='unspecified') warnings.push('Tax treatment unknown; merchandise-price comparison only');
    if(r.priceTerms==='landed' || r.taxTreatment==='landed' || listing.priceTerms==='landed') reasons.push('Delivered price cannot enter merchandise-only median');
    const candidate={...r,matchConfidence:match.confidence,matchClass:match.automatic?'EXACT':approved?'HIGH':match.reviewable?'MEDIUM':'REJECTED',manuallyApproved:approved,freshness,reliability,comparisonPrice:convertedPrice,comparisonCurrency:baseCurrency,accepted:!reasons.length,reasons,comparisonWarnings:warnings};
    candidates.push(candidate); if(candidate.accepted) eligible.push(candidate);
  }
  // Collapse the same listing across feeds; then select one cheapest current offer per merchant.
  const urls=new Map(),merchants=new Map();
  for(const r of eligible.sort((a,b)=>Date.parse(b.verifiedAt)-Date.parse(a.verifiedAt))) {
    const key=cleanURL(r.offerURL || r.sourceURL) || JSON.stringify([merchantKey(r),r.wineId,r.externalId,r.price]);
    if(urls.has(key)) {r.accepted=false;r.reasons.push('Duplicate underlying listing across providers');} else urls.set(key,r);
  }
  for(const r of urls.values()) { const key=merchantKey(r),old=merchants.get(key); if(!old || r.comparisonPrice<old.comparisonPrice) { if(old) {old.accepted=false;old.reasons.push('Additional offer from same merchant; lowest retained for statistics');} merchants.set(key,r); } else {r.accepted=false;r.reasons.push('Additional offer from same merchant; lowest retained for statistics');} }
  const distinct=[...merchants.values()],prices=distinct.map(r=>r.comparisonPrice),center=median(prices),mad=median(prices.map(v=>Math.abs(v-center)));
  // Flag extreme exact observations for review; legitimate rare-wine prices remain in the median.
  const bound=center==null?null:Math.max(3*1.4826*(mad || 0),center*.5);
  for(const r of distinct) if(distinct.length>=4 && Math.abs(r.comparisonPrice-center)>bound) {r.outlier=true;r.comparisonWarnings.push('Statistical outlier: review condition, provenance and packaging; retained in benchmark');}
  const offers=distinct.filter(r=>r.accepted),values=offers.map(r=>r.comparisonPrice),reference=median(values),lowest=values.length?Math.min(...values):null,highest=values.length?Math.max(...values):null;
  const spread=reference?(highest-lowest)/reference:null;
  const depth=offers.length===0?0:offers.length===1?.3:offers.length===2?.5:offers.length===3?.65:offers.length<8?.8:.95;
  const confidence=offers.length?clamp(depth*Math.min(...offers.map(r=>r.reliability*r.confidence*(r.manuallyApproved?.95:r.matchConfidence)*(r.freshness==='AGING'?.8:1)))*Math.max(.4,1-(spread || 0))):null;
  const minComparables=p.marketMinComparables || 3,highComparables=p.marketHighComparables || 5;
  const trimmed=values.length>=5?[...values].sort((a,b)=>a-b).slice(Math.max(1,Math.floor(values.length*.1)),-Math.max(1,Math.floor(values.length*.1))):[];
  const pricingConfidence=offers.length===0?'Insufficient':offers.length<minComparables?'Low':offers.length>=highComparables && confidence>=.7?'High':'Moderate';
  const history=marketPriceHistory(wine,records,now);
  const discount=reference==null?null:(reference-listing.unitPrice)/reference,lowestDiscount=lowest==null?null:(lowest-listing.unitPrice)/lowest;
  const rawComponent=discount==null?null:marketValueComponent(discount),component=rawComponent==null?null:rawComponent*confidence;
  return {trimmedMean:trimmed.length?trimmed.reduce((a,b)=>a+b,0)/trimmed.length:null,dispersion:spread,pricingConfidence,minComparables,history,comparisonBasis:offers.some(r=>r.packCount!==wine.packCount)?'Same physical bottle volume; per-bottle comparison across differing package counts':'Identical bottle volume and package count',status:offers.length?'Verified current market offers':'No verified current market offers found.',scope,baseCurrency,candidates,offers,referencePrice:reference,lowestPrice:lowest,highestPrice:highest,averagePrice:values.length?values.reduce((n,v)=>n+v,0)/values.length:null,offerCount:offers.length,merchantCount:offers.length,eligibleOfferCount:eligible.filter(r=>!r.reasons.some(s=>s.includes('Duplicate underlying'))).length,range:reference==null?null:[lowest,highest],confidence,confidenceLabel:confidence==null?'Unknown':confidence>=.85?'Very High':confidence>=.7?'High':confidence>=.45?'Medium':'Low',discount,lowestDiscount,dollarDiscount:reference==null?null:reference-listing.unitPrice,packageDiscount:reference==null?null:(reference-listing.unitPrice)*wine.packCount,rawComponent,component,lastVerifiedAt:offers.length?new Date(Math.min(...offers.map(r=>Date.parse(r.verifiedAt)))).toISOString():null,lastRefresh:state.sources.filter(s=>s.category==='market').map(s=>s.lastChecked).filter(Boolean).sort().at(-1) || null,availabilityLevel:offers.length===0?'Unknown':offers.length===1?'Thin market':offers.length<5?'Limited availability':'Broad availability',method:'One lowest offer per merchant, exact bottle volume and packaging, confirmed stock, fresh verification; median with outliers flagged and retained. Package-count differences disclosed. Search, auction, futures and historical data excluded.'};
}
export function marketValueComponent(discount) { const a=MARKET_POLICY.anchors; if(discount<=a[0][0]) return a[0][1]; for(let i=1;i<a.length;i++) if(discount<=a[i][0]) return a[i-1][1]+(discount-a[i-1][0])/(a[i][0]-a[i-1][0])*(a[i][1]-a[i-1][1]);return 100; }

export function marketPriceHistory(wine,records,now=new Date()) {
 const points=[];
 for(const r of records) {
  if(!marketMatch(wine,r.wine).automatic)continue;
  for(const h of [...(r.revisions || []),r]) {
   const historical=h.offerType==='historical' || r.offerType==='historical';
   const at=historical?h.originalObservationAt || r.originalObservationAt:h.observedAt;
   const price=h.unitPrice ?? (h.price!=null?h.price/r.packCount:null);
   if(!at || price==null || r.currency!=='USD' || r.offerType?.includes('auction') || historical && r.historicalReliability==='undated')continue;
   points.push({at,price,currency:r.currency,merchant:r.merchant,offerId:r.id,url:r.offerURL || r.sourceURL,category:historical?'Documented historical retail':'Locally observed retail',discoveredAt:r.retrievedAt});
  }
 }
 const unique=[...new Map(points.map(p=>[JSON.stringify([p.offerId,p.at,p.price]),p])).values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
 const changes={};
 for(const days of [30,90,180,365]) {
  const cutoff=+now-days*86400000,pairs=[];
  for(const id of new Set(unique.map(p=>p.offerId))) {const series=unique.filter(p=>p.offerId===id),current=series.at(-1),prior=series.filter(p=>Date.parse(p.at)<=cutoff).at(-1);
   if(current && prior && Date.parse(current.at)>cutoff && +now-Date.parse(current.at)<=48*3600000 && cutoff-Date.parse(prior.at)<=Math.min(14,days/3)*86400000)pairs.push((current.price-prior.price)/prior.price);
  }
  changes[days]=pairs.length?{change:median(pairs),merchantSeries:pairs.length}:null;
 }
 return {points:unique,changes,status:unique.length>=2?'Auditable price observations retained':'Insufficient verified historical price data.'};
}
