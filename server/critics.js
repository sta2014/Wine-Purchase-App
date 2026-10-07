import { matchWine } from '../src/engine/identity.js';
import { sourceStatus } from '../src/engine/sources.js';
import { credentialAvailable } from './adapters.js';
// Approved feeds are batched once, then matched locally. No per-wine page scraping.
export class CriticLookupService {
  constructor(database, refresh, { clock = () => new Date(), env = process.env } = {}) { this.database = database; this.refresh = refresh; this.clock = clock; this.env = env; }
  async lookup(wineId, force = false) { return (await this.lookupMany([wineId], force))[0]; }
  async lookupMany(wineIds, force = false) {
    if (!Array.isArray(wineIds) || wineIds.length > 10000) throw new Error('Lookup accepts at most 10,000 inventory wine IDs.');
    const ids=[...new Set(wineIds)], results=[];
    const initial=this.database.load();
    for(const id of ids) if(!initial.wines[id] || !initial.listings.some(l=>l.wineId===id && initial.sources.find(s=>s.id===l.sourceId)?.enabled)) throw new Error('Critic lookup requires an imported inventory wine.');
    if (!ids.length) return [];
    await this.refresh.run(force, 'critic');
    let batchState=this.database.load();
    for (const wineId of ids) results.push(this.recordLookup(batchState, wineId, force));
    if (results.some(r=>!r.cached)) this.database.save(batchState);
    return results;
  }
  recordLookup(state, wineId, force = false) {
    const wine = state.wines[wineId];
    if (!wine || !state.listings.some(l=>l.wineId===wineId && state.sources.find(s=>s.id===l.sourceId)?.enabled)) throw new Error('Critic lookup requires an imported inventory wine.');
    const configured = state.sources.filter(s=>s.category==='critic' && s.enabled);
    const fingerprint = JSON.stringify({sources:configured.map(s=>[s.id,s.url,s.method,s.accessApproved,s.authEnv,s.lastSuccess,s.error]),facts:state.reviews.filter(r=>r.kind==='critic' && (r.wine || state.wines[r.wineId])?.canonicalProducer===wine.canonicalProducer).map(r=>[r.id,r.verified,state.decisions[r.id]?.wineId===wineId?state.decisions[r.id].state:null])});
    const previous = state.runs.filter(r=>r.category==='critic_lookup' && r.wineId===wineId).at(-1);
    const now = this.clock();
    if (!force && previous?.fingerprint===fingerprint && +now-Date.parse(previous.at)<30*24*3600000) return { ...previous, cached: true };
    const result = {outcomes:[]};
    const providers = state.sources.filter(s=>s.category==='critic' && s.enabled).map(source=> {
      const candidates = state.reviews.filter(r=>r.sourceId===source.id && r.kind==='critic' && r.score!=null && (r.wine || state.wines[r.wineId])?.canonicalProducer===wine.canonicalProducer).map(r=> {
        const match = matchWine(wine, r.wine || state.wines[r.wineId], {format:r.formatSpecific===true});
        const d=state.decisions[r.id], rejected=d?.wineId===wineId && d.state==='rejected', approved=d?.wineId===wineId && d.state==='approved' && match.reviewable;
        return { reviewId:r.id, rawTitle:r.rawTitle, matchConfidence:match.confidence, accepted:!rejected && (match.automatic || approved) && r.confidence>=state.preferences.matchThreshold, reasons:match.reasons };
      });
      const outcome = result.outcomes?.find(o=>o.sourceId===source.id);
      const status = sourceStatus(source, credentialAvailable(source,this.env));
      const successful = source.lastSuccess && (!source.error || source.method==='manual');
      return { sourceId:source.id, name:source.name, status, outcome:outcome?.status || (successful ? 'Stored import / cached feed' : 'No approved automatic retrieval available'), error:source.error || '', candidateCount:candidates.length, acceptedCount:candidates.filter(c=>c.accepted).length, candidates:candidates.slice(0,100), searched:Boolean(source.method==='json' && successful) };
    });
    const accepted=providers.reduce((n,p)=>n+p.acceptedCount,0), uncertain=providers.some(p=>p.candidates.some(c=>!c.accepted && c.matchConfidence>=.75));
    const status=accepted?'found':uncertain?'ambiguous_match':providers.some(p=>p.error)?'lookup_failure':providers.some(p=>p.searched)?'no_review_found':'source_unavailable';
    const run={id:crypto.randomUUID(),category:'critic_lookup',wineId,at:now.toISOString(),status,canonicalIdentity:{producer:wine.producer,cuvee:wine.cuvee,vintage:wine.vintage ?? wine.rawVintage,appellation:wine.appellation,vineyard:wine.vineyard,designation:wine.designation},fingerprint,providers,count:accepted};
    state.runs.push(run); state.revision++;
    return run;
  }
}
