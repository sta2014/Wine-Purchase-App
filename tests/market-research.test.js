import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import{EngineDatabase}from'../server/database.js';import{MarketResearchService}from'../server/market-jobs.js';import{PublicMarketAdapter}from'../server/public-market.js';import{parseSourceProducts}from'../server/merchant-profiles.js';import{RETAILERS,ensureMarketResearch}from'../src/engine/retailers.js';import{initialState,ingestDataset,validateBackup}from'../src/engine/ingestion.js';import{rankInventory}from'../src/engine/ranking.js';
const at='2026-10-08T00:00:00Z',now=new Date(at);
const wine={raw_title:'Synthetic Estate Pauillac',region:'Bordeaux',vintage:2019,format:'6x750ml',price:900};
const inventory=()=>ingestDataset(initialState(),'flickinger',{rows:[wine]},at);
const offer=(fields={})=>({...wine,format:'750ml',price:200,merchant:'Synthetic Merchant',merchant_country:'US',merchant_confidence:1,merchant_url:'https://merchant.example',source_url:'https://merchant.example/2019-wine',availability_status:'CONFIRMED_IN_STOCK',availability_verified:true,is_available:true,verified_at:at,verification_method:'structured_merchant',verification_evidence:'SYNTHETIC explicit stock',confidence:1,...fields});
test('50 unique candidates avoid duplicate MacArthur/Bassins and paid aggregators',()=>{assert.equal(RETAILERS.length,50);assert.equal(new Set(RETAILERS.map(s=>s.domain)).size,50);assert.ok(!RETAILERS.some(s=>/Wine.Searcher/.test(s.name)));assert.ok(RETAILERS.every(s=>s.lastAudit && s.audit));});
test('full designation matches across package counts without inventing a producer; wrong vintage/volume/cu vee excluded',()=>{
 let s=ingestDataset(inventory(),'market-import',{rows:[offer()]},at);let a=rankInventory(s,{},now)[0];assert.equal(a.referencePrice,200);assert.equal(a.marketIntelligence.packageDiscount,300);assert.equal(a.discount,.25);assert.match(a.marketIntelligence.comparisonBasis,/differing package/);
 for(const fields of [{vintage:2018},{format:'1.5L'},{raw_title:'Synthetic Estate Reserve Pauillac'}]){s=ingestDataset(inventory(),'market-import',{rows:[offer(fields)]},at);assert.equal(rankInventory(s,{},now)[0].referencePrice,null);}
});
test('explicit limited stock works but likely, sold, historical and auction prices stay out of current median',()=>{
 for(const status of ['LIKELY_IN_STOCK','SOLD','OUT_OF_STOCK','UNKNOWN']){const s=ingestDataset(inventory(),'market-import',{rows:[offer({availability_status:status})]},at);assert.equal(rankInventory(s,{},now)[0].referencePrice,null);}
 const s=ingestDataset(inventory(),'market-import',{rows:[offer({availability_status:'LIMITED_IN_STOCK'})]},at);assert.equal(rankInventory(s,{},now)[0].referencePrice,200);
});
test('dated historical observations retain original date; undated pages never get guessed dates',()=>{
 const rows=[offer({offer_type:'historical',original_observation_at:'2026-09-07T00:00:00Z',price:180}),offer({offer_type:'historical',source_url:'https://merchant.example/undated',price:170})];
 const a=rankInventory(ingestDataset(inventory(),'market-import',{rows},at),{},now)[0];assert.equal(a.referencePrice,null);assert.equal(a.marketIntelligence.history.points.length,1);assert.equal(a.marketIntelligence.history.points[0].at,'2026-09-07T00:00:00.000Z');assert.equal(a.marketIntelligence.history.changes[30],null);
});
test('JJ format comes from visible Size field and prearrival is excluded',()=>{
 const html='<dt class="name">Size</dt><dd class="value">750ML</dd><script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'2019 Synthetic Estate',brand:{name:'Synthetic Estate'},offers:{'@type':'Offer',price:100,priceCurrency:'USD',availability:'https://schema.org/PreOrder'}})+'</script>';
 const d=parseSourceProducts(html,{id:'jj-buckley',name:'Synthetic source'},'https://merchant.example/product',now);assert.equal(d.rows[0].format,'750ML');assert.equal(d.rows[0].availability_verified,false);assert.equal(d.rows[0].availability_status,'PRE_ARRIVAL');
});
test('robots denial, authentication and off-origin links are fail-closed without paid APIs',async()=>{
 const source={...RETAILERS[6],enabled:true,verifiedDomain:true,termsReviewed:true,termsURL:'https://www.jjbuckley.com/privacy-policy',termsNote:'SYNTHETIC permission',productURLs:['https://www.jjbuckley.com/product/2019']};
 const adapter=new PublicMarketAdapter({clock:()=>0,sleep:async()=>{},request:async url=>({status:200,text:url.endsWith('robots.txt')?'User-agent: *\nDisallow: /product/':'',headers:{}})});
 const r=await adapter.search(source,{vintage:2019});assert.equal(r.rows.length,0);assert.match(r.errors[0].error,/robots/);
 await assert.rejects(()=>adapter.page(source,'https://other.example/product'),/origin/);
});
test('queued research deduplicates, caches, saves history, and survives restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wine-jobs-')),file=path.join(dir,'engine.sqlite');let db=new EngineDatabase(file);db.save(inventory());let calls=0,clock=now;
 const adapter={search:async()=>{calls++;return {rows:[offer()],pages:1,status:'SYNTHETIC successful observation'};}};
 let service=new MarketResearchService(db,{adapter,clock:()=>clock});const id=db.load().listings[0].wineId;assert.equal(service.enqueue({wineId:id}).queued,1);assert.equal(service.enqueue({wineId:id}).queued,0);await service.tick();assert.equal(calls,1);assert.equal(db.load().market.length,1);assert.equal(service.enqueue({wineId:id}).queued,0);
 clock=new Date(+now+13*3600000);service.enqueue({wineId:id});await service.tick();assert.equal(db.load().market[0].revisions.length,1);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM historical_market_prices').get().n,2);db.close();
 db=new EngineDatabase(file);service=new MarketResearchService(db,{adapter,clock:()=>clock});assert.equal(service.summary().counts.completed,2);assert.doesNotThrow(()=>validateBackup(db.load()));db.close();fs.rmSync(dir,{recursive:true});
});
test('failures use bounded retries and cancellation prevents queued jobs running',async()=>{
 const db=new EngineDatabase(':memory:');db.save(inventory());const service=new MarketResearchService(db,{clock:()=>now,adapter:{search:async()=>{throw new Error('Synthetic timeout');}}});service.enqueue();await service.tick();assert.equal(service.summary().counts.queued,1);assert.equal(service.summary().failures.length,1);service.cancel();assert.equal(service.summary().counts.cancelled,1);await service.tick();assert.equal(service.summary().failures.length,1);db.close();
});

test('regional examples require exact cuvée, year and physical format even with matching raw titles',()=>{
 for(const [name,region,country,type] of [['Synthetic Champagne Brut','Champagne','France','Sparkling'],['Synthetic Bordeaux Estate','Bordeaux','France','Red'],['Synthetic Burgundy Vineyard','Burgundy','France','Red'],['Synthetic Rhone Estate','Rhone','France','Red'],['Synthetic Barolo Estate','Piedmont','Italy','Red']]){
  const row={raw_title:name,cuvee:'Grand Vin',region,country,type,vintage:2019,format:'750ml',price:150};
  const s=ingestDataset(initialState(),'flickinger',{rows:[row]},at);
  const good=ingestDataset(s,'market-import',{rows:[offer({...row,price:200})]},at);assert.equal(rankInventory(good,{},now)[0].referencePrice,200);
  const bad=ingestDataset(s,'market-import',{rows:[offer({...row,cuvee:'Second Label',price:200})]},at);assert.equal(rankInventory(bad,{},now)[0].referencePrice,null);
 }
});
