import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState,ingestDataset,validateBackup } from '../src/engine/ingestion.js';
import { rankInventory } from '../src/engine/ranking.js';
import { applyAction } from '../src/engine/actions.js';
import { assessMarket,marketMatch,MARKET_POLICY } from '../src/engine/market.js';
import { identifyWine,parsePackageFormat } from '../src/engine/identity.js';
import { EngineDatabase } from '../server/database.js';
import { RefreshService } from '../server/refresh.js';
import { MarketLookupService } from '../server/market.js';
import { JSONFeedAdapter } from '../server/adapters.js';
import { createEngineServer } from '../server/index.js';
import { parseMerchantProducts,StructuredMerchantAdapter } from '../server/market-adapters.js';

const at='2026-10-07T12:00:00.000Z',now=new Date(at);
const wine={raw_title:'Producer X Wine Y 2019 750ml',producer:'Producer X',cuvee:'Wine Y',vintage:2019,bottle_ml:750,pack_count:1,packaging:'loose',country:'France',region:'Bordeaux',appellation:'Pauillac',type:'Red'};
const offer=(price=410,merchant='Merchant A',fields={})=>({...wine,price,merchant,source_url:`https://${merchant.replaceAll(' ','').toLowerCase()}.example/wine-y`,merchant_country:'US',merchant_confidence:1,price_terms:'ex_tax',availability_status:'CONFIRMED_IN_STOCK',availability_verified:true,verified_at:at,verification_method:'merchant_feed',verification_evidence:'Synthetic explicit stock statement for tests only',...fields});
const inventory=(fields={})=>ingestDataset(initialState(),'flickinger',{rows:[{...wine,price:300,price_terms:'ex_tax',...fields}]},at);
const market=(rows,initial=inventory(),time=at)=>ingestDataset(initial,'market-import',{rows},time);
const analysis=s=>rankInventory(s,{},now)[0];

test('mandatory live-market scenario: median 410, discount 26.8%; sold, auction, wrong year, magnum excluded',()=>{
  const s=market([offer(400,'A'),offer(420,'B'),offer(410,'C'),offer(250,'Sold',{availability_status:'SOLD',is_available:false}),offer(270,'Auction',{offer_type:'historical_auction',sale_type:'auction'}),offer(280,'WrongYear',{vintage:2018,raw_title:'Producer X Wine Y 2018 750ml'}),offer(600,'Magnum',{bottle_ml:1500,raw_title:'Producer X Wine Y 2019 1.5L'})]);
  const a=analysis(s),m=a.marketIntelligence;
  assert.equal(a.referencePrice,410);assert.equal(m.lowestPrice,400);assert.equal(m.averagePrice,410);assert.equal(m.offerCount,3);assert.equal(m.merchantCount,3);assert.ok(Math.abs(a.discount-110/410)<1e-12);assert.equal(m.dollarDiscount,110);assert.equal(m.candidates.length,7);assert.equal(a.exclusions.length,4);assert.ok(a.breakdown.find(b=>b.key==='value').contribution>0);
});
test('explicit verification, provenance and merchant reliability are mandatory; legacy/assumed availability cannot count',()=>{
  for(const fields of [{availability_status:'UNKNOWN'},{availability_verified:false},{verified_at:''},{verification_method:'unverified'},{verification_evidence:''},{source_url:''},{merchant_confidence:.5},{verification_confidence:.8},{merchant_country:''},{available_quantity:0},{is_available:false}]) assert.equal(analysis(market([offer(410,'A',fields)])).referencePrice,null,JSON.stringify(fields));
  const s=market([offer()]);delete s.market[0].marketSchema;assert.equal(analysis(s).referencePrice,null);
});
for(const status of ['LIKELY_IN_STOCK','PRE_ARRIVAL','FUTURES','OUT_OF_STOCK','SOLD','EXPIRED','UNKNOWN','ACTIVE_AUCTION']) test(`${status} is retained and excluded from current retail median`,()=>{const m=analysis(market([offer(410,'A',{availability_status:status})])).marketIntelligence;assert.equal(m.offerCount,0);assert.equal(m.candidates[0].availabilityStatus,status);});
for(const type of ['pre_arrival','futures','active_auction','historical_auction','historical','valuation','search_lead']) test(`${type} remains a separate channel`,()=>assert.equal(analysis(market([offer(410,'A',{offer_type:type})])).referencePrice,null));
test('wrong cuvée, vineyard, classification, producer, bottle and packaging are rejected',()=>{
  for(const fields of [{cuvee:'Other Wine'},{producer:'Other Estate'},{bottle_ml:1500,raw_title:'Producer X Wine Y 2019 1.5L'},{packaging:'owc'},{type:'White'}]) assert.equal(analysis(market([offer(410,'A',fields)])).referencePrice,null);
  const s=inventory({vineyard:'Plot A',classification:'Grand Cru'});assert.equal(analysis(market([offer(410,'A',{vineyard:'Plot B',classification:'Grand Cru'})],s)).referencePrice,null);
  assert.equal(analysis(market([offer(410,'A',{classification:'Premier Cru'})],s)).referencePrice,null);
});
test('format aliases and magnum volume normalization',()=>{for(const f of ['750ml','75cl','0.75L']) assert.equal(parsePackageFormat(f).bottleMl,750);for(const f of ['1.5L','1500ml','magnum']) assert.equal(parsePackageFormat(f).bottleMl,1500);assert.equal(parsePackageFormat('double magnum').bottleMl,3000);});
test('six-pack preserves total package, normalizes physical bottle price, permits same volume across pack counts',()=>{
  const s=market([offer(1200,'A',{pack_count:6,format:'6x750ml',raw_title:'Producer X Wine Y 2019 6x750ml'})],inventory({price:900,pack_count:3,raw_title:'Producer X Wine Y 2019 3x750ml'}));
  const a=analysis(s);assert.equal(a.referencePrice,200);assert.equal(a.marketEvidence[0].price,1200);assert.equal(a.marketIntelligence.packageDiscount,-300);assert.equal(a.marketEvidence[0].originalListing.format,'6x750ml');
});
test('OWC value metadata stays distinct from loose and carton',()=>{const s=inventory({packaging:'owc'});assert.equal(analysis(market([offer(410,'A',{packaging:'loose'})],s)).referencePrice,null);assert.equal(analysis(market([offer(410,'A',{packaging:'owc'})],s)).referencePrice,410);});
test('stale verified stock is excluded even if retrieved again; aging applies a confidence reduction',()=>{
  const s=market([offer(410,'A',{verified_at:'2026-10-04T12:00:00Z'})]);assert.equal(analysis(s).referencePrice,null);
  const aged=analysis(market([offer(410,'A',{verified_at:'2026-10-06T18:00:00Z'})]));assert.equal(aged.marketEvidence[0].freshness,'AGING');assert.ok(aged.marketIntelligence.confidence<.3);
  assert.equal(analysis(market([offer(410,'A',{max_age_hours:2,verified_at:'2026-10-07T09:00:00Z'})])).referencePrice,null);
});
test('duplicate listing URLs across aggregators and same merchant collapse before statistics',()=>{
  let s=market([offer(400,'A'),offer(420,'B'),offer(410,'C')]);s.sources.push({...s.sources.find(x=>x.id==='market-import'),id:'feed-two',name:'Second feed'});s=ingestDataset(s,'feed-two',{rows:[offer(400,'A'),offer(999,'A',{source_url:'https://a.example/second'})]},at);
  const m=analysis(s).marketIntelligence;assert.equal(m.referencePrice,410);assert.equal(m.offerCount,3);assert.ok(m.candidates.some(r=>r.reasons.some(x=>x.includes('Duplicate'))));assert.ok(m.candidates.some(r=>r.reasons.some(x=>x.includes('same merchant'))));
});
test('new sold-out quote from another provider suppresses older in-stock quote for the same merchant URL',()=>{
  let s=market([offer(400,'A')]);s.sources.push({...s.sources.find(x=>x.id==='market-import'),id:'other-feed',name:'Other feed'});
  s=ingestDataset(s,'other-feed',{rows:[offer(400,'A',{availability_status:'OUT_OF_STOCK',is_available:false,observed_at:'2026-10-07T13:00:00Z',verified_at:'2026-10-07T13:00:00Z'})]},'2026-10-07T13:00:00Z');
  const a=rankInventory(s,{},new Date('2026-10-07T13:00:00Z'))[0];assert.equal(a.referencePrice,null);assert.ok(a.exclusions.some(r=>r.reason.includes('Superseded')));
});
test('high rare-wine outlier stays flagged and retained in the benchmark',()=>{
  const m=analysis(market([390,400,405,410,415,420,950].map((p,i)=>offer(p,'Merchant '+i)))).marketIntelligence;
  assert.equal(m.referencePrice,410);assert.equal(m.averagePrice,3390/7);assert.equal(m.offerCount,7);assert.equal(m.candidates.find(r=>r.price===950).outlier,true);
});
test('extreme cheap observation is flagged and lowers confidence without being silently removed',()=>{
  const m=analysis(market([20,390,400,405,410,415,420].map((p,i)=>offer(p,'Merchant '+i)))).marketIntelligence;assert.equal(m.lowestPrice,20);assert.equal(m.pricingConfidence,'Moderate');assert.equal(m.candidates.find(r=>r.price===20).outlier,true);
});
test('one comp stays low confidence; missing comps never imply zero market value',()=>{const m=analysis(market([offer()])).marketIntelligence;assert.equal(m.confidenceLabel,'Low');assert.equal(m.availabilityLevel,'Thin market');assert.ok(m.component<=30);const empty=analysis(inventory()).marketIntelligence;assert.equal(empty.referencePrice,null);assert.equal(empty.component,null);assert.equal(empty.status,'No verified current market offers found.');});
test('FX preserves originals and requires a traceable fresh rate',()=>{
  const fields={currency:'EUR',normalized_currency:'USD',fx_rate:1.1,fx_at:at,fx_reference:'Synthetic FX feed'};
  const a=analysis(market([offer(400,'A',fields)]));assert.equal(a.referencePrice,440.00000000000006);assert.equal(a.marketEvidence[0].currency,'EUR');assert.equal(a.marketEvidence[0].unitPrice,400);
  for(const extra of [{fx_reference:''},{fx_at:'2026-10-01T12:00:00Z'},{fx_rate:''}]) assert.equal(analysis(market([offer(400,'A',{...fields,...extra})])).referencePrice,null);
});
test('international tax-inclusive offers default excluded; documented tax normalization flagged in worldwide mode',()=>{
  let s=market([offer(480,'A',{merchant_country:'UK',price_terms:'tax_included',tax_rate:.2,tax_reference:'Synthetic VAT reference'})]);assert.equal(analysis(s).referencePrice,null);s.preferences.marketScope='worldwide';assert.equal(analysis(s).referencePrice,400);assert.ok(analysis(s).marketEvidence[0].comparisonWarnings.length);
  s.market[0].taxReference='';assert.equal(analysis(s).referencePrice,null);
});
test('discount, premium, dollar and lowest comparisons remain explicit',()=>{
  const a=analysis(market([offer(500,'A')],inventory({price:375})));assert.equal(a.discount,.25);assert.equal(a.marketIntelligence.dollarDiscount,125);assert.equal(a.marketIntelligence.lowestDiscount,.25);
  const premium=analysis(market([offer(400,'A')],inventory({price:460})));assert.equal(premium.discount,-.15);assert.equal(premium.marketIntelligence.dollarDiscount,-60);
});
test('match approval cannot override stale stock or missing verification; hard vintage and volume conflicts cannot be approved',()=>{
  let s=market([offer(410,'A',{cuvee:'Wine Y Reserve'})]);const id=s.market[0].id,win=s.listings[0].wineId;
  assert.equal(analysis(s).referencePrice,null);s=applyAction(s,{type:'decision',wineId:win,observationId:id,decision:'approved'},at);assert.equal(analysis(s).referencePrice,410);
  s.market[0].verifiedAt='2026-10-01T00:00:00Z';assert.equal(analysis(s).referencePrice,null);
  const bad=market([offer(410,'A',{vintage:2018,raw_title:'Producer X Wine Y 2018 750ml'})]);assert.throws(()=>applyAction(bad,{type:'decision',wineId:bad.listings[0].wineId,observationId:bad.market[0].id,decision:'approved'},at));
});
test('manual rejection/exclusion, duplicate and merchant reliability survive refresh and backup',()=>{
  let s=market([offer(410,'A'),offer(420,'B')]);const id=s.market[0].id,win=s.listings[0].wineId;
  s=applyAction(s,{type:'decision',wineId:win,observationId:id,decision:'rejected'},at);s=applyAction(s,{type:'market-control',recordId:s.market[1].id,excluded:true,duplicateOf:id},at);
  s=market([offer(415,'A'),offer(425,'B')],s);assert.equal(s.market[0].id,id);assert.equal(s.market.length,2);assert.equal(s.market[0].revisions.length,1);assert.equal(analysis(s).referencePrice,null);assert.equal(validateBackup(s).marketControls[s.market[1].id].duplicateOf,id);
});
test('latest sold-out observation replaces in-stock, retains price/stock history; complete snapshots expire absent listings',()=>{
  let s=market([offer(410,'A'),offer(420,'B')]);s=market([offer(410,'A',{availability_status:'SOLD',is_available:false})],s);assert.equal(analysis(s).referencePrice,420);assert.equal(s.market[0].revisions[0].availabilityStatus,'CONFIRMED_IN_STOCK');
  s=ingestDataset(s,'market-import',{rows:[],completeSnapshot:true},at);assert.equal(analysis(s).referencePrice,null);assert.ok(s.market.every(r=>r.availabilityStatus==='EXPIRED'));
});
test('producer and appellation aliases are deterministic and distinct wine cannot auto-match',()=>{
  const a=identifyWine({...wine,producer:'Château Léoville Las Cases',cuvee:'Grand Vin',raw_title:'Chateau Leoville Las Cases 2019 750ml',appellation:'Saint-Julien'}),b=identifyWine({...wine,producer:'Leoville Las Cases',cuvee:'Grand Vin',raw_title:'Leoville Las Cases 2019 75cl',appellation:'St-Julien'});
  assert.equal(marketMatch(a,b).automatic,true);assert.equal(marketMatch(a,{...b,cuvee:'Petit Vin',beverageId:'different',id:'different'}).automatic,false);
});
test('market filters, sorts and contribution combine with critics and vintages',()=>{
  let s=market([offer(450,'A'),offer(460,'B'),offer(470,'C'),offer(455,'D'),offer(465,'E')]);
  assert.equal(rankInventory(s,{minDiscount:20,minDollarDiscount:100,minOffers:3,marketConfidence:'High',belowMarket:true,currentComps:true},now).length,1);
  assert.equal(rankInventory(s,{minOffers:6},now).length,0);for(const sort of ['discount','dollarDiscount','marketLow','marketMedian','marketOffers','marketConfidence','marketContribution']) assert.equal(rankInventory(s,{sort},now)[0].rank,1);
  const before=analysis(inventory()).score;assert.ok(analysis(s).score>before);assert.ok(s.scoreHistory.at(-1).marketEvidence.length);assert.equal(s.scoreHistory.at(-1).algorithmVersion,4);
});
test('configured feeds refresh once for all wines; TTL, failure and 304 do not invent new verification',async()=>{
  const db=new EngineDatabase(':memory:');let s=inventory();Object.assign(s.sources.find(x=>x.id==='market-import'),{method:'json',url:'https://licensed.example/feed',accessApproved:true,refreshHours:6});db.save(s);
  let clock=now,calls=0,fail=false;const refresh=new RefreshService(db,{clock:()=>clock,adapter:{fetchMarketPrices:async()=>{calls++;if(fail) throw new Error('Provider timed out');return calls===1?{dataset:{rows:[offer()]}}:{notModified:true};}}});
  const service=new MarketLookupService(db,refresh,{clock:()=>clock});const id=s.listings[0].wineId;
  assert.equal((await service.lookup(id)).offerCount,1);await service.lookup(id);assert.equal(calls,1);const verified=db.load().market[0].verifiedAt;
  clock=new Date(+now+7*3600000);await service.lookup(id);assert.equal(calls,2);assert.equal(db.load().market[0].verifiedAt,verified);
  clock=new Date(+now+50*3600000);fail=true;const result=await service.lookup(id);assert.equal(result.offerCount,0);assert.equal(db.load().market.length,1);assert.equal(result.providers.find(p=>p.id==='market-import').status,'Error');db.close();
});
test('HTTP 429 Retry-After respected; another provider continues',async()=>{
  const db=new EngineDatabase(':memory:');const s=inventory();s.sources.push({...s.sources.find(x=>x.id==='market-import'),id:'second-market',name:'Other market'});for(const id of ['market-import','second-market']) Object.assign(s.sources.find(x=>x.id===id),{method:'json',url:`https://${id}.example/feed`,accessApproved:true});db.save(s);
  const adapter=new JSONFeedAdapter(async u=>u.endsWith('/robots.txt')?{status:200,text:'User-agent: *\nAllow: /',headers:{}}:u.includes('market-import')?{status:429,text:'',headers:{'retry-after':'7200'}}:{status:200,text:JSON.stringify({rows:[offer()]}),headers:{}});
  const refresh=new RefreshService(db,{adapter,clock:()=>now});await refresh.run(false,'market');assert.equal(db.load().sources.find(x=>x.id==='market-import').nextDue,'2026-10-07T14:00:00.000Z');assert.equal(db.load().market.length,1);const forced=await refresh.run(true,'market');assert.ok(forced.outcomes.some(r=>r.status.includes('rate limit')));db.close();
});
test('forced market recheck bypasses cached transport but enforces a one-minute cooldown',async()=>{
  const db=new EngineDatabase(':memory:');const s=inventory();Object.assign(s.sources.find(x=>x.id==='market-import'),{method:'json',url:'https://feed.example/offers',accessApproved:true,etag:'cached'});db.save(s);
  let clock=now,calls=[];const refresh=new RefreshService(db,{clock:()=>clock,adapter:{fetchMarketPrices:async source=>{calls.push(source.etag);return {dataset:{rows:[offer(410,'A',{verified_at:clock.toISOString(),observed_at:clock.toISOString()})]},etag:'cached'};}}});
  await refresh.run(true,'market');assert.deepEqual(calls,['']);await refresh.run(true,'market');assert.equal(calls.length,1);clock=new Date(+now+61000);await refresh.run(true,'market');assert.deepEqual(calls,['','']);assert.equal(db.load().market[0].verifiedAt,clock.toISOString());db.close();
});
test('market HTTP API requires inventory and authentication, returns transparent verified statistics',async()=>{
  const db=new EngineDatabase(':memory:');db.save(market([offer()]));const saved=db.load();for(const source of saved.marketResearch.sources)source.enabled=false;db.save(saved);const refresh=new RefreshService(db,{clock:()=>now});const app=createEngineServer({database:db,token:'test-only',refresh,marketLookup:new MarketLookupService(db,refresh,{clock:()=>now})});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const endpoint=`http://127.0.0.1:${app.server.address().port}/api/market`;
  try {assert.equal((await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-only'},body:JSON.stringify({wineId:db.load().listings[0].wineId})});assert.equal(res.status,200);const result=await res.json();assert.equal(result.activeSources,0);assert.equal(result.queued,0);assert.ok(result.message.includes('No verified'));}
  finally {await new Promise(r=>app.server.close(r));db.close();}
});
test('structured merchant parser uses explicit Product Offer; sold-out and AggregateOffer cannot supply live comps',()=>{
  const source={id:'merchant',name:'Merchant Fixture',url:'https://merchant.example/product',merchantCountry:'US',merchantConfidence:1,priceTerms:'ex_tax'};
  const product={ '@type':'Product',name: 'Producer X Wine Y 2019 750ml',brand:{name:'Producer X'},sku:'wine-y',additionalProperty:[{name:'cuvee',value:'Wine Y'},{name:'appellation',value:'Pauillac'}],offers:{'@type':'Offer',price:'410',priceCurrency:'USD',availability:'https://schema.org/InStock'}};
  const html=p=>`<script type="application/ld+json">${JSON.stringify(p)}</script>`;
  let dataset=parseMerchantProducts(html(product),source,now);assert.equal(dataset.rows[0].availability_status,'CONFIRMED_IN_STOCK');assert.equal(dataset.rows[0].price,'410');assert.equal(dataset.rows[0].verification_method,'structured_merchant');
  const s=inventory();s.sources.push({...s.sources.find(x=>x.id==='market-import'),...source,enabled:true});assert.equal(analysis(ingestDataset(s,'merchant',dataset,at)).referencePrice,410);
  dataset=parseMerchantProducts(html({...product,offers:{...product.offers,availability:'https://schema.org/OutOfStock'}}),source,now);assert.equal(dataset.rows[0].availability_verified,false);
  assert.throws(()=>parseMerchantProducts(html({...product,offers:{'@type':'AggregateOffer',lowPrice:10,priceCurrency:'USD'}}),source,now),/No explicit/);
  assert.throws(()=>parseMerchantProducts(html({...product,offers:{...product.offers,url:'https://different.example/offer'}}),source,now),/origin/);
  assert.throws(()=>parseMerchantProducts('<script type="application/ld+json">broken</script>',source,now),/malformed/);
});
test('structured merchant retrieval reuses robots, access approval, credentials and rate controls',async()=>{
  let calls=0;const adapter=new StructuredMerchantAdapter(async url=>{calls++;return url.endsWith('/robots.txt')?{status:200,text:'User-agent: *\nDisallow: /private',headers:{}}:{status:200,text:'<script type="application/ld+json">{"@type":"Product","name":"Producer X Wine Y 2019 750ml","offers":{"@type":"Offer","price":410,"priceCurrency":"USD","availability":"https://schema.org/InStock"}}</script>',headers:{}};});
  const source={...initialState().sources.find(s=>s.id==='market-import'),method:'structured',url:'https://merchant.example/product',accessApproved:true};
  const result=await adapter.fetchMarketPrices(source,{},now);assert.equal(result.dataset.rows.length,1);assert.equal(calls,2);
  await assert.rejects(()=>adapter.fetchMarketPrices({...source,url:'https://merchant.example/private'}, {},now),/robots/);
  await assert.rejects(()=>adapter.fetchMarketPrices({...source,accessApproved:false},{},now),/approved/);
});
test('format corrections persist across refresh without changing original source listing data',()=>{
  let s=market([offer(1200,'A',{external_id:'sku-y',pack_count:6})]);const id=s.market[0].id;
  s=applyAction(s,{type:'market-format',recordId:id,bottleMl:750,packCount:3,packaging:'loose'},at);assert.equal(s.market[0].unitPrice,400);
  s=market([offer(1350,'A',{external_id:'sku-y',pack_count:6})],s);assert.equal(s.market.length,1);assert.equal(s.market[0].id,id);assert.equal(s.market[0].unitPrice,450);assert.equal(s.market[0].packCount,3);assert.equal(s.market[0].originalListing.format,'6x750ml');assert.equal(validateBackup(s).marketCorrections[id].packCount,3);
});
test('high-quality excellent vintage discounted wine outranks a weaker wine with a larger percentage discount',()=>{
  let s=ingestDataset(initialState(),'flickinger',{rows:[{...wine,price:300,price_terms:'ex_tax',ratings:'WA 98'},{...wine,cuvee:'Wine Z',raw_title:'Producer X Wine Z 2019 750ml',appellation:'Pomerol',price:40,price_terms:'ex_tax',ratings:'WA 88'}]},at);
  s=market(['A','B','C','D','E'].flatMap(name=>[offer(450,name),offer(80,name,{cuvee:'Wine Z',raw_title:'Producer X Wine Z 2019 750ml',appellation:'Pomerol',source_url:`https://${name.toLowerCase()}.example/wine-z`})]),s);
  s=ingestDataset(s,'vintage-import',{rows:[{region:'Pauillac',country:'France',type:'Red',vintage:2019,publication:'Wine Advocate',original_rating:99,source_reference:'Synthetic test only'},{region:'Pomerol',country:'France',type:'Red',vintage:2019,publication:'Wine Advocate',original_rating:75,source_reference:'Synthetic test only'}]},at);
  const rows=rankInventory(s,{},now);assert.equal(rows[0].wine.cuvee,'Wine Y');assert.equal(rows[1].discount,.5);assert.equal(rows[0].vintageIntelligence.tier,'Exceptional');assert.equal(rankInventory(s,{minCritic:96,vintageTier:'Exceptional|Outstanding',minDiscount:15,marketConfidence:'High'},now).length,1);
});
