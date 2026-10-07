// Synthetic chart ratings. Actual user-supplied charts stay private.
import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, ingestDataset, validateBackup } from '../src/engine/ingestion.js';
import { rankInventory } from '../src/engine/ranking.js';
import { canonicalGeography } from '../src/engine/geography.js';
import { identifyWine } from '../src/engine/identity.js';
const at='2026-10-07T12:00:00Z';
const chart=fields=>({vintage:2019,publication:'Wine Spectator',original_rating:94,type:'Red',source_reference:'SYNTHETIC CHART',...fields});
function load(wines,charts) {
  let s=ingestDataset(initialState(),'flickinger',{rows:wines.map(w=>({vintage:2019,format:'750ml',price:100,...w}))},at);
  return ingestDataset(s,'vintage-import',{rows:charts},at);
}
const ranked=s=>rankInventory(s,{},new Date(at));
test('bank and variety scopes prevent unrelated red or white wines receiving ratings',()=>{
  const s=load([
    {raw_title:'Synthetic Pauillac',region:'Bordeaux'},
    {raw_title:'Ch. Cheval Blanc St. Emilion',region:'Bordeaux'},
    ...['Cabernet Sauvignon','Cabernet Franc','Pinot Noir','Chardonnay','Sauvignon Blanc','Proprietary Red Blend'].map(style=>({raw_title:`Synthetic ${style}`,region:'California'})),
  ],[
    chart({region:'Bordeaux',subregion:'Left Bank',original_rating:91}),
    chart({region:'Bordeaux',subregion:'Right Bank',original_rating:97,source_reference:'SYNTHETIC RIGHT'}),
    chart({region:'California',allowed_styles:['Cabernet Sauvignon','Cabernet Franc'],source_reference:'SYNTHETIC CAB',original_rating:93}),
    chart({region:'California',style:'Pinot Noir',source_reference:'SYNTHETIC PINOT',original_rating:90}),
    chart({region:'California',style:'Chardonnay',type:'White',source_reference:'SYNTHETIC WHITE',original_rating:92}),
  ]);
  const scores=Object.fromEntries(ranked(s).map(r=>[r.wine.rawTitle,r.vintage]));
  assert.equal(scores['Synthetic Pauillac'],91);assert.equal(scores['Ch. Cheval Blanc St. Emilion'],97);
  for(const [style,score] of [['Cabernet Sauvignon',93],['Cabernet Franc',93],['Pinot Noir',90],['Chardonnay',92],['Sauvignon Blanc',null],['Proprietary Red Blend',null]]) assert.equal(scores[`Synthetic ${style}`],score);
  assert.equal(rankInventory(s,{subregion:'Left Bank Bordeaux'},new Date(at)).length,1);
  assert.equal(rankInventory(s,{style:'pinot noir'},new Date(at)).length,1);
  assert.equal(rankInventory(s,{type:'White'},new Date(at)).length,2);
  assert.equal(rankInventory(s,{country:'France'},new Date(at)).length,2);
  assert.doesNotThrow(()=>validateBackup(s));
});
test('appellation-limited charts exclude siblings while Rhône general charts cover both colors',()=>{
  const s=load([
    {raw_title:'Synthetic Musigny',region:'Burgundy'},
    {raw_title:'Synthetic Pommard',region:'Burgundy'},
    {raw_title:'Synthetic Chianti Classico',region:'Italy'},
    {raw_title:'Synthetic Brunello',region:'Italy'},
    {raw_title:'Synthetic Barolo',region:'Italy'},
    {raw_title:'Synthetic Barbera',region:'Piedmont',type:'Red'},
    {raw_title:'Synthetic Hermitage Blanc',region:'Rhône'},
    {raw_title:'Synthetic Cornas',region:'Rhône'},
    {raw_title:'Synthetic Champagne Blanc de Blancs',region:'Champagne'},
  ],[
    chart({region:'Burgundy',subregion:'Côte de Nuits'}),
    chart({region:'Tuscany',subregion:'Chianti'}),
    chart({region:'Piedmont',allowed_appellations:['Barolo','Barbaresco']}),
    chart({region:'Rhône',subregion:'Northern Rhône',type:'All'}),
    chart({region:'Champagne',type:'Sparkling'}),
  ]);
  for(const r of ranked(s)) assert.equal(r.vintage,/Pommard|Brunello|Barbera/.test(r.wine.rawTitle)?null:94,r.wine.rawTitle);
});
test('footnotes, source provenance and regional drinking labels survive correction, repeat import and backup',()=>{
  const row=chart({region:'California',style:'Pinot Noir',original_rating:'89*',chart_name:'Synthetic Pinot chart',source_document:'synthetic.pdf',source_page:3,drinking_status:'Drink',source_category:'Very good',notes:'SYNTHETIC footnote'});
  let s=load([{raw_title:'Synthetic Pinot Noir',region:'California'}],[row]);
  const originalId=s.vintages[0].id;
  assert.equal(ranked(s)[0].vintage,89);assert.equal(s.vintages[0].rawRating,'89*');
  assert.equal(ranked(s)[0].drinkNow,null);
  s=ingestDataset(s,'vintage-import',{rows:[row]},'2026-10-07T13:00:00Z');
  assert.equal(s.vintages.length,1);assert.equal(s.vintages[0].id,originalId);
  s=ingestDataset(s,'vintage-import',{rows:[{...row,original_rating:'90',drinking_status:'Hold'}]},'2026-10-07T14:00:00Z');
  assert.equal(s.vintages.length,1);assert.equal(s.vintages[0].revisions[0].rawRating,'89*');assert.equal(s.vintages[0].drinkingStatus,'Hold');
  assert.doesNotThrow(()=>validateBackup(s));
  const damaged=structuredClone(s);damaged.vintages[0].allowedAppellations=['invented'];assert.throws(()=>validateBackup(damaged),/recognized appellation/);
});
test('explicit style is descriptive and leaves wine identity unchanged',()=>{
  const row={raw_title:'Synthetic California wine',vintage:2019,format:'750ml',region:'California'};
  assert.equal(identifyWine(row).id,identifyWine({...row,style:'Chardonnay'}).id);
  assert.equal(canonicalGeography({...row,style:'Chardonnay'}).style,'chardonnay');
  assert.equal(canonicalGeography({...row,style:'Chardonnay'}).type,'White');
  assert.equal(canonicalGeography({...row,style:'Chard'}).type,'White');
  assert.equal(canonicalGeography({...row,raw_title:'Synthetic Cabernet Sauvignon',style:'Chardonnay'}).conflict,true);
  assert.equal(canonicalGeography({raw_title:'Synthetic Pauillac Pomerol',region:'Bordeaux'}).conflict,true);
});
