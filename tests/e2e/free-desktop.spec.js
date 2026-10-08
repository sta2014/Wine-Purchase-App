import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('free Windows pricing is discoverable and its complete package downloads unchanged',async({page})=>{
 await page.route('**/api/**',r=>r.fulfill({status:404,body:'{}'}));await page.goto(process.env.WINE_TEST_URL || '/');
 await page.getByRole('button',{name:'Free desktop pricing',exact:true}).click();
 await expect(page.locator('#engine-dialog')).toContainText('No subscription, hosting bill or cloud account');
 await expect(page.locator('#engine-dialog')).toContainText('Start Wine.exe');
 await expect(page.locator('#engine-dialog')).toContainText('Current automatic retailer coverage is JJ Buckley');
 const response=await page.request.get(new URL('downloads/wine-windows.zip',page.url()).href);expect(response.ok()).toBeTruthy();
 const actual=await response.body(),expected=await readFile('public/downloads/wine-windows.zip');
 expect(actual.subarray(0,2).toString()).toBe('PK');expect(createHash('sha256').update(actual).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));
 await page.locator('#engine-dialog-close').click();await page.getByRole('button',{name:'Connect engine',exact:true}).click();
 await expect(page.locator('#engine-dialog')).toContainText('download the desktop app');
 await expect(page.locator('#engine-dialog').getByRole('link',{name:'Set up the prepared Render service'})).toHaveCount(0);
});
