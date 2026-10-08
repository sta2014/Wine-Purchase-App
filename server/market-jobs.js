import {PublicMarketAdapter} from './public-market.js';
import {ensureMarketResearch} from '../src/engine/retailers.js';
import {ingestDataset} from '../src/engine/ingestion.js';
import {rankInventory} from '../src/engine/ranking.js';
export class MarketResearchService {
 constructor(database,{adapter=new PublicMarketAdapter(),clock=()=>new Date()}={}) {this.database=database;this.adapter=adapter;this.clock=clock;this.running=false;this.cancelled=new Set();this.timer=null;const s=database.load(),r=ensureMarketResearch(s);for(const j of r.jobs) if(j.status==='running'){j.status='queued';j.error='Resumed after engine restart';}database.save(s);}
 summary(){const state=this.database.load(),r=ensureMarketResearch(state);return {...r,cache:undefined,running:this.running,activeSources:r.sources.filter(s=>s.enabled && s.verifiedDomain && s.termsReviewed).length,counts:Object.fromEntries(['queued','running','completed','error','cancelled'].map(status=>[status,r.jobs.filter(j=>j.status===status).length]))};}
 configure(input) {
  const state=this.database.load(),r=ensureMarketResearch(state);
  if(input.source) {
   const s=r.sources.find(s=>s.id===input.source.id);if(!s)throw new Error('Unknown retailer source.');
   for(const key of ['enabled','termsReviewed','searchVerified'])if(input.source[key]!=null && typeof input.source[key]!=='boolean')throw new Error('Source flags must be booleans.');
   if(input.source.enabled && (!s.verifiedDomain || !input.source.termsReviewed || !input.source.termsURL || !input.source.termsNote))throw new Error('Source activation requires verified domain and documented permitted terms.');
   const allowed=['enabled','termsReviewed','termsURL','termsNote','searchVerified','searchPath','productPathPattern','sitemapPath','productURLs','priority'];
   for(const key of allowed)if(input.source[key]!=null)s[key]=input.source[key];
   if(s.productURLs && (!Array.isArray(s.productURLs)||s.productURLs.length>20))throw new Error('At most 20 explicit product URLs allowed.');
   for(const value of [s.termsURL,...(s.productURLs || [])].filter(Boolean)){const u=new URL(value);if(u.origin!==new URL(s.homepage).origin || u.username || u.password)throw new Error('Retailer URLs must stay on its HTTPS origin.');}
  }
  if(input.schedule) {
   const q={...r.schedule,...input.schedule};
   if(!['twice-daily','daily','weekly'].includes(q.frequency) || typeof q.enabled!=='boolean')throw new Error('Invalid research schedule.');
   for(const [k,max] of [['maxWines',200],['maxSources',50],['concurrency',4]])if(!Number.isInteger(Number(q[k])) || q[k]<1 || q[k]>max)throw new Error(`Invalid ${k}.`);
   r.schedule={...q,nextDue:this.clock().toISOString()};
  }
  state.revision++;this.database.save(state);return this.summary();
 }
 enqueue({wineId,force=false,maxWines,maxSources}={}) {
  const state=this.database.load(),r=ensureMarketResearch(state),now=this.clock();
  const sources=r.sources.filter(s=>s.enabled && s.verifiedDomain && s.termsReviewed && s.classification!=='auction').sort((a,b)=>a.priority-b.priority).slice(0,maxSources || r.schedule.maxSources);
  if(!sources.length)return {queued:0,message:'No verified, permitted retailer adapters enabled.',...this.summary()};
  const rows=rankInventory(state,{available:true},now),wines=new Map();
  for(const a of rows)if(a.wine.vintage!=null && (!wineId || a.wine.id===wineId)) {const key=a.wine.beverageId+':'+a.wine.bottleMl+':'+a.wine.packaging;const score=a.score+(a.quality || 0)/5+(a.vintage || 0)/10+(a.marketEvidence.length<2?20:0)+(a.marketIntelligence.lastVerifiedAt?0:15);if(!wines.has(key))wines.set(key,{wine:a.wine,priority:score});}
  if(wineId && !Object.values(state.wines).some(w=>w.id===wineId && state.listings.some(l=>l.wineId===w.id&&l.isAvailable)))throw new Error('Select an available inventory wine.');
  let count=0;
  for(const {wine,priority} of [...wines.values()].sort((a,b)=>b.priority-a.priority).slice(0,maxWines || r.schedule.maxWines))for(const source of sources){
   const key=`${wine.beverageId}:${wine.bottleMl}:${wine.packaging}:${source.id}`,cached=r.cache[key];
   if(r.jobs.some(j=>j.key===key && ['queued','running'].includes(j.status)) || (!force && cached && Date.parse(cached.nextDue)>+now))continue;
   if(r.jobs.length>=20000)throw new Error('Research queue retention limit reached; export/archive completed jobs first.');
   r.jobs.push({id:crypto.randomUUID(),key,wineId:wine.id,sourceId:source.id,status:'queued',priority,createdAt:now.toISOString(),attempts:0,nextDue:now.toISOString(),error:'',offers:0,pages:0});count++;
  }
  state.revision++;this.database.save(state);return {queued:count,...this.summary()};
 }
 cancel(id=null){const state=this.database.load(),r=ensureMarketResearch(state);for(const j of r.jobs)if((!id || j.id===id)&&['queued','running'].includes(j.status)){j.status='cancelled';j.completedAt=this.clock().toISOString();this.cancelled.add(j.id);}state.revision++;this.database.save(state);return this.summary();}
 async audit(sourceId) {
  const before=this.database.load(),initial=ensureMarketResearch(before).sources.find(s=>s.id===sourceId);if(!initial)throw new Error('Unknown retailer.');
  let result,error;try{result=await this.adapter.page(initial,initial.homepage);}catch(e){error=e;}
  // Fetch the latest state after the network await so an import or another job is preserved.
  const state=this.database.load(),source=ensureMarketResearch(state).sources.find(s=>s.id===sourceId);
  source.lastAudit=this.clock().toISOString();
  if(error){source.status='Error';source.lastError=error.message;}
  else{source.verifiedDomain=result.status===200;source.status=source.enabled&&source.termsReviewed?'Active':'Terms review required';source.lastError='';}
  state.revision++;this.database.save(state);return this.summary();
 }
 async processOne(jobId) {
  let state=this.database.load(),r=ensureMarketResearch(state),job=r.jobs.find(j=>j.id===jobId),source=r.sources.find(s=>s.id===job.sourceId);
  if(job.status!=='queued')return;job.status='running';job.startedAt=this.clock().toISOString();job.attempts++;state.revision++;this.database.save(state);
  try {
   const result=await this.adapter.search(source,state.wines[job.wineId]);
   if(result.errors?.length && !result.rows.length)throw new Error(result.errors[0].error);
   state=this.database.load();r=ensureMarketResearch(state);job=r.jobs.find(j=>j.id===jobId);source=r.sources.find(s=>s.id===job.sourceId);
   if(job.status==='cancelled' || this.cancelled.has(jobId))return;
   if(result.rows.length) {
    const id=`web-${source.id}`;
    if(!state.sources.some(s=>s.id===id)) state.sources.push({id,name:source.name,category:'market',method:'manual',enabled:true,accessApproved:false,url:'',authEnv:'',refreshHours:12,status:'Manual Import',merchantCountry:'US',merchantConfidence:.9});
    // Unknown identity/format remains excluded in core matching. Bad rows are isolated, not invented.
    const valid=[],errors=[];
    for(const row of result.rows){try {const {normalizeRow}=await import('../src/engine/ingestion.js');normalizeRow(row,'market',state.sources.find(s=>s.id===id),this.clock().toISOString());valid.push(row);}catch(e){errors.push(e.message);}}
    if(valid.length)state=ingestDataset(state,id,{rows:valid,scoreWineIds:[job.wineId]},this.clock().toISOString());
    r=ensureMarketResearch(state);job=r.jobs.find(j=>j.id===jobId);source=r.sources.find(s=>s.id===job.sourceId);job.parseErrors=errors;
   }
   job.status='completed';job.offers=result.rows.length;job.confirmedStock=result.rows.filter(row=>row.availability_verified).length;job.pages=result.pages;job.result=result.status;job.errors=result.errors || [];job.completedAt=this.clock().toISOString();
   source.lastSuccess=job.completedAt;source.status='Active';r.lastSuccess=job.completedAt;
   r.cache[job.key]={checkedAt:job.completedAt,nextDue:new Date(+this.clock()+12*3600000).toISOString(),pages:job.pages,offers:job.offers};
  }catch(e){state=this.database.load();r=ensureMarketResearch(state);job=r.jobs.find(j=>j.id===jobId);source=r.sources.find(s=>s.id===job.sourceId);if(job.status==='cancelled')return;
   const restricted=/robot|access restricted|permitted|verified|403|401/i.test(e.message);job.status=job.attempts<3&&!restricted?'queued':'error';job.error=e.message;job.nextDue=new Date(+this.clock()+Math.max(e.retryAfterMs || 0,60000*2**job.attempts)).toISOString();
   const failure={id:crypto.randomUUID(),jobId:job.id,sourceId:source.id,at:this.clock().toISOString(),error:e.message};r.failures.push(failure);source.failures.push(failure);source.status='Error';source.lastError=e.message;
  }
  state.revision++;this.database.save(state);
 }
 async tick(){if(this.running)return {running:true};this.running=true;try{let s=this.database.load(),r=ensureMarketResearch(s),q=r.schedule;
  if(q.enabled && (!q.nextDue || Date.parse(q.nextDue)<=+this.clock())){this.enqueue();s=this.database.load();r=ensureMarketResearch(s);r.schedule.nextDue=new Date(+this.clock()+({'twice-daily':12,daily:24,weekly:168}[q.frequency])*3600000).toISOString();s.revision++;this.database.save(s);}
  const jobs=r.jobs.filter(j=>j.status==='queued' && Date.parse(j.nextDue)<=+this.clock()).sort((a,b)=>b.priority-a.priority).slice(0,r.schedule.concurrency);
  await Promise.allSettled(jobs.map(j=>this.processOne(j.id)));return this.summary();
 }finally{this.running=false;}}
 start(){this.timer=setInterval(()=>this.tick().catch(()=>{}),5000);this.timer.unref();this.tick().catch(()=>{});}
 stop(){clearInterval(this.timer);}
}
