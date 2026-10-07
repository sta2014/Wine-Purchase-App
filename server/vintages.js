import { assessVintage } from '../src/engine/vintages.js';
import { sourceStatus } from '../src/engine/sources.js';
import { credentialAvailable } from './adapters.js';

// Refresh charts once per provider, not once per wine. History lives in SQLite.
export class VintageLookupService {
  constructor(database, refresh, { env=process.env }={}) { this.database=database; this.refresh=refresh; this.env=env; }
  async lookup(wineId, force=false) {
    const before=this.database.load();
    if(!before.wines[wineId] || !before.listings.some(l=>l.wineId===wineId)) throw new Error('Vintage lookup requires an imported wine.');
    const refreshResult=await this.refresh.run(force,'vintage'),state=this.database.load();
    const assessment=assessVintage(state,state.wines[wineId]);
    const providers=state.sources.filter(s=>s.category==='vintage').map(s=>({id:s.id,name:s.name,status:sourceStatus(s,credentialAvailable(s,this.env)),lastSuccess:s.lastSuccess,nextDue:s.nextDue,error:s.error || '',note:s.note}));
    return {status:assessment.score!=null?'found':assessment.notApplicable?'not_applicable':providers.some(p=>p.error)?'provider_failure':'no_reliable_data',assessment,providers,outcomes:refreshResult.outcomes || [],skipped:refreshResult.skipped};
  }
}
