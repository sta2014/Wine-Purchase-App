// All scoring policy lives here. Published facts are imported, never generated.
import { normalized } from './identity.js';
export const CRITICS = [
  { id: 'wa', name: 'Wine Advocate', aliases: ['wa', 'rp', 'robert parker', 'parker', 'wine advocate', 'robert parker wine advocate', 'rp wa', 'wa rp'], domain: 'robertparker.com', scale: 100 },
  { id: 'vn', name: 'Vinous', aliases: ['vn', 'vm', 'ag', 'vinous', 'antonio galloni'], domain: 'vinous.com', scale: 100 },
  { id: 'ws', name: 'Wine Spectator', aliases: ['ws', 'wine spectator'], domain: 'winespectator.com', scale: 100 },
  { id: 'js', name: 'James Suckling', aliases: ['js', 'james suckling'], domain: 'jamessuckling.com', scale: 100 },
  { id: 'jd', name: 'Jeb Dunnuck', aliases: ['jd', 'jeb dunnuck'], domain: 'jebdunnuck.com', scale: 100 },
  { id: 'we', name: 'Wine Enthusiast', aliases: ['we', 'wine enthusiast'], domain: 'wineenthusiast.com', scale: 100 },
  { id: 'bh', name: 'Burghound', aliases: ['bh', 'am', 'burghound', 'allen meadows'], domain: 'burghound.com', scale: 100 },
  { id: 'jm', name: 'Jasper Morris / Inside Burgundy', aliases: ['jm', 'ib', 'jasper morris', 'inside burgundy', 'jasper morris inside burgundy'], domain: 'insideburgundy.com', scale: 100 },
  { id: 'dc', name: 'Decanter', aliases: ['dc', 'd', 'decanter'], domain: 'decanter.com', scale: 100 },
  { id: 'jr', name: 'Jancis Robinson', aliases: ['jr', 'jancis robinson'], domain: 'jancisrobinson.com', scale: 20 },
];
export const QUALITY_POLICY = { version: 2, neutral: 50, anchors: [[0, 0], [80, 0], [85, 10], [88, 20], [90, 25], [93, 40], [95, 55], [97, 70], [98, 80], [100, 100]] };
export function criticInfo(value) { const key = normalized(value); return CRITICS.find(p => p.aliases.includes(key) || normalized(p.name) === key); }
export const publicationName = value => criticInfo(value)?.name || String(value || '').trim();
export const isCommunity = value => /\b(cellar ?tracker|vivino|community|user rating|user reviews?|customer|consumer|star ratings?|retailer|crowd)\b/.test(normalized(value));
export function parseCriticScore(raw, scale = 100) {
  if (raw == null || String(raw).trim() === '') return { score: null, scoreHigh: null, rawScore: '', normalizedScore: null };
  const rawScore = String(raw).trim();
  const m = rawScore.match(/^\(?\s*(\d+(?:\.\d+)?)\s*(?:[-–—]\s*(\d+(?:\.\d+)?))?\s*(\+)?\s*\)?(?:\s*\/\s*(\d+(?:\.\d+)?))?$/);
  if (!m) throw new Error(`Unsupported critic score “${rawScore}”; use a number, range, or plus score.`);
  const score = Number(m[1]), scoreHigh = Number(m[2] ?? m[1]);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 100 || score < 0 || scoreHigh > scale || scoreHigh < score || (m[4] && Number(m[4]) !== scale)) throw new Error('Critic score is outside its stated scale.');
  return { score, scoreHigh, rawScore, plus: Boolean(m[3]), normalizedScore: score / scale * 100 };
}
export function criticColumn(value) {
  const key = String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(score|rating|points)$/, '');
  return CRITICS.find(c => c.aliases.some(a => a.replace(/[^a-z0-9]/g, '') === key))?.id;
}
export function retailerScores(raw) {
  const scores = [], warnings = [];
  const add = (critic, score) => { try { const parsed = parseCriticScore(score, critic.scale); if (parsed.score != null) scores.push({ critic: critic.name, scale: critic.scale, ...parsed }); } catch (e) { warnings.push(`${critic.name}: ${e.message}`); } };
  for (const [key, value] of Object.entries(raw)) { const id = criticColumn(key); if (id && value != null && String(value).trim()) add(CRITICS.find(c => c.id === id), value); }
  const combined = Object.entries(raw).filter(([k]) => /^(ratings?|score|critic_ratings|critic_scores|professional_ratings)$/i.test(k.replace(/[\s-]+/g, '_'))).map(([,v]) => String(v ?? '')).join('; ');
  if (combined) {
    // Require a publication label beside each value; anonymous numbers stay unscored.
    const labels = CRITICS.flatMap(c => c.aliases.map(a => ({ c, a }))).sort((a,b) => b.a.length - a.a.length);
    const pattern = labels.map(({a}) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|');
    const score = '(\\(?\\d{1,3}(?:\\.\\d+)?(?:\\s*[-–—]\\s*\\d{1,3}(?:\\.\\d+)?)?\\+?\\)?)';
    const regex = new RegExp(`(?<![a-z])(${pattern})(?![a-z])\\s*[:=]?\\s*${score}|${score}\\s*(${pattern})(?![a-z])`, 'gi');
    let m, found = false;
    while ((m = regex.exec(combined))) { found = true; const c = criticInfo(m[1] || m[4]); if (c) add(c, m[2] || m[3]); }
    if (!found) warnings.push('Ratings column has no recognized publication/score pairs; retained for manual review.');
  }
  return { scores, warnings, rawRatings: combined };
}
export function reviewKey(r) {
  // Retrieval time is deliberately excluded: refreshing preserves IDs and decisions.
  return JSON.stringify([r.sourceId, r.wine?.beverageId || r.wineId, normalized(r.publication || r.critic), normalized(r.reviewer || ''), r.reviewDate || '', r.sourceReference || '', r.sourceURL || '', r.score, r.scoreHigh ?? r.score, r.plus === true, r.scale, r.drinkFrom, r.drinkTo, r.formatSpecific ? r.wineId : '', r.kind]);
}
export function upsertReview(state, record, index = null) {
  const key = reviewKey(record), existing = index ? index.get(key) : state.reviews.find(r => (r.reviewKey || reviewKey(r)) === key);
  if (existing) { existing.lastRetrievedAt = record.retrievedAt; if (record.verified && !existing.verified) { existing.verified = true; existing.verification = record.verification; } return false; }
  const saved = { ...record, reviewKey: key }; state.reviews.push(saved); index?.set(key, saved); return true;
}
const median = values => { const s = [...values].sort((a,b) => a-b), i = Math.floor(s.length/2); return s.length % 2 ? s[i] : (s[i-1]+s[i])/2; };
export function compositeCritics(reviews, { verifiedOnly = false } = {}) {
  const all = reviews.filter(r => r.kind === 'critic' && !isCommunity(r.publication || r.critic) && r.score != null);
  // Deduplicate the same published fact relayed by multiple providers/retailers.
  const facts = new Map();
  for (const r of all) { const key = JSON.stringify([normalized(publicationName(r.publication || r.critic)), normalized(r.reviewer || ''), r.reviewDate || '', r.score, r.scoreHigh, r.scale]); const old = facts.get(key); if (!old || (!old.verified && r.verified)) facts.set(key,r); }
  const unique = [...facts.values()], groups = new Map(), conflicts = [];
  for (const r of unique) { const pub = publicationName(r.publication || r.critic); if (!groups.has(pub)) groups.set(pub,[]); groups.get(pub).push(r); }
  const publications = [];
  for (const [name, rows] of groups) {
    const verified = rows.filter(r => r.verified), selected = verified.length ? verified : verifiedOnly ? [] : rows;
    if (verified.length && rows.some(r => !r.verified && !verified.some(v => v.score / v.scale <= r.scoreHigh / r.scale && r.score / r.scale <= v.scoreHigh / v.scale))) conflicts.push(`${name}: retailer/import score differs from verified review; verified evidence takes precedence.`);
    if (selected.length) publications.push({ name, score: median(selected.map(r => r.score/r.scale*100)), reviews: selected.length, verified: verified.length > 0, credibility: criticInfo(name) ? 1 : .5 });
  }
  const values = publications.map(p => p.score), score = values.length ? publications.reduce((n,p) => n+p.score*p.credibility,0)/publications.reduce((n,p) => n+p.credibility,0) : null;
  const spread = values.length ? Math.max(...values)-Math.min(...values) : null;
  const confidence = score == null ? null : Math.max(.2, Math.min(1, .45 + .1*Math.min(publications.length,4) + .1*(publications.filter(p=>p.verified).length / publications.length) - Math.min(.25, spread*.02))) * (publications.reduce((n,p)=>n+p.credibility,0)/publications.length);
  return { score, publications, reviewCount: unique.length, publicationCount: publications.length, verifiedCount: unique.filter(r=>r.verified).length, spread, confidence, conflicts, method: 'Equal weights for registered professional publications (unregistered sources half weight); median of each publication’s reviews; lower end of ranges; verified evidence takes precedence. No plus-point bonus.' };
}
export function qualityComponent(score) {
  if (score == null) return null;
  const anchors = QUALITY_POLICY.anchors;
  for (let i=1;i<anchors.length;i++) if (score <= anchors[i][0]) { const [x,y]=anchors[i-1], [xx,yy]=anchors[i]; return y+(score-x)/(xx-x)*(yy-y); }
  return 100;
}
export function criticSearchLinks(wine) {
  const identity = [wine.producer, wine.cuvee, wine.vineyard, wine.appellation, wine.vintage ?? wine.rawVintage, wine.designation].filter(Boolean).join(' ');
  return CRITICS.map(p => ({ name: p.name, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${p.domain} ${identity} score review`)}` }));
}
