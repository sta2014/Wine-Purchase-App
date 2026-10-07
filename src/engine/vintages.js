import { canonicalGeography, canonicalType, geoKey } from './geography.js';
import { number } from './identity.js';

export const VINTAGE_PROVIDERS = [
  {id:'wa',name:'Wine Advocate',aliases:['Robert Parker','WA','RP','Robert Parker / Wine Advocate'],homepage:'https://www.robertparker.com/vintage-chart',method:'licensed',note:'Public chart page returned an application shell; no approved structured endpoint or chart data was retrieved.'},
  {id:'ws',name:'Wine Spectator',aliases:['WS'],homepage:'https://www.winespectator.com/',method:'licensed',note:'Robots policy blocks OpenAI retrieval. Use authorized manual or licensed data; no scraping.'},
  {id:'vinous',name:'Vinous',aliases:['VN','VM'],homepage:'https://vinous.com/',method:'licensed',note:'Requires approved vintage assessment export/feed; no endpoint configured.'},
  {id:'decanter',name:'Decanter',aliases:['DC'],homepage:'https://www.decanter.com/',method:'licensed',note:'Requires permitted vintage guide import/feed; no endpoint configured.'},
  {id:'jr',name:'Jancis Robinson',aliases:['JR'],homepage:'https://www.jancisrobinson.com/',method:'licensed',note:'Requires approved source access or manual provenance-bearing assessments.'},
  {id:'bbr',name:'Berry Bros. & Rudd',aliases:['BBR','Berry Brothers and Rudd'],homepage:'https://www.bbr.com/vintages',method:'manual',note:'Professional vintage assessments supported via authorized import; network access unavailable in this environment.'},
  {id:'regional',name:'Professional regional authority',aliases:[],homepage:'',method:'manual',note:'Supply the actual authority/publication, source reference, and explicitly confirm professional provenance.'},
];
export const VINTAGE_POLICY = {
  version:1, neutral:50, minSourceConfidence:.8, refreshHours:720,
  tiers:[['Exceptional',98],['Outstanding',95],['Excellent',92],['Very Good',88],['Good',83],['Average',75],['Weak',0]],
  anchors:[[0,20],[75,35],[83,45],[88,55],[92,65],[95,80],[98,95],[100,100]],
  stars:{1:60,2:75,3:85,4:93,5:98},
  categories:{poor:50,weak:65,average:75,good:83,'very good':88,excellent:93,outstanding:96,exceptional:99,legendary:100},
  letters:{'A+':99,A:96,'A-':93,'B+':89,B:85,'B-':80,C:75,D:65,F:50},
};
export function vintageProvider(name) { return VINTAGE_PROVIDERS.find(p=>[p.name,...p.aliases].some(v=>geoKey(v)===geoKey(name))); }
export function vintageTier(score) { return score==null?'Not assessed':VINTAGE_POLICY.tiers.find(([,min])=>score>=min)[0]; }
export function vintageComponent(score) {
  if(score==null) return null;
  const a=VINTAGE_POLICY.anchors;
  for(let i=1;i<a.length;i++) if(score<=a[i][0]) return a[i-1][1]+(score-a[i-1][0])/(a[i][0]-a[i-1][0])*(a[i][1]-a[i-1][1]);
  return 100;
}
export function normalizeVintageRating(value, scale=100, system='points') {
  const rawRating=String(value ?? '').trim();
  if(!rawRating) throw new Error('Vintage assessment needs an original rating.');
  system=geoKey(system).replaceAll(' ','-');
  if (/^[★☆]+$/.test(rawRating)) { system='stars'; scale=5; }
  if(system==='stars') {
    const rating=/^[★☆]+$/.test(rawRating)?[...rawRating].filter(c=>c==='★').length:Number(rawRating);
    if(Number(scale)!==5 || !VINTAGE_POLICY.stars[rating]) throw new Error('Stars require a whole rating from 1 to 5 on a 5-star scale.');
    return {rawRating,ratingSystem:'stars',score:rating,scale:5,normalizedScore:VINTAGE_POLICY.stars[rating],normalization:'Internal 5-star map: 1→60, 2→75, 3→85, 4→93, 5→98'};
  }
  if(['category','descriptive','letter'].includes(system)) {
    const normalizedScore=system==='letter'?VINTAGE_POLICY.letters[rawRating.toUpperCase()]:VINTAGE_POLICY.categories[geoKey(rawRating)];
    if(normalizedScore==null) throw new Error('Unknown qualitative vintage rating; supply a documented supported category or original numeric assessment.');
    return {rawRating,ratingSystem:system==='letter'?'letter':'category',score:null,scale:null,normalizedScore,normalization:`Internal ${system} lookup, vintage policy v${VINTAGE_POLICY.version}; not a source-published numeric score`};
  }
  if(system!=='points') throw new Error('Vintage rating system must be points, stars, category or letter.');
  scale=number(scale,'Vintage scale',{min:1,max:100});
  const range=rawRating.match(/^(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)$/);
  const score=number(range?range[1]:rawRating,'Vintage score',{min:0,max:scale});
  const scoreHigh=range?number(range[2],'Vintage upper score',{min:score,max:scale}):score;
  return {rawRating,ratingSystem:'points',score,scoreHigh,scale,normalizedScore:score/scale*100,normalization:`Original points / ${scale} × 100${range?'; conservative range lower bound':''}`};
}
export function normalizeVintageAssessment(row, source, provenance) {
  const geography=canonicalGeography(row,{inferTitle:false});
  if(!geography.path.length) throw new Error('Vintage assessments require an identifiable country/region/subregion/appellation.');
  const vintage=number(row.vintage,'Vintage',{min:1800,max:new Date().getFullYear()+1,integer:true});
  const rawPublication=String(row.publication || row.critic || (source.isDemo?source.name:'')).trim().slice(0,150);
  const provider=vintageProvider(rawPublication),publication=provider?.name || rawPublication, professional=!/reddit|vivino|cellar.?tracker|community|random blog|personal blog/i.test(rawPublication) && Boolean(provider?.id!=='regional' && provider || row.professional===true || String(row.professional).toLowerCase()==='true' || source.isDemo);
  const sourceReference=String(row.source_reference || '').trim().slice(0,500);
  const original={country:row.country || '',region:row.region || '',subregion:row.subregion || '',appellation:row.appellation || '',vineyard:row.vineyard || '',type:row.type || '',style:row.style || ''};
  const type=!row.type || /^(?:all|any|general|all types)$/i.test(String(row.type))?'All':canonicalType(row.type);
  const rating=normalizeVintageRating(row.original_rating ?? row.rating ?? row.score,row.scale ?? 100,row.rating_system || 'points');
  const eligible=professional && Boolean(publication) && Boolean(provenance.sourceURL || sourceReference || source.isDemo) && !geography.conflict;
  const tags=Array.isArray(row.context_tags)?row.context_tags:String(row.context_tags || '').split(/[;|]/);
  if(tags.length>20 || tags.some(t=>String(t).length>100)) throw new Error('Vintage context is limited to 20 short documented tags.');
  return {...provenance,...rating,vintage,publication,rawPublication,providerId:provider?.id || 'regional',professional,eligible,sourceReference,rawGeography:original,geography,country:geography.country,region:geography.region,subregion:geography.subregion,appellation:geography.appellation,type,style:geoKey(row.style),specificity:geography.level,provisional:row.provisional===true || String(row.provisional).toLowerCase()==='true',notes:String(row.notes || '').slice(0,1000),contextTags:tags.map(String).map(t=>t.trim()).filter(Boolean),warnings:[...geography.warnings,...(!eligible?['Professional publication and source URL/reference must be confirmed before use.']:[])],normalizationVersion:VINTAGE_POLICY.version};
}
export function vintageRecordKey(record) {
  return JSON.stringify([record.sourceId,geoKey(record.publication),record.vintage,record.geography.leafId,record.type,record.style || '',record.sourceReference || record.sourceURL]);
}
export function upsertVintage(state, record) {
  const previous=state.vintages.find(r=>r.recordKey===record.recordKey);
  if(previous && Date.parse(record.observedAt)<Date.parse(previous.observedAt)) throw new Error('Vintage update would overwrite a newer source assessment.');
  if(previous && previous.rawRating===record.rawRating && previous.normalizedScore===record.normalizedScore && previous.notes===record.notes && previous.confidence===record.confidence && previous.eligible===record.eligible && previous.provisional===record.provisional && JSON.stringify(previous.mappingFields)===JSON.stringify(record.mappingFields) && JSON.stringify(previous.contextTags)===JSON.stringify(record.contextTags)) {
    previous.lastRetrievedAt=record.retrievedAt; previous.observedAt=record.observedAt; return previous;
  }
  if(previous) { record.id=previous.id; record.revisions=[...(previous.revisions || []),{rawRating:previous.rawRating,normalizedScore:previous.normalizedScore,observedAt:previous.observedAt,retrievedAt:previous.retrievedAt,notes:previous.notes}].slice(-50); record.retrievedAt=previous.retrievedAt; record.lastRetrievedAt=record.observedAt; state.vintages[state.vintages.indexOf(previous)]=record; }
  else state.vintages.push(record);
  return record;
}
export function matchVintage(wine, record, geography=canonicalGeography(wine)) {
  const reasons=[];
  if(wine.warnings?.some(w=>/vintage.*conflict|Multiple vintage/i.test(w))) reasons.push('Conflicting vintage identity');
  if(wine.vintage==null || wine.vintage!==record.vintage) reasons.push('Vintage year missing or different');
  if(geography.conflict || record.geography?.conflict) reasons.push('Geographic identity requires correction');
  if(!record.eligible) reasons.push('Professional source/provenance not established');
  if(record.confidence<VINTAGE_POLICY.minSourceConfidence) reasons.push('Vintage source confidence below minimum');
  const path=geography.path, index=path.findIndex(n=>n.id===record.geography?.leafId);
  if(index<0) reasons.push('Assessment geography is not an ancestor of this wine');
  if(record.type!=='All' && (geography.type==='Unknown' || record.type!==geography.type)) reasons.push('Wine type unknown or different');
  if(record.style && record.style!==geography.style) reasons.push('Variety/style unknown or different');
  if(path.some(n=>n.id==='champagne') && record.geography?.level==='country') reasons.push('Champagne requires Champagne-specific vintage context');
  return {accepted:!reasons.length,reviewable:!reasons.length,confidence:!reasons.length?record.confidence:0,depth:index+1,typeSpecific:record.type!=='All',styleSpecific:Boolean(record.style),reasons:reasons.length?reasons:['Geography, vintage and wine type are compatible']};
}
const median=values=>{const s=values.toSorted((a,b)=>a-b),i=Math.floor(s.length/2);return s.length%2?s[i]:(s[i-1]+s[i])/2;};
export function wineGeography(state, wine) {
  const fields=state.geographyCorrections?.[wine.id]?.fields;
  return canonicalGeography(fields?{...wine,...fields,rawTitle:''}:wine);
}
export function buildVintageIndex(records) {
  const index=new Map();
  for(const r of records) {
    if(!r.geography) continue;
    if(!index.has(r.vintage)) index.set(r.vintage,new Map());
    const year=index.get(r.vintage),key=r.geography.leafId;
    if(!year.has(key)) year.set(key,[]); year.get(key).push(r);
  }
  return index;
}
export function vintageCandidates(index, geography, year) {
  const records=index.get(year);
  return records?geography.path.flatMap(n=>records.get(n.id) || []):[];
}
export function assessVintage(state, wine, records=state.vintages, options={}) {
  const geography=options.geography || wineGeography(state,wine);
  const base={score:null,component:null,tier:'Not assessed',confidence:null,confidenceLabel:'Unknown',geography,regionUsed:'',level:'unknown',sources:[],candidates:[],sourceCount:0,spread:null,fallback:false,contextTags:[],method:'Most specific eligible geographic level; type/style-specific data preferred at that level; one median per professional publication, credibility-weighted across publications.'};
  if(wine.vintage==null) return {...base,status:wine.vintageKind==='non-vintage'?'Non-Vintage — Vintage Score Not Applicable':wine.vintageKind==='multi-vintage'?'Multi-Vintage — Vintage Score Not Applicable':'Unknown vintage — no year-based assessment',notApplicable:['non-vintage','multi-vintage'].includes(wine.vintageKind)};
  const demo=options.demo ?? Boolean(state.sources.find(s=>s.id===state.listings.find(l=>l.wineId===wine.id)?.sourceId)?.isDemo);
  const active=new Set(state.sources.filter(s=>s.enabled && Boolean(s.isDemo)===demo).map(s=>s.id));
  const candidates=records.filter(r=>r.vintage===wine.vintage && active.has(r.sourceId)).map(record=> {
    // Legacy records stay visible; incomplete provenance is not silently promoted.
    const match=record.geography?matchVintage(wine,record,geography):{accepted:false,reasons:['Legacy assessment needs publication/provenance and canonical geography']};
    const decision=state.vintageDecisions?.[`${wine.id}:${record.id}`];
    return {record,match:{...match,accepted:match.accepted && decision?.state!=='rejected',reasons:decision?.state==='rejected'?['Manually rejected geographic match']:match.reasons},decision};
  });
  let accepted=candidates.filter(c=>c.match.accepted);
  if(!accepted.length) return {...base,candidates,status:geography.conflict?'Geographic mapping requires review':'No reliable vintage data found'};
  const depth=Math.max(...accepted.map(c=>c.match.depth));
  accepted=accepted.filter(c=>c.match.depth===depth);
  if(accepted.some(c=>c.match.styleSpecific)) accepted=accepted.filter(c=>c.match.styleSpecific);
  if(accepted.some(c=>c.match.typeSpecific)) accepted=accepted.filter(c=>c.match.typeSpecific);
  // Keep superseded charts inspectable, using only the latest dated assessment
  // per publication at the selected geographic/type/style level.
  const latestPublication=new Map();
  for(const c of accepted) { const key=geoKey(c.record.publication); latestPublication.set(key,Math.max(latestPublication.get(key) || 0,Date.parse(c.record.observedAt))); }
  accepted=accepted.filter(c=>Date.parse(c.record.observedAt)===latestPublication.get(geoKey(c.record.publication)));
  const sources=accepted.map(c=>c.record), groups=new Map();
  for(const r of sources) { const key=geoKey(r.publication); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(r); }
  const publications=[...groups.values()].map(group=>({score:median(group.map(r=>r.normalizedScore)),weight:(vintageProvider(group[0].publication)?1:.75)*Math.min(...group.map(r=>r.confidence))}));
  const score=publications.reduce((n,p)=>n+p.score*p.weight,0)/publications.reduce((n,p)=>n+p.weight,0);
  const spread=Math.max(...publications.map(p=>p.score))-Math.min(...publications.map(p=>p.score));
  const node=geography.path[depth-1], fallback=depth<geography.path.length;
  const specificity=node.level==='country'?.35:node.level==='region'?.75:node.level==='subregion'?.9:1;
  const typeConfidence=sources[0].type==='All'?.8:geography.typeBasis==='Appellation convention'?.9:1;
  const confidence=Math.min(.99,(.7+Math.min(groups.size-1,3)*.09)*specificity*typeConfidence*Math.min(...sources.map(r=>r.confidence))*Math.max(.4,1-spread/40)*(sources.some(r=>r.provisional)?.85:1));
  const confidenceLabel=confidence>=.92?'Very High':confidence>=.78?'High':confidence>=.55?'Medium':'Low';
  return {...base,score,component:vintageComponent(score),tier:vintageTier(score),confidence,confidenceLabel,regionUsed:node.name,level:node.level,sources,candidates,sourceCount:groups.size,spread,fallback,contextTags:[...new Set(sources.flatMap(r=>r.contextTags || []))],status:spread>=8?'Conflicting source data':node.level==='country'?'Broad fallback data used':fallback?'Partial geographic data available':'Documented vintage data available',fallbackReason:fallback?`Specific ${geography.path.at(-1).name} data unavailable; using ${node.name}`:'Most specific available geographic match'};
}
