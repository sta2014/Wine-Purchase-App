// Synthetic fixtures only: these numbers are test inputs, not real wine reviews.
import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyWine, matchWine } from '../src/engine/identity.js';
import { initialState, ingestDataset, validateBackup } from '../src/engine/ingestion.js';
import { rankInventory } from '../src/engine/ranking.js';
import { applyAction } from '../src/engine/actions.js';
import { parseCriticScore, retailerScores, compositeCritics, qualityComponent } from '../src/engine/critics.js';
import { suggestColumns, mapSpreadsheet } from '../src/engine/spreadsheet.js';
import { EngineDatabase } from '../server/database.js';
import { RefreshService } from '../server/refresh.js';
import { CriticLookupService } from '../server/critics.js';
const at='2026-10-07T12:00:00.000Z', now=new Date(at);
const row=(extra={})=>({raw_title:'Synthetic Estate Reserve 2019 750ml',producer:'Synthetic Estate',cuvee:'Reserve',vintage:2019,bottle_ml:750,price:80,...extra});
const ingest=(state,source,rows,time=at)=>ingestDataset(state,source,{rows},time);
const inventory=()=>ingest(initialState(),'flickinger',[row()]);
const match=(a,b,format=false)=>matchWine(identifyWine(a),identifyWine(b),{format});

test('critic matching: exact Bordeaux château and curated producer aliases',()=>{
  const a={raw_title:'Château Léoville Las Cases 2019 750ml'},b={raw_title:'2019 Ch. Leoville-Las-Cases St-Julien',bottle_ml:1500};
  assert.equal(match(a,b).confidence,1); assert.equal(match(a,b,true).automatic,false);
  assert.equal(match({...a,vintage:2020},b).automatic,false);
});
test('critic matching: Burgundy vineyards and premier/grand cru remain distinct',()=>{
  const a=row({producer:'Synthetic Burgundy',cuvee:'Chambolle Musigny',vineyard:'Les Amoureuses',classification:'Premier Cru',appellation:'Chambolle Musigny'});
  for(const b of [ {...a,vineyard:'Les Fuées'}, {...a,classification:'Grand Cru'}, {...a,appellation:'Vosne Romanée'} ]) assert.equal(match(a,b).confidence,0);
  assert.equal(match(row({raw_title:'Synthetic Estate Reserve Premier Cru 2019',cuvee:'Reserve'}),row({raw_title:'Synthetic Estate Reserve Grand Cru 2019',cuvee:'Reserve'})).confidence,0);
});
test('critic matching: Barolo normale and individual crus cannot silently share scores',()=>{
  const a=row({cuvee:'Barolo',appellation:'Barolo',vineyard:'Cannubi'});
  assert.equal(match(a,{...a,vineyard:'Brunate'}).automatic,false);
  assert.equal(match(a,{...a,vineyard:'',cuvee:'Barolo normale'}).automatic,false);
});
test('critic matching: Champagne NV, MV, vintage, prestige and standard bottlings are distinct',()=>{
  const a=row({producer:'Synthetic Champagne',cuvee:'Brut',vintage:'NV',raw_title:'Synthetic Champagne Brut NV',appellation:'Champagne'});
  assert.equal(match(a,{...a,bottle_ml:1500}).automatic,true);
  for(const b of [{...a,vintage:2019},{...a,vintage:'MV'},{...a,cuvee:'Prestige Brut'}]) assert.equal(match(a,b).automatic,false);
  assert.equal(match(a,a,true).automatic,false); // Market vintage rules preserved.
});
test('review identity is beverage-level unless the review explicitly specifies format',()=>{
  let s=inventory(); s=ingest(s,'critic-import',[row({raw_title:'Synthetic Estate Reserve 2019 1.5L',bottle_ml:1500,critic:'WA',score:97})]);
  assert.equal(rankInventory(s,{},now)[0].quality,97);
  s.reviews[0].formatSpecific=true; assert.equal(rankInventory(s,{},now)[0].quality,null);
});
test('wrong vintage, country, type, appellation and region candidates are rejected',()=>{
  for(const extra of [{vintage:2020,raw_title:'Synthetic Estate Reserve 2020 750ml'},{country:'Italy'},{type:'White'},{appellation:'Pauillac'},{region:'Burgundy'}]){
    const a=row({country:'France',type:'Red',appellation:'Saint-Julien',region:'Bordeaux'}),b={...a,...extra};
    assert.equal(match(a,b).confidence,0);
  }
});
test('score parser preserves ranges and plus notation; no arbitrary plus bonus or invented values',()=>{
  assert.deepEqual(parseCriticScore('96–98'),{score:96,scoreHigh:98,rawScore:'96–98',plus:false,normalizedScore:96});
  assert.equal(parseCriticScore('96+').score,96); assert.equal(parseCriticScore('(94-96)').scoreHigh,96);
  assert.equal(parseCriticScore('18/20',20).normalizedScore,90);
  for(const value of ['great','five stars','95?','98–96',101,'95/20']) assert.throws(()=>parseCriticScore(value));
});
test('retailer critic columns and combined ratings are mapped conservatively; anonymous ratings omitted',()=>{
  const headers=['Wine','Producer','Price','WA','VM Rating','JD','Ratings'];
  const mapping=suggestColumns(headers); assert.deepEqual(mapping,['raw_title','producer','price','wa','vn','jd','ratings']);
  const rows=mapSpreadsheet([headers,['Synthetic Estate Reserve 2019','Synthetic Estate',80,'96+','95',98,'WS 94; BH: 95–97']],0,mapping,{bottle_ml:750});
  const s=ingest(initialState(),'flickinger',rows),a=rankInventory(s,{},now)[0];
  assert.equal(s.reviews.length,5); assert.equal(a.criticComposite.publicationCount,5);
  assert.ok(s.reviews.every(r=>r.verification==='retailer_reported' && !r.verified));
  assert.equal(retailerScores({rating:5,ratings:'97'}).scores.length,0);
  const malformed=ingest(initialState(),'flickinger',[row({WA:'unscored'})]);
  assert.equal(malformed.listings.length,1); assert.equal(malformed.reviews.length,0); assert.equal(malformed.runs.at(-1).criticWarningCount,1);
});
test('retailer scores remain unverified even when import includes a verification assertion',()=>{
  const s=ingest(initialState(),'flickinger',[row({WA:99,verified:true,verification:'provider_verified'})]);
  assert.equal(s.reviews[0].verified,false); assert.equal(rankInventory(s,{verifiedOnly:true},now).length,0);
});
test('community sources cannot be relabeled as professional reviews',()=>{
  const s=ingest(inventory(),'critic-import',[row({critic:'Vivino',score:5,scale:5}),row({critic:'CellarTracker',score:99})]);
  const a=rankInventory(s,{},now)[0]; assert.equal(a.quality,null); assert.equal(a.community.length,2);
});
test('composite balances publications, not review-count or maximum; confidence reflects disagreement',()=>{
  const review=(critic,score,reviewer='')=>({kind:'critic',critic,score,scoreHigh:score,scale:100,reviewer});
  const a=compositeCritics([review('WA',94),review('WA',94,'Other reviewer'),review('Vinous',94),review('Jeb Dunnuck',100)]);
  assert.equal(a.score,96); assert.equal(a.publicationCount,3); assert.equal(a.spread,6);
  const agree=compositeCritics([review('WA',96),review('Vinous',96),review('Jeb Dunnuck',96)]); assert.ok(agree.confidence>a.confidence);
  assert.ok(compositeCritics([review('WA',100)]).confidence<agree.confidence);
});
test('independent verified review takes precedence and exposes retailer disagreement',()=>{
  let s=ingest(initialState(),'flickinger',[row({WA:99})]);
  s=applyAction(s,{type:'manual-review',wineId:s.listings[0].wineId,review:{critic:'Wine Advocate',score:95,scale:100,verified:true,source_url:'https://www.robertparker.com/synthetic-test-reference',reviewer:'Synthetic test reviewer',review_date:'2026-01-01'}},at);
  const a=rankInventory(s,{},now)[0]; assert.equal(a.quality,95); assert.equal(a.criticComposite.verifiedCount,1); assert.equal(a.criticComposite.conflicts.length,1);
  assert.equal(rankInventory(s,{verifiedOnly:true,publication:'Wine Advocate'},now).length,1); assert.equal(s.reviews.length,2);
  assert.equal(s.reviews[1].reviewDate,'2026-01-01T00:00:00.000Z'); assert.ok(s.scoreHistory.at(-1).criticContribution>0);
});
test('repeated retrieval preserves record IDs, decisions and original retrieval time; distinct reviews survive',()=>{
  let s=inventory(); const reviews=[row({critic:'WA',score:96,reviewer:'A',review_date:'2025-01-01'}),row({critic:'WA',score:97,reviewer:'B',review_date:'2026-01-01'})];
  s=ingest(s,'critic-import',reviews); const id=s.reviews[0].id;
  s=applyAction(s,{type:'decision',wineId:s.listings[0].wineId,observationId:id,decision:'rejected'},at);
  s=ingest(s,'critic-import',reviews,'2026-10-07T13:00:00.000Z'); assert.equal(s.reviews.length,2); assert.equal(s.reviews[0].id,id); assert.equal(s.reviews[0].retrievedAt,at); assert.equal(s.reviews[0].lastRetrievedAt,'2026-10-07T13:00:00.000Z');
  assert.equal(s.decisions[id].state,'rejected'); assert.equal(rankInventory(s,{},now)[0].quality,97); assert.equal(validateBackup(s).reviews.length,2);
});
test('ambiguous critic candidate needs approval; rejection and approval persist across refresh',()=>{
  let s=ingest(initialState(),'flickinger',[row({cuvee:'Reserve Cabernet'})]);
  const external=row({cuvee:'Reserve Cabernet Sauvignon',critic:'WA',score:98}); s=ingest(s,'critic-import',[external]);
  const id=s.reviews[0].id,wineId=s.listings[0].wineId; assert.equal(rankInventory(s,{},now)[0].quality,null); assert.equal(rankInventory(s,{hideUncertain:true},now).length,0);
  s=applyAction(s,{type:'decision',observationId:id,wineId,decision:'approved'},at); assert.equal(rankInventory(s,{},now)[0].quality,98);
  s=ingest(s,'critic-import',[external],'2026-10-07T13:00:00Z'); assert.equal(s.reviews.length,1); assert.equal(rankInventory(s,{},now)[0].quality,98);
});
test('matching decisions use original external metadata rather than shared canonical metadata',()=>{
  let s=inventory(); s=ingest(s,'critic-import',[row({critic:'WA',score:100,type:'White'})]);
  // Canonical ID omits type, but the source-specific identity must still protect the match.
  s.wines[s.listings[0].wineId].type='Red';
  assert.throws(()=>applyAction(s,{type:'decision',wineId:s.listings[0].wineId,observationId:s.reviews[0].id,decision:'approved'},at));
});
test('manual canonical correction persists through reimport and backup',()=>{
  let s=ingest(initialState(),'flickinger',[row({producer:'',raw_title:'Synthetic Estate Reserve 2019 750ml',WA:96})]);
  const id=s.listings[0].id,reviewId=s.reviews[0].id;
  s=applyAction(s,{type:'identity',wineId:s.listings[0].wineId,fields:{producer:'Synthetic Estate',cuvee:'Reserve'}},at);
  const corrected=s.listings[0].wineId; assert.equal(rankInventory(s,{},now)[0].quality,96);
  s=ingest(validateBackup(s),'flickinger',[row({producer:'',WA:96})],'2026-10-07T13:00:00Z');
  assert.equal(s.listings[0].id,id); assert.equal(s.listings[0].wineId,corrected); assert.equal(s.reviews.length,1); assert.equal(s.reviews[0].id,reviewId); assert.equal(rankInventory(s,{},now)[0].quality,96);
});
test('missing critic remains missing with neutral contribution; high-end quality difference is interpretable',()=>{
  const a=rankInventory(inventory(),{},now)[0]; assert.equal(a.quality,null); assert.equal(a.criticComponent,null); assert.equal(a.coverage,0); assert.equal(a.breakdown.find(b=>b.key==='quality').contribution,17.5);
  assert.ok(qualityComponent(100)-qualityComponent(98)>qualityComponent(90)-qualityComponent(88));
  assert.ok(qualityComponent(97)-qualityComponent(96)<10);
});
test('provider outage/authentication preserves review facts, logs failure and never means no review exists',async()=>{
  const db=new EngineDatabase(':memory:');
  try {
    let s=inventory(); const source=s.sources.find(x=>x.id==='critic-import'); Object.assign(source,{method:'json',accessApproved:true,url:'https://licensed.example/critic-feed'}); db.save(s);
    const refresh=new RefreshService(db,{clock:()=>now,adapter:{async fetch(){const e=new Error('credential rejected');e.authRequired=true;throw e;}}});
    const service=new CriticLookupService(db,refresh,{clock:()=>now}); const result=await service.lookup(s.listings[0].wineId,true);
    assert.equal(result.status,'lookup_failure'); assert.equal(result.providers[0].status,'Authentication Required'); assert.equal(db.load().listings.length,1); assert.equal(db.load().reviews.length,0);
  } finally {db.close();}
});
test('approved provider fixture retrieves, matches, caches and deduplicates; critic lookup never fetches market/vintage',async()=>{
  const db=new EngineDatabase(':memory:'); let calls=0;
  try {
    let s=inventory(); Object.assign(s.sources.find(x=>x.id==='critic-import'),{method:'json',accessApproved:true,url:'https://licensed.example/critic-feed'});
    Object.assign(s.sources.find(x=>x.id==='market-import'),{method:'json',accessApproved:true,url:'https://licensed.example/prices'}); db.save(s);
    const refresh=new RefreshService(db,{clock:()=>now,adapter:{async fetch(source){assert.equal(source.category,'critic');calls++;return {dataset:{rows:[row({critic:'WA',score:'96–98',source_reference:'synthetic authorized fixture'})]}};}}});
    const service=new CriticLookupService(db,refresh,{clock:()=>now}); const id=s.listings[0].wineId;
    const first=await service.lookup(id); assert.equal(first.status,'found'); assert.equal(first.providers[0].acceptedCount,1); assert.equal(db.load().reviews.length,1);
    assert.equal((await service.lookup(id)).cached,true); assert.equal(calls,1);
    await service.lookup(id,true); assert.equal(calls,2); assert.equal(db.load().reviews.length,1);
    assert.equal(rankInventory(db.load(),{},now)[0].quality,96);
  } finally {db.close();}
});
test('unavailable provider and successful empty authorized feed are distinct lookup states',async()=>{
  const db=new EngineDatabase(':memory:');
  try {
    let s=inventory();db.save(s);const refresh=new RefreshService(db,{clock:()=>now,adapter:{async fetch(){return {dataset:{rows:[],completeSnapshot:true}};}}});const service=new CriticLookupService(db,refresh,{clock:()=>now});const id=s.listings[0].wineId;
    assert.equal((await service.lookup(id)).status,'source_unavailable');
    s=db.load();Object.assign(s.sources.find(x=>x.id==='critic-import'),{method:'json',accessApproved:true,url:'https://licensed.example/empty-feed'});db.save(s);
    assert.equal((await service.lookup(id,true)).status,'no_review_found');assert.equal(db.load().reviews.length,0);
  } finally {db.close();}
});

test('missing cru designation cannot become an automatic exact match through sparse explicit fields',()=>{
  const a=row({raw_title:'Synthetic Estate Reserve Grand Cru 2019',cuvee:'Reserve'}),b=row({raw_title:'Synthetic Estate Reserve 2019',cuvee:'Reserve'});
  const result=match(a,b);assert.equal(result.automatic,false);assert.equal(result.reviewable,true);
});
test('an explicit reference-backed verification upgrades the same stored review without losing its ID',()=>{
  let s=inventory();const review=row({critic:'WA',score:97,source_reference:'synthetic authorized review'});s=ingest(s,'critic-import',[review]);const id=s.reviews[0].id;
  s=ingest(s,'critic-import',[{...review,verified:true,verification:'manually_verified'}],'2026-10-07T13:00:00Z');
  assert.equal(s.reviews.length,1);assert.equal(s.reviews[0].id,id);assert.equal(s.reviews[0].verified,true);
});
test('actual critic HTTP route authenticates, logs import lookup and returns structured candidates',async()=>{
  const {createEngineServer}=await import('../server/index.js');const db=new EngineDatabase(':memory:');const app=createEngineServer({database:db,token:'synthetic-test-access-token',origins:[]});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}/api`;
  const post=(route,body,authenticated=true)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer synthetic-test-access-token'}:{})},body:JSON.stringify(body)});
  try {
    assert.equal((await post('/critics',{wineId:'unknown'},false)).status,401);
    const imported=await post('/action',{expectedRevision:0,action:{type:'import',sourceId:'flickinger',dataset:{rows:[row({WA:96})]}}});assert.equal(imported.status,200);const state=await imported.json();assert.equal(state.runs.at(-1).category,'critic_lookup');
    const wineId=state.listings[0].wineId;const unavailable=await post('/critics',{wineId,force:true});assert.equal(unavailable.status,200);assert.equal((await unavailable.json()).status,'source_unavailable');
    let stored=db.load();const changed=await post('/action',{expectedRevision:stored.revision,action:{type:'manual-review',wineId,review:{critic:'Wine Advocate',score:97,scale:100,verified:true,source_reference:'synthetic verified HTTP fixture'}}});assert.equal(changed.status,200);
    const lookup=await post('/critics',{wineId,force:true});const found=await lookup.json();assert.equal(found.status,'found');assert.equal(found.providers[0].acceptedCount,1);assert.equal(found.providers[0].candidates[0].matchConfidence,1);assert.ok(found.canonicalIdentity.producer);
    assert.equal((await post('/critics',{wineId:'unknown'})).status,400);stored=db.load();assert.equal(stored.reviews.length,2);assert.equal(validateBackup(stored).listings.length,1);
  }finally{await new Promise(resolve=>app.server.close(resolve));db.close();}
});
