// All assessments below are invented TEST INPUTS, never shipped as factual charts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, ingestDataset, validateBackup } from '../src/engine/ingestion.js';
import { rankInventory } from '../src/engine/ranking.js';
import { applyAction } from '../src/engine/actions.js';
import { canonicalGeography, GEOGRAPHY, geographyPath } from '../src/engine/geography.js';
import { normalizeVintageRating, assessVintage, vintageComponent } from '../src/engine/vintages.js';
import { EngineDatabase } from '../server/database.js';
import { RefreshService } from '../server/refresh.js';
import { VintageLookupService } from '../server/vintages.js';

const at='2026-10-07T12:00:00Z',now=new Date(at);
const wine=(fields={})=>({raw_title:'Synthetic wine',producer:'Synthetic Producer',cuvee:'Test',vintage:2019,bottle_ml:750,price:80,type:'Red',...fields});
const chart=(fields={})=>({vintage:2019,region:'Bordeaux',type:'Red',publication:'Wine Advocate',score:96,source_reference:'SYNTHETIC TEST CHART ONLY',...fields});
const inventory=(rows=[wine({region:'Bordeaux',country:'France',appellation:'Pauillac'})])=>ingestDataset(initialState(),'flickinger',{rows},at);
const ingest=(state,rows,time=at)=>ingestDataset(state,'vintage-import',{rows},time);
const analysis=state=>rankInventory(state,{},now)[0];

test('every geographic hierarchy is acyclic and rooted in its country',()=>{
  for(const node of Object.values(GEOGRAPHY)) { const path=geographyPath(node);assert.equal(path[0].level,'country');assert.equal(new Set(path.map(n=>n.id)).size,path.length); }
});
test('specific vineyard context and Napa Cabernet styles do not leak to siblings',()=>{
  let s=ingest(inventory([wine({region:'Italy',appellation:'Barolo',vineyard:'Cannubi'})]),[chart({region:'Barolo',vineyard:'Cannubi',score:99}),chart({region:'Barolo',vineyard:'Brunate',score:80}),chart({region:'Barolo',score:90})]);
  assert.equal(analysis(s).vintage,99);assert.equal(analysis(s).vintageIntelligence.level,'vineyard');
  s=ingest(inventory([wine({raw_title:'Synthetic Napa Cabernet',region:'California',type:'Unknown'})]),[chart({region:'Napa',style:'Cabernet Sauvignon',type:'Red',score:83}),chart({region:'Napa',type:'Red',score:99})]);
  assert.equal(analysis(s).vintage,83);
});
test('publication aliases cannot double-count and latest chart revisions supersede older editions',()=>{
  let s=ingest(inventory(),[chart({region:'Pauillac',publication:'WA'}),chart({region:'Pauillac',publication:'Wine Advocate',source_reference:'SECOND SYNTHETIC REFERENCE'})]);
  assert.equal(analysis(s).vintageIntelligence.sourceCount,1);
  s=ingest(s,[chart({region:'Pauillac',publication:'Robert Parker',source_reference:'NEW SYNTHETIC REFERENCE',score:99})],'2026-10-07T13:00:00Z');
  assert.equal(analysis(s).vintage,99);assert.equal(s.vintages.length,3);
});
test('low-confidence specific data falls back and provisional sources lower confidence without inventing a rating',()=>{
  const s=ingest(inventory(),[chart({region:'Pauillac',score:99,confidence:.5}),chart({region:'Bordeaux',score:93})]);
  assert.equal(analysis(s).vintage,93);assert.equal(analysis(s).vintageIntelligence.regionUsed,'Bordeaux');
  const a=analysis(ingest(inventory(),[chart({region:'Pauillac'})]));
  const b=analysis(ingest(inventory(),[chart({region:'Pauillac',provisional:true})]));
  assert.equal(a.vintage,b.vintage);assert.ok(b.vintageIntelligence.confidence<a.vintageIntelligence.confidence);
});
test('ranking indexes large charts by year and ancestor geography instead of retaining unrelated candidates',()=>{
  const unrelated=Array.from({length:1200},(_,i)=>chart({country:'France',region:`Synthetic Other Region ${i}`,source_reference:`SYNTHETIC ${i}`}));
  const s=ingest(inventory(),[...unrelated,chart({region:'Pauillac',score:99})]);
  const a=analysis(s);assert.equal(a.vintage,99);assert.equal(a.vintageIntelligence.candidates.length,1);assert.equal(s.vintages.length,1201);
});

for(const [title,region,appellation,type,year] of [
  ['2016 Barolo','Italy','Barolo','Red',2016],['2021 Barbaresco','Italy','Barbaresco','Red',2021],
  ['Pauillac château','Bordeaux','Pauillac','Red',2019],['Côte de Nuits red','Burgundy','Vosne-Romanée','Red',2019],
  ['White Burgundy','Bourgogne','Meursault','White',2019],['Chablis','Burgundy','Chablis','White',2019],
  ['Northern Rhône','Rhone','Côte-Rôtie','Red',2019],['Southern Rhône / CdP','Rhône','CdP','Red',2019],
  ['Brunello','Italy','Brunello di Montalcino DOCG','Red',2019],['Bolgheri','Italy','Bolgheri','Red',2019],
  ['Vintage Champagne','Champagne','','Sparkling',2014],['Napa Cabernet','California / USA','Rutherford','Red',2020],
]) test(`contextual matching: ${title}`,()=>{
  const s=ingest(inventory([wine({region,appellation,type,vintage:year})]),[chart({region:appellation || region,appellation:'',type,vintage:year,score:98})]);
  const a=analysis(s); assert.equal(a.vintage,98); assert.equal(a.vintageIntelligence.sourceCount,1); assert.ok(a.vintageIntelligence.regionUsed);
});

test('appellation specificity wins over many broader assessments and falls back in order',()=>{
  let s=inventory();
  s=ingest(s,[chart({country:'France',region:'',score:83}),chart({score:94}),chart({region:'Left Bank',score:96}),chart({region:'Pauillac',score:99})]);
  let a=analysis(s);assert.equal(a.vintage,99);assert.equal(a.vintageIntelligence.regionUsed,'Pauillac');assert.equal(a.assessments.length,1);
  s.sources.find(x=>x.id==='vintage-import').enabled=false;assert.equal(analysis(s).vintage,null);
  s=inventory();s=ingest(s,[chart({score:94}),chart({region:'Left Bank',score:96})]);
  a=analysis(s);assert.equal(a.vintage,96);assert.equal(a.vintageIntelligence.fallback,true);
  s=ingest(inventory(),[chart({score:94})]);assert.equal(analysis(s).vintage,94);assert.match(analysis(s).vintageIntelligence.fallbackReason,/Pauillac/);
});
test('same year, different regions receive different vintage scores; wrong year is ignored',()=>{
  const s=ingest(inventory([wine({raw_title:'Synthetic Barolo',region:'Italy',appellation:'Barolo'}),wine({raw_title:'Synthetic Pauillac',region:'Bordeaux',appellation:'Pauillac'})]),[chart({region:'Barolo',score:99}),chart({region:'Pauillac',score:83}),chart({region:'Pauillac',vintage:2020,score:100})]);
  const rows=rankInventory(s,{},now);assert.equal(rows.find(r=>r.wine.appellation==='Barolo').vintage,99);assert.equal(rows.find(r=>r.wine.appellation==='Pauillac').vintage,83);
});
test('red and white Burgundy charts never substitute for each other',()=>{
  const s=ingest(inventory([wine({raw_title:'Synthetic red',cuvee:'Red Test',region:'Burgundy'}),wine({raw_title:'Synthetic white',cuvee:'White Test',region:'Burgundy',type:'White'})]),[chart({region:'Burgundy',type:'Red',score:99}),chart({region:'Bourgogne',type:'White',score:85})]);
  const rows=rankInventory(s,{},now);assert.equal(rows.find(a=>a.wine.type==='Red').vintage,99);assert.equal(rows.find(a=>a.wine.type==='White').vintage,85);
});
test('aliases and title appellations normalize without rewriting identity or source text',()=>{
  for(const [alias,name] of [['CdP','Châteauneuf-du-Pape'],['Cote Rotie','Côte-Rôtie'],['Barolo DOCG','Barolo'],['Bourgogne','Burgundy']]) assert.equal(canonicalGeography({region:alias}).path.at(-1).name,name);
  const s=inventory([wine({raw_title:'Synthetic Barbaresco Riserva',region:'Italy',appellation:''})]);const old=s.listings[0].wineId;
  const enriched=ingest(s,[chart({region:'Barbaresco',score:99})]);assert.equal(analysis(enriched).vintage,99);assert.equal(enriched.listings[0].wineId,old);assert.equal(enriched.wines[old].region,'Italy');
  assert.equal(canonicalGeography({rawTitle:'Synthetic CdP',region:'Rhône'}).appellation,'Châteauneuf-du-Pape');
  assert.equal(canonicalGeography({rawTitle:'Synthetic Crozes-Hermitage',region:'Rhône'}).appellation,'Crozes-Hermitage');
});
test('incorrect country, region, vintage and unsupported style cannot be manually approved',()=>{
  let s=ingest(inventory(),[chart({region:'Burgundy'}),chart({region:'Bordeaux',vintage:2020}),chart({region:'Bordeaux',style:'Cabernet Sauvignon'})]);
  assert.equal(analysis(s).vintage,null);
  for(const r of s.vintages) assert.throws(()=>applyAction(s,{type:'vintage-decision',wineId:s.listings[0].wineId,recordId:r.id,decision:'approved'},at),/cannot be approved/);
  s=ingest(inventory([wine({country:'Italy',region:'Bordeaux',appellation:'Pauillac'})]),[chart()]);assert.equal(analysis(s).vintage,null);
});
test('geographic override persists through reimport, backups and uses original inventory identity',()=>{
  const row=wine({raw_title:'Synthetic mislabeled wine',region:'Italy',appellation:'Barolo'});let s=ingest(inventory([row]),[chart({region:'Barbaresco',score:99})]);
  const id=s.listings[0].wineId;
  s=applyAction(s,{type:'geography',wineId:id,fields:{country:'Italy',region:'Piedmont',subregion:'Langhe',appellation:'Barbaresco',type:'Red'}},at);
  assert.equal(analysis(s).vintage,99);assert.equal(s.wines[id].appellation,'Barolo');
  s=ingestDataset(validateBackup(s),'flickinger',{rows:[row]},at);assert.equal(analysis(s).vintage,99);assert.equal(s.listings[0].wineId,id);
});
test('manual assessments require professional provenance and normalize categories transparently',()=>{
  let s=inventory();s=applyAction(s,{type:'manual-vintage',assessment:chart({region:'Pauillac',original_rating:'Outstanding',rating_system:'category'})},at);
  assert.equal(analysis(s).vintage,96);assert.equal(s.vintages[0].rawRating,'Outstanding');assert.equal(s.vintages[0].score,null);
  s=ingest(inventory(),[chart({publication:'Random blog',source_reference:'',score:100})]);assert.equal(analysis(s).vintage,null);
  assert.match(s.vintages[0].warnings.join(),/Professional/);
});
test('star, category, letter and numeric conversions preserve originals and reject inventions',()=>{
  assert.equal(normalizeVintageRating('★★★★★').normalizedScore,98);
  assert.equal(normalizeVintageRating('4',5,'stars').normalizedScore,93);
  assert.equal(normalizeVintageRating('A+',null,'letter').normalizedScore,99);
  assert.equal(normalizeVintageRating('18',20).normalizedScore,90);
  assert.equal(normalizeVintageRating('94–96').normalizedScore,94);
  assert.throws(()=>normalizeVintageRating('Amazing',null,'category'));
  assert.throws(()=>normalizeVintageRating('5',100,'stars'));
  assert.equal(vintageComponent(98)-vintageComponent(95),15);
});
test('multiple professional publications aggregate independently and disagreement lowers confidence',()=>{
  const matching=[chart({region:'Pauillac',publication:'Wine Advocate',score:99}),chart({region:'Pauillac',publication:'Wine Spectator',score:99}),chart({region:'Pauillac',publication:'Decanter',score:99})];
  const agree=analysis(ingest(inventory(),matching)).vintageIntelligence;
  const disagree=analysis(ingest(inventory(),[...matching.slice(0,2),{...matching[2],score:80}])).vintageIntelligence;
  assert.equal(agree.sourceCount,3);assert.ok(['High','Very High'].includes(agree.confidenceLabel));assert.ok(disagree.confidence<agree.confidence);assert.equal(disagree.status,'Conflicting source data');
});
test('country fallback is low confidence; Champagne excludes generic country data',()=>{
  const s=ingest(inventory(),[chart({country:'France',region:'',score:92})]);assert.equal(analysis(s).vintage,92);assert.equal(analysis(s).vintageIntelligence.confidenceLabel,'Low');
  const champagne=ingest(inventory([wine({region:'Champagne',type:'Sparkling'})]),[chart({country:'France',region:'',type:'All'})]);assert.equal(analysis(champagne).vintage,null);
});
test('NV, MV and missing evidence omit the component with no factual score',()=>{
  for(const vintage of ['NV','MV',2019]) {
    const s=inventory([wine({region:'Champagne',type:'Sparkling',vintage})]),a=analysis(s);
    assert.equal(a.vintage,null);assert.equal(a.breakdown.find(b=>b.key==='vintage').contribution,0);assert.equal(a.breakdown.find(b=>b.key==='vintage').value,null);assert.equal(a.coverage,0);
    assert.equal(rankInventory(s,{minVintageScore:1},now).length,0);
  }
});
test('critic and vintage scores and contributions are separate; filters combine and rerank',()=>{
  let s=inventory([wine({raw_title:'Synthetic A',appellation:'Pauillac',region:'Bordeaux',ratings:'WA 98'}),wine({raw_title:'Synthetic B',appellation:'Barolo',region:'Italy',ratings:'WA 96'})]);
  s=ingest(s,[chart({region:'Pauillac',score:85}),chart({region:'Barolo',score:99})]);
  const rows=rankInventory(s,{},now),a=rows.find(r=>r.wine.appellation==='Pauillac');assert.equal(a.quality,98);assert.equal(a.vintage,85);
  assert.notEqual(a.breakdown.find(b=>b.key==='quality').contribution,a.breakdown.find(b=>b.key==='vintage').contribution);
  const filtered=rankInventory(s,{minCritic:96,minVintageScore:95,vintageTier:'Exceptional|Outstanding'},now);assert.equal(filtered.length,1);assert.equal(filtered[0].rank,1);assert.equal(filtered[0].wine.appellation,'Barolo');
  assert.equal(rankInventory(s,{sort:'vintage'},now)[0].wine.appellation,'Barolo');
  assert.ok(s.scoreHistory.at(-1).vintageEvidence.length);assert.equal(s.scoreHistory.at(-1).algorithmVersion,6);
});
test('duplicate retrieval retains IDs/decisions and changes retain previous ratings',()=>{
  let s=ingest(inventory(),[chart({region:'Pauillac'})]);const id=s.vintages[0].id,wineId=s.listings[0].wineId;
  s=applyAction(s,{type:'vintage-decision',wineId,recordId:id,decision:'rejected'},at);
  s=ingest(s,[chart({region:'Pauillac'})],'2026-10-07T13:00:00Z');assert.equal(s.vintages.length,1);assert.equal(s.vintages[0].id,id);assert.equal(analysis(s).vintage,null);
  s=ingest(s,[chart({region:'Pauillac',score:99})],'2026-10-07T14:00:00Z');assert.equal(s.vintages[0].revisions[0].normalizedScore,96);
  s=applyAction(s,{type:'vintage-decision',wineId,recordId:id,decision:'approved'},at);assert.equal(analysis(s).vintage,99);
  assert.equal(validateBackup(s).vintages[0].id,id);
});
test('manual source mapping and rating corrections survive provider updates',()=>{
  let s=ingest(inventory(),[chart({region:'Margaux'})]);const id=s.vintages[0].id;
  s=applyAction(s,{type:'vintage-edit',recordId:id,fields:{country:'France',region:'Bordeaux',subregion:'Médoc',appellation:'Pauillac',original_rating:'98'}},at);
  assert.equal(analysis(s).vintage,98);assert.equal(s.vintages[0].rawGeography.region,'Margaux');
  s=ingest(s,[chart({region:'Margaux',score:90})],'2026-10-07T13:00:00Z');assert.equal(s.vintages[0].id,id);assert.equal(analysis(s).vintage,98);assert.equal(validateBackup(s).vintages[0].rawGeography.region,'Margaux');
});
test('approved vintage provider fetches once per TTL, forced refresh deduplicates, failure preserves stored evidence',async()=>{
  const db=new EngineDatabase(':memory:');let s=inventory();Object.assign(s.sources.find(p=>p.id==='vintage-import'),{method:'json',accessApproved:true,url:'https://feed.example/vintages'});db.save(s);
  let clock=now,calls=0,fail=false;const refresh=new RefreshService(db,{clock:()=>clock,adapter:{async fetchVintageInformation(){calls++;if(fail)throw new Error('Provider unavailable');return {dataset:{rows:[chart({region:'Pauillac',score:99})]},etag:'v1',lastModified:''};}}});
  const service=new VintageLookupService(db,refresh),id=s.listings[0].wineId;
  assert.equal((await service.lookup(id)).assessment.score,99);await service.lookup(id);assert.equal(calls,1);
  await service.lookup(id,true);assert.equal(calls,2);assert.equal(db.load().vintages.length,1);
  fail=true;clock=new Date(+now+31*86400000);await refresh.run();assert.equal(db.load().sources.find(p=>p.id==='vintage-import').status,'Error');assert.equal(assessVintage(db.load(),db.load().wines[id]).score,99);
  assert.equal('market' in db.load(),false);db.close();
});
