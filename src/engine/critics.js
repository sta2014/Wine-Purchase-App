// All scoring policy lives here. Published facts are imported, never generated.
import { normalized } from './identity.js';
export const CRITICS = [
  { id: 'wa', name: 'Wine Advocate', aliases: ['wa', 'rp', 'robert parker', 'parker', 'wine advocate', 'robert parker wine advocate', 'rp wa', 'wa rp'], domain: 'robertparker.com', scale: 100 },
  { id: 'vn', name: 'Vinous', aliases: ['vn', 'vm', 'ag', 'vinous', 'vinous media', 'antonio galloni'], domain: 'vinous.com', scale: 100 },
  { id: 'ws', name: 'Wine Spectator', aliases: ['ws', 'wine spectator', 'jm', 'james molesworth'], domain: 'winespectator.com', scale: 100 },
  { id: 'js', name: 'James Suckling', aliases: ['js', 'james suckling'], domain: 'jamessuckling.com', scale: 100 },
  { id: 'jd', name: 'Jeb Dunnuck', aliases: ['jd', 'jeb dunnuck'], domain: 'jebdunnuck.com', scale: 100 },
  { id: 'we', name: 'Wine Enthusiast', aliases: ['we', 'wine enthusiast'], domain: 'wineenthusiast.com', scale: 100 },
  { id: 'bh', name: 'Burghound', aliases: ['bh', 'am', 'burghound', 'allen meadows'], domain: 'burghound.com', scale: 100 },
  { id: 'ib', name: 'Jasper Morris / Inside Burgundy', aliases: ['ib', 'jasper morris', 'inside burgundy', 'jasper morris inside burgundy'], domain: 'insideburgundy.com', scale: 100 },
  { id: 'dc', name: 'Decanter', aliases: ['dc', 'd', 'decanter'], domain: 'decanter.com', scale: 100 },
  { id:'twi',name:'The Wine Independent',aliases:['twi','wi','the wine independent','wine independent'],domain:'thewineindependent.com',scale:100 },
  { id:'ja', name:'Jane Anson', aliases:['ja','jane anson'], domain:'janeanson.com', scale:100 },
  { id: 'jr', name: 'Jancis Robinson', aliases: ['jr', 'jancis robinson'], domain: 'jancisrobinson.com', scale: 20 },
];
export const QUALITY_POLICY = {version:3,method:'Published score / stated scale × 100; no invented missing score.'};
export function criticInfo(value) { const key = normalized(value); return CRITICS.find(p => p.aliases.includes(key) || normalized(p.name) === key); }
export const criticReviewer = value => ['jm','james molesworth'].includes(normalized(value)) ? 'James Molesworth' : '';
export const publicationName = value => criticInfo(value)?.name || String(value || '').trim();
export const isCommunity = value => /\b(cellar ?tracker|vivino|community|user rating|user reviews?|customer|consumer|star ratings?|retailer|crowd)\b/.test(normalized(value));
export function parseCriticScore(raw, scale = 100) {
  if (raw == null || String(raw).trim() === '') return { score: null, scoreHigh: null, rawScore: '', normalizedScore: null };
  const rawScore = String(raw).trim();
  if(rawScore.startsWith('(')!==/\)(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(rawScore))throw new Error(`Unbalanced parentheses in critic score “${rawScore}”.`);
  const m = rawScore.match(/^\(?\s*(\d+(?:\.\d+)?)\s*(?:[-–—−‑‒‐]\s*(\d+(?:\.\d+)?))?\s*(\+)?\s*\)?(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m) throw new Error(`Unsupported critic score “${rawScore}”; use a number, range, or plus score.`);
  const score = Number(m[1]), scoreHigh = Number(m[2] ?? m[1]);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 100 || score < 0 || scoreHigh > scale || scoreHigh < score || (m[4] && Number(m[4]) !== scale)) throw new Error('Critic score is outside its stated scale.');
  return { score, scoreHigh, rawScore, plus: Boolean(m[3]), normalizedScore: score / scale * 100 };
}
export function criticColumn(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(score|rating|points)$/, '');
  if(['jm','jamesmolesworth'].includes(key))return 'jm';
  return CRITICS.find(c => c.aliases.some(a => a.replace(/[^a-z0-9]/g, '') === key))?.id;
}
export function retailerScores(raw) {
  const scores=[],warnings=[],notRated=[];
  const add=(label,value)=>{
    const critic=criticInfo(label);if(!critic)return;
    const original=String(value ?? '').trim();
    if(!original)return;
    const info={critic:critic.name,publication:critic.name,reviewer:criticReviewer(label),scale:critic.scale};
    if(/^\(?\s*(?:nr|not[ -]?rated)\s*\)?$/i.test(original)){notRated.push({...info,rawScore:original});return;}
    const stage=original.match(/\s*\((final(?: bottle)?|barrel|preliminary)\)\s*$/i);
    const notation=stage?original.slice(0,stage.index).trim():original;
    try{const parsed=parseCriticScore(notation,critic.scale);if(parsed.score!=null)scores.push({...info,...parsed,originalNotation:original,reviewStage:stage?/^final/i.test(stage[1])?'final':stage[1].toLowerCase():'unspecified'});}
    catch(e){warnings.push(`${critic.name}: ${e.message} Original entry: ${original}`);}
  };
  for(const [key,value] of Object.entries(raw)){const id=criticColumn(key);if(id && value!=null && String(value).trim())add(id==='jm'?'JM':CRITICS.find(c=>c.id===id).name,value);}
  const combined=Object.entries(raw).filter(([k])=>/^(ratings?|score|critic_ratings|critic_scores|professional_ratings)$/i.test(k.replace(/[\s-]+/g,'_'))).map(([,v])=>String(v ?? '')).join('; ');
  if(combined.trim()){
    const labels=CRITICS.flatMap(c=>c.aliases).sort((a,b)=>b.length-a.length);
    const pattern=labels.map(a=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s+')).join('|');
    const labelRegex=new RegExp(`(?<![a-z0-9])(${pattern})(?![a-z])`,'gi');
    // A slash before a number is a score scale; a slash before a label separates entries.
    for(const chunk of combined.split(/[;,\r\n]|\/(?!\s*\d)/).map(t=>t.trim()).filter(Boolean)){
      const matches=[...chunk.matchAll(labelRegex)];
      if(!matches.length){if(!/^(?:nr|not[ -]?rated)$/i.test(chunk))warnings.push(`Unrecognized ratings entry: ${chunk}`);continue;}
      const prefix=chunk.slice(0,matches[0].index).trim();
      if(prefix){
        if(/^[\d(]/.test(prefix)){
          if(chunk.slice(matches.at(-1).index+matches.at(-1)[0].length).trim()){warnings.push(`Ambiguous score/label ordering: ${chunk}`);continue;}
          for(let i=0;i<matches.length;i++)add(matches[i][0],chunk.slice(i?matches[i-1].index+matches[i-1][0].length:0,matches[i].index).trim());
          continue;
        }
        warnings.push(`Unparsed ratings text: ${prefix}`);
      }
      for(let i=0;i<matches.length;i++){
        const m=matches[i],value=chunk.slice(m.index+m[0].length,matches[i+1]?.index ?? chunk.length).replace(/^\s*[:=]\s*/,'').trim();
        if(!value)warnings.push(`${publicationName(m[0])}: missing score; retained for review.`);else add(m[0],value);
      }
    }
  }
  return {scores,warnings,notRated,rawRatings:combined};
}
export function reviewKey(r) {
  // Retrieval time is deliberately excluded: refreshing preserves IDs and decisions.
  return JSON.stringify([r.sourceId, r.wine?.beverageId || r.wineId, normalized(r.publication || r.critic), normalized(r.reviewer || ''), r.reviewDate || '', r.verification === 'retailer_reported' ? '' : r.sourceReference || '', r.verification === 'retailer_reported' ? '' : r.sourceURL || '', r.score, r.scoreHigh ?? r.score, r.plus === true, r.scale, r.drinkFrom, r.drinkTo, r.formatSpecific ? r.wineId : '', r.kind, r.kind==='community'?r.ratingCount:null, r.kind==='community'?r.observedAt:null, r.reviewStage]);
}
export function upsertReview(state, record, index = null) {
  const key = reviewKey(record);
  let existing = index ? index.get(key) : state.reviews.find(r => reviewKey(r) === key);
  if(!existing && record.verification==='retailer_reported'){
    existing=state.reviews.find(r=>r.verification==='retailer_reported' && !r.originalCell && reviewKey({...r,reviewStage:record.reviewStage})===key);
    if(existing){index?.delete(reviewKey(existing));existing.reviewStage=record.reviewStage;index?.set(key,existing);}
  }
  if (existing) { if(record.verification==='retailer_reported' && existing.verification==='retailer_reported' && record.wineId===existing.wineId){existing.wine=record.wine;existing.warnings=record.warnings;} if(record.importProvenance){existing.importHistory ||= existing.importProvenance?[existing.importProvenance]:[];if(!existing.importHistory.some(p=>JSON.stringify(p)===JSON.stringify(record.importProvenance)))existing.importHistory.push(record.importProvenance);existing.importProvenance=record.importProvenance;existing.originalCell=record.originalCell;} existing.lastRetrievedAt = record.retrievedAt; existing.reviewKey = key; existing.sourceReferences ||= [{reference:existing.sourceReference || '',url:existing.sourceURL || ''}]; if(!existing.sourceReferences.some(s=>s.reference===(record.sourceReference || '') && s.url===(record.sourceURL || ''))) existing.sourceReferences.push({reference:record.sourceReference || '',url:record.sourceURL || ''}); if (record.verified && !existing.verified) { existing.verified = true; existing.verification = record.verification; } return false; }
  const saved = { ...record, reviewKey: key }; state.reviews.push(saved); index?.set(key, saved); return true;
}
const median = values => { const s = [...values].sort((a,b) => a-b), i = Math.floor(s.length/2); return s.length % 2 ? s[i] : (s[i-1]+s[i])/2; };
export function compositeCritics(reviews, { verifiedOnly = false } = {}) {
  const all = reviews.filter(r => !r.excludedReason && r.kind === 'critic' && !isCommunity(r.publication || r.critic) && r.score != null);
  // Collapse corroborating exact facts only; different named reviewers/dates/stages remain distinct.
  const unique=[];
  for(const r of [...all].sort((a,b)=>Number(Boolean(b.verified))-Number(Boolean(a.verified)))){
    const old=unique.find(o=>publicationName(o.publication || o.critic)===publicationName(r.publication || r.critic) && o.score===r.score && (o.scoreHigh ?? o.score)===(r.scoreHigh ?? r.score) && o.scale===r.scale && (!(o.reviewer && r.reviewer) || normalized(o.reviewer)===normalized(r.reviewer)) && (!(o.reviewDate && r.reviewDate) || o.reviewDate===r.reviewDate) && (o.reviewStage===r.reviewStage || [o.reviewStage,r.reviewStage].some(s=>!s || s==='unspecified')) && ((normalized(o.reviewer || '')===normalized(r.reviewer || '') && (o.reviewDate || '')===(r.reviewDate || '')) || (o.verified && r.verification==='retailer_reported')));
    const refs=r.sourceReferences || [{reference:r.sourceReference || '',url:r.sourceURL || '',source:r.sourceName || ''}];
    if(old){for(const ref of refs)if(!old.sourceReferences.some(x=>JSON.stringify(x)===JSON.stringify(ref)))old.sourceReferences.push({...ref});old.corroboratingIds.push(r.id);}
    else unique.push({...r,sourceReferences:refs.map(x=>({...x})),corroboratingIds:[r.id]});
  }
  const groups=new Map(),conflicts=[];
  for(const r of unique){const pub=publicationName(r.publication || r.critic);if(!groups.has(pub))groups.set(pub,[]);groups.get(pub).push(r);}
  const publications = [];
  for (const [name, rows] of groups) {
    const verified=rows.filter(r=>r.verified),eligible=verified.length?verified:verifiedOnly?[]:rows,final=eligible.filter(r=>r.reviewStage==='final'),selected=final.length?final:eligible;
    if (verified.length && rows.some(r => !r.verified && !verified.some(v => v.score / v.scale <= r.scoreHigh / r.scale && r.score / r.scale <= v.scoreHigh / v.scale))) conflicts.push(`${name}: retailer/import score differs from verified review; verified evidence takes precedence.`);
    if (selected.length) publications.push({ name, score: median(selected.map(r => r.score/r.scale*100)), reviews: selected.length, verified: verified.length > 0, credibility: criticInfo(name) ? 1 : .5 });
  }
  const values = publications.map(p => p.score), score = values.length ? publications.reduce((n,p) => n+p.score*p.credibility,0)/publications.reduce((n,p) => n+p.credibility,0) : null;
  const spread = values.length ? Math.max(...values)-Math.min(...values) : null;
  const confidence = score == null ? null : Math.max(.2, Math.min(1, .45 + .1*Math.min(publications.length,4) + .1*(publications.filter(p=>p.verified).length / publications.length) - Math.min(.25, spread*.02))) * (publications.reduce((n,p)=>n+p.credibility,0)/publications.length);
  return { score, publications, evidenceReviews:unique, reviewCount: unique.length, publicationCount: publications.length, verifiedCount: unique.filter(r=>r.verified).length, spread, confidence, conflicts, method: 'Equal weights for registered professional publications (unregistered sources half weight); median of each publication’s reviews; lower end of ranges; final bottle reviews preferred within each provenance tier; verified evidence takes precedence. No plus-point bonus.' };
}
export function qualityComponent(score){return score==null?null:Math.max(0,Math.min(100,score));}
export function criticSearchLinks(wine) {
  const identity = [wine.producer, wine.cuvee, wine.vineyard, wine.appellation, wine.vintage ?? wine.rawVintage, wine.designation].filter(Boolean).join(' ');
  return CRITICS.map(p => ({ name: p.name, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${p.domain} ${identity} score review`)}` }));
}
