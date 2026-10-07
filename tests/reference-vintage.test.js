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
  console.log('Private reference: 8648 offers / 4346 critic facts; Barolo fixture routes correctly, other 2016 regions remain unrated.');
});
