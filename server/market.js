import { assessMarket } from '../src/engine/market.js';
import { sourceStatus } from '../src/engine/sources.js';
import { credentialAvailable } from './adapters.js';

// Existing scheduler refreshes shared inventory feeds once, never once per wine.
export class MarketLookupService {
  constructor(database,refresh,{clock=()=>new Date()}={}) {this.database=database;this.refresh=refresh;this.clock=clock;}
  async lookup(wineId,force=false) {
    let state=this.database.load();
    const listing=state.listings.find(l=>l.wineId===wineId && state.sources.find(s=>s.id===l.sourceId)?.enabled);
    if(!listing) throw new Error('Market lookup requires inventory from an enabled source.');
    const result=await this.refresh.run(force,'market');state=this.database.load();
    const analysis=assessMarket(state,state.listings.find(l=>l.id===listing.id),this.clock());
    const providers=state.sources.filter(s=>s.category==='market').map(s=>({id:s.id,name:s.name,status:sourceStatus(s,credentialAvailable(s)),lastChecked:s.lastChecked,error:s.error,configured:!!(s.enabled && ['json','structured'].includes(s.method) && s.accessApproved && s.url)}));
    const wine=state.wines[listing.wineId];
    const log={id:crypto.randomUUID(),category:'market_lookup',wineId,at:this.clock().toISOString(),status:analysis.offerCount?'verified_offers':providers.some(p=>p.configured)?'no_verified_offers':'source_unavailable',canonicalIdentity:{producer:wine.producer,cuvee:wine.cuvee,vintage:wine.rawVintage,bottleMl:wine.bottleMl,packaging:wine.packaging},providers,candidates:analysis.candidates.map(r=>({id:r.id,provider:r.sourceId,merchant:r.merchant,price:r.price,currency:r.currency,format:`${r.packCount}x${r.bottleMl}ml`,match:r.matchConfidence,availability:r.availabilityStatus,freshness:r.freshness,accepted:r.accepted,reasons:r.reasons})),confirmedOffers:analysis.offerCount};
    state.runs.push(log);state.revision++;this.database.save(state);
    return {...analysis,providers,outcomes:result.outcomes || [],lookupStatus:log.status};
  }
}
