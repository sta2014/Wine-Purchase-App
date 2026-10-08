import test from 'node:test';import assert from 'node:assert/strict';
import {identifyWine} from '../src/engine/identity.js';import {canonicalGeography} from '../src/engine/geography.js';
import {EngineDatabase} from '../server/database.js';import {createEngineServer} from '../server/index.js';import {MarketResearchService} from '../server/market-jobs.js';import {initialState,ingestDataset} from '../src/engine/ingestion.js';
test('retailer R/W/S types and Ermitage aliases remain precise',()=>{
 for(const [type,expected] of [['R','Red'],['W','White'],['S','Sparkling']])assert.equal(identifyWine({raw_title:'Synthetic estate',vintage:2019,format:'750ml',type}).type,expected);
 const geo=canonicalGeography({rawTitle:'Synthetic Ermitage Le Pavillon',region:'Rhone',type:'R'});assert.equal(geo.appellation,'Hermitage');assert.equal(geo.type,'Red');
 const tart=canonicalGeography({rawTitle:'Synthetic Clos du Tart',region:'Burgundy',type:'R'});assert.ok(tart.path.some(n=>n.id==='nuits'));
});
test('reimport updates explicit geography and color metadata without changing identity',()=>{
 let state=ingestDataset(initialState(),'flickinger',{rows:[{raw_title:'Synthetic estate',vintage:2019,format:'750ml',price:90}]});const id=state.listings[0].wineId;
 state=ingestDataset(state,'flickinger',{rows:[{raw_title:'Synthetic estate',vintage:2019,format:'750ml',price:90,region:'Burgundy',type:'R'}]});assert.equal(state.listings[0].wineId,id);assert.equal(state.wines[id].type,'Red');assert.equal(state.wines[id].region,'Burgundy');
});
test('inventory upload queues prices and verified results persist after mocked background work',async()=>{
 const db=new EngineDatabase(':memory:'),jobs=new MarketResearchService(db,{adapter:{search:async(source,wine)=>({rows:[{raw_title:wine.rawTitle,producer:wine.producer,cuvee:wine.cuvee,vintage:wine.vintage,format:'750ml',region:'Bordeaux',type:'Red',price:100,currency:'USD',merchant:'Synthetic independent merchant',merchant_country:'US',merchant_confidence:1,source_url:'https://synthetic.example/wine',availability_status:'CONFIRMED_IN_STOCK',availability_verified:true,verified_at:new Date().toISOString(),verification_method:'structured_merchant',verification_evidence:'SYNTHETIC automated stock fixture'}],pages:1,status:'Synthetic observation'})}});
 const app=createEngineServer({database:db,marketResearch:jobs});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 try{const base=`http://127.0.0.1:${app.server.address().port}`,r=await fetch(base+'/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedRevision:db.load().revision,action:{type:'import',sourceId:'flickinger',dataset:{rows:[{raw_title:'Synthetic Estate Pauillac',producer:'Synthetic Estate',vintage:2019,format:'750ml',price:80,currency:'USD',type:'R',region:'Bordeaux'}]}}})});assert.equal(r.status,200);const s=await r.json();assert.equal(s.runs.find(r=>r.category==='inventory').marketResearch.queued,1);assert.equal(s.market.length,0);await jobs.tick();assert.equal(db.load().market.length,1);assert.equal(jobs.summary().counts.completed,1);}finally{await new Promise(r=>app.server.close(r));db.close();}
});

test('new private Flickinger workbook maps color column and preserves improved chart coverage on reimport',{skip:!process.env.WINE_TEST_UPDATED_WORKBOOK},async()=>{
 const {default:readExcel}=await import('read-excel-file/node');const {readFile}=await import('node:fs/promises');const {suggestColumns,mapSpreadsheet}=await import('../src/engine/spreadsheet.js');const {rankInventory}=await import('../src/engine/ranking.js');
 const data=(await readExcel(await readFile(process.env.WINE_TEST_UPDATED_WORKBOOK)))[0].data,rows=mapSpreadsheet(data,0,suggestColumns(data[0]),{currency:'USD',price_basis:'package'});
 let s=ingestDataset(initialState(),'flickinger',{rows});s=ingestDataset(s,'vintage-import',JSON.parse(await readFile('public/data/wine-spectator-vintage-charts.json','utf8')));
 const counts=s=>({offers:s.listings.filter(l=>l.isAvailable).length,matched:rankInventory(s).filter(r=>r.vintage!=null).length,charts:s.vintages.length});assert.deepEqual(counts(s),{offers:8645,matched:6917,charts:466});
 s=ingestDataset(s,'flickinger',{rows,completeSnapshot:true});assert.deepEqual(counts(s),{offers:8645,matched:6917,charts:466});
});
