import { test, expect } from '@playwright/test';
import fs from 'node:fs';
async function importRows(page,rows,charts=false){
  await page.getByRole('button',{name:charts?'Vintage charts':'Import data',exact:true}).click();
  if(!charts) await page.getByRole('combobox',{name:'Import source',exact:true}).selectOption('flickinger');
  else await expect(page.getByRole('combobox',{name:'Import source',exact:true})).toHaveValue('vintage-import');
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({name:'synthetic-chart.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({rows}))});
  await page.getByRole('button',{name:'Validate and import',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
}
test.beforeEach(async({page})=>{await page.route('**/api/**',r=>r.fulfill({status:404,body:'{}'}));await page.goto(process.env.WINE_TEST_URL || '/');});
test('chart manager imports scoped ratings, filters banks/styles, and retains revisions after reload',async({page})=>{
  await importRows(page,[{raw_title:'Synthetic Pauillac',region:'Bordeaux',vintage:2019,format:'750ml',price:90},{raw_title:'Synthetic Pomerol',region:'Bordeaux',vintage:2019,format:'750ml',price:90},{raw_title:'Synthetic California Pinot Noir',region:'California',vintage:2019,format:'750ml',price:90}]);
  const row={vintage:2019,publication:'Wine Spectator',original_rating:'91*',region:'Bordeaux',subregion:'Left Bank',type:'Red',source_reference:'SYNTHETIC LEFT',chart_name:'Synthetic Left Bank chart',source_document:'synthetic.pdf',source_page:1,drinking_status:'Hold',source_category:'Outstanding'};
  await importRows(page,[row],true);
  await page.getByRole('combobox',{name:'Subregion / bank',exact:true}).selectOption('Left Bank Bordeaux');
  await expect(page.locator('#engine-results tbody tr')).toHaveCount(1);
  await expect(page.locator('#engine-results')).toContainText('91.0 /100');
  await page.getByRole('button',{name:'Vintage Intelligence',exact:true}).click();
  await expect(page.locator('#engine-dialog')).toContainText('Source regional drinking status: Hold');
  await expect(page.locator('#engine-dialog')).toContainText('synthetic.pdf · page 1');
  await page.locator('#engine-dialog-close').click();
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  await expect(page.locator('#engine-dialog')).toContainText('Synthetic Left Bank chart');
  await page.locator('#engine-dialog-close').click();
  await importRows(page,[{...row,original_rating:'95'}],true);
  await page.reload();await page.getByRole('combobox',{name:'Subregion / bank',exact:true}).selectOption('Left Bank Bordeaux');
  await expect(page.locator('#engine-results')).toContainText('95.0 /100');
  await page.getByRole('button',{name:'Vintage Intelligence',exact:true}).click();
  await expect(page.locator('#engine-dialog')).toContainText('1 earlier source revisions retained');
  await page.locator('#engine-dialog-close').click();
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await page.getByRole('combobox',{name:'Wine style / variety',exact:true}).selectOption('pinot noir');
  await expect(page.locator('#engine-results tbody tr')).toHaveCount(1);
  await expect(page.locator('#engine-results')).toContainText('Not assessed');
});
test('private supplied chart pack validates through the browser importer',async({page})=>{
  test.skip(!process.env.WINE_TEST_VINTAGE_PACK,'Private chart pack not provided.');
  const data=JSON.parse(fs.readFileSync(process.env.WINE_TEST_VINTAGE_PACK));
  await importRows(page,data.rows,true);
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  await expect(page.locator('#engine-dialog-body table tbody tr')).toHaveCount(15);
  await expect(page.locator('#engine-dialog')).toContainText('California Chardonnay');
  await expect(page.locator('#engine-dialog')).toContainText('Bordeaux Right Bank Reds');
  await page.locator('#engine-dialog-close').click();
  await page.reload();await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  await expect(page.locator('#engine-dialog-body table tbody tr')).toHaveCount(15);
});

test('private inventory gains vintage evidence without losing wines or retailer reviews',async({page})=>{
  test.skip(!process.env.WINE_TEST_WORKBOOK || !process.env.WINE_TEST_VINTAGE_PACK,'Private workbook and chart pack not provided.');
  test.setTimeout(180000);
  await page.getByRole('button',{name:'Import data',exact:true}).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles(process.env.WINE_TEST_WORKBOOK);
  await page.getByRole('button',{name:'Validate and import',exact:true}).click();
  await page.getByRole('button',{name:'Confirm Excel import',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible({timeout:60000});
  const data=JSON.parse(fs.readFileSync(process.env.WINE_TEST_VINTAGE_PACK));
  await importRows(page,data.rows,true);
  await page.getByLabel('Minimum vintage score',{exact:true}).fill('0');
  await expect(page.locator('#engine-result-count')).toHaveText('6632 in your filtered universe');
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await expect(page.locator('#engine-result-count')).toHaveText('8648 in your filtered universe');
  await page.reload();
  await expect(page.locator('#engine-result-count')).toHaveText('8648 in your filtered universe',{timeout:60000});
  await page.getByLabel('Minimum vintage score',{exact:true}).fill('0');
  await expect(page.locator('#engine-result-count')).toHaveText('6632 in your filtered universe');
  const counts=await page.evaluate(async()=>{
    const db=await new Promise(resolve=>{const r=indexedDB.open('wine-intelligence',1);r.onsuccess=()=>resolve(r.result);});
    const state=await new Promise(resolve=>{const r=db.transaction('engine').objectStore('engine').get('wine-intelligence.v1');r.onsuccess=()=>resolve(r.result);});
    db.close();return {listings:state.listings.length,reviews:state.reviews.length,charts:state.vintages.length};
  });
  expect(counts).toEqual({listings:8648,reviews:4346,charts:466});
  // Reimport after chart enrichment must retain the chart matches and review facts.
  await page.getByRole('button',{name:'Import data',exact:true}).click();
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles(process.env.WINE_TEST_WORKBOOK);
  await page.getByRole('button',{name:'Validate and import',exact:true}).click();
  await page.getByRole('button',{name:'Confirm Excel import',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible({timeout:60000});
  await expect(page.locator('#engine-result-count')).toHaveText('6632 in your filtered universe');
  await page.reload();
  await page.getByLabel('Minimum vintage score',{exact:true}).fill('0');
  await expect(page.locator('#engine-result-count')).toHaveText('6632 in your filtered universe');
});
