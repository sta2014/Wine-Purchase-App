import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {initialState,ingestDataset} from '../../src/engine/ingestion.js';
test('coverage distinguishes total inventory from filtered matches and exports useful unmatched evidence without changing data',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:404,body:'{}'}));await page.goto(process.env.WINE_TEST_URL || '/');
 let state=ingestDataset(initialState(),'flickinger',{rows:[{raw_title:'Synthetic Pauillac',region:'Bordeaux',vintage:2019,format:'750ml',price:90},{raw_title:'Synthetic unmapped wine',region:'Unmapped test region',vintage:2019,format:'750ml',price:90}]});
 state=ingestDataset(state,'vintage-import',{rows:[{vintage:2019,region:'Bordeaux',subregion:'Left Bank',type:'Red',publication:'Wine Spectator',score:95,source_reference:'Synthetic chart only'}]});
 await page.evaluate(async state=>{const db=await new Promise(resolve=>{const r=indexedDB.open('wine-intelligence',1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction('engine','readwrite');tx.objectStore('engine').put(state,'wine-intelligence.v1');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},state);
 await page.reload();await page.getByLabel('Minimum vintage score',{exact:true}).fill('0');
 await page.getByRole('button',{name:'Data coverage',exact:true}).click();
 await expect(page.locator('#engine-dialog')).toContainText('1 of 2 available listings');
 await expect(page.locator('#engine-dialog')).toContainText('1 vintage matches among 1 listings');
 await expect(page.locator('#engine-dialog')).toContainText('Automatic price retrieval is not connected');
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download coverage report',exact:true}).click();
 const report=JSON.parse(await readFile(await (await downloaded).path(),'utf8'));
 expect(report.inventory).toMatchObject({availableListings:2,filteredListings:1});expect(report.unmatchedWines[0].importedRegion).toBe('Unmapped test region');expect(report.vintages.matchedAvailableListings).toBe(1);
 await page.locator('#engine-dialog-close').click();await page.getByRole('button',{name:'Reset filters',exact:true}).click();await expect(page.locator('#engine-results tbody tr')).toHaveCount(2);
});
