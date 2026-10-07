import test from 'node:test';
import assert from 'node:assert/strict';
import readExcel from 'read-excel-file/node';
import { readFile } from 'node:fs/promises';
import { suggestColumns,mapSpreadsheet } from '../src/engine/spreadsheet.js';
import { initialState,ingestDataset } from '../src/engine/ingestion.js';
import { rankInventory } from '../src/engine/ranking.js';

test('private reference inventory retains all wines/scores and routes geographic fixture assessments correctly', {skip:!process.env.WINE_TEST_WORKBOOK}, async()=>{
  const sheets=await readExcel(await readFile(process.env.WINE_TEST_WORKBOOK)),data=sheets.find(s=>s.sheet==='Inventory').data;
  const rows=mapSpreadsheet(data,0,suggestColumns(data[0]),{currency:'USD',price_basis:'package'});
  const state=ingestDataset(initialState(),'flickinger',{rows}),ranked=rankInventory(state);
  assert.equal(state.listings.length,8648);assert.equal(state.reviews.length,4346);assert.ok(ranked.every(a=>a.vintage==null));
  assert.ok(ranked.filter(a=>a.vintageIntelligence.geography.level==='appellation').length>6000);
  const target=ranked.find(a=>a.vintageIntelligence.geography.appellation==='Barolo' && a.wine.vintage===2016);
  assert.ok(target);
  // Routing test only: this rating is synthetic and never becomes user data.
  const enriched=ingestDataset(state,'vintage-import',{rows:[{vintage:2016,region:'Barolo',type:'Red',publication:'Wine Advocate',score:99,source_reference:'SYNTHETIC ROUTING FIXTURE ONLY'}]});
  const updated=rankInventory(enriched),a=updated.find(r=>r.listing.id===target.listing.id);
  assert.equal(a.vintage,99);assert.equal(a.vintageIntelligence.regionUsed,'Barolo');assert.equal(a.quality,target.quality);
  assert.ok(updated.filter(r=>r.wine.vintage===2016 && !r.vintageIntelligence.geography.path.some(n=>n.id==='barolo')).every(r=>r.vintage==null));
  const marketTarget=ranked.find(r=>r.wine.canonicalProducer && r.wine.vintage && r.wine.formatKnown && !r.wine.warnings.some(w=>/conflict|Multiple/.test(w)));
  assert.ok(marketTarget);
  const w=marketTarget.wine,unit=marketTarget.listing.unitPrice,stamp=new Date().toISOString();
  const marketFields={raw_title:w.rawTitle,producer:w.producer,cuvee:w.cuvee,vineyard:w.vineyard,appellation:w.appellation,region:w.region,subregion:w.subregion,country:w.country,type:w.type,vintage:w.vintage,bottle_ml:w.bottleMl,pack_count:w.packCount,packaging:w.packaging,currency:marketTarget.listing.currency,price_terms:marketTarget.listing.priceTerms,merchant_country:'US',merchant_confidence:1,availability_status:'CONFIRMED_IN_STOCK',availability_verified:true,verified_at:stamp,verification_method:'manual_merchant_check',verification_evidence:'SYNTHETIC MATCHING TEST ONLY — no real merchant prices'};
  const offers=[1.2,1.3,1.4].map((factor,i)=>({...marketFields,price:unit*factor*w.packCount,merchant:`Synthetic merchant ${i}`,source_url:`https://synthetic-${i}.example/reference-wine`}));
  offers.push({...offers[0],merchant:'Synthetic sold',source_url:'https://synthetic-sold.example/reference-wine',price:unit*.5*w.packCount,availability_status:'SOLD',is_available:false});
  const marketState=ingestDataset(state,'market-import',{rows:offers},stamp),matched=rankInventory(marketState).find(a=>a.listing.id===marketTarget.listing.id);
  assert.equal(matched.marketIntelligence.offerCount,3);assert.ok(Math.abs(matched.referencePrice-unit*1.3)<1e-7);assert.equal(matched.quality,marketTarget.quality);assert.equal(marketState.listings.length,8648);assert.equal(marketState.reviews.length,4346);
  console.log('Private reference: 8648 offers / 4346 critic facts; Barolo fixture routes correctly, other 2016 regions remain unrated.');
  console.log('Private reference: synthetic market offers match an actual imported identity/format; sold stock excluded; no fabricated prices saved to user data.');
});
