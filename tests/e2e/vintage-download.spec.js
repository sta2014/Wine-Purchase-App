import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({status:404,body:'{}'}));
  await page.goto(process.env.WINE_TEST_URL || '/');
});
test('provided charts load directly, persist, and reimport without duplicate assessments',async({page})=>{
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  const download=page.getByRole('link',{name:'Download chart file',exact:true});
  const response=await page.request.get(new URL(await download.getAttribute('href'),page.url()).href);
  expect(response.ok()).toBeTruthy();expect((await response.json()).rows).toHaveLength(466);
  await page.getByRole('button',{name:'Load Wine Spectator charts',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await expect(page.locator('#engine-notice')).toContainText('466 Wine Spectator vintage assessments saved');
  await page.reload();
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  await expect(page.locator('#engine-dialog-body table tbody tr')).toHaveCount(15);
  await page.getByRole('button',{name:'Load Wine Spectator charts',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  const cells=await page.locator('#engine-dialog-body table tbody tr td:nth-child(4)').allTextContents();
  expect(cells.map(Number).reduce((a,b)=>a+b,0)).toBe(466);
});
test('failed chart download leaves saved data intact and permits retry',async({page})=>{
  await page.route('**/data/wine-spectator-vintage-charts.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.getByRole('button',{name:'Vintage charts',exact:true}).click();
  await page.getByRole('button',{name:'Load Wine Spectator charts',exact:true}).click();
  await expect(page.locator('#provided-vintage-chart-status')).toHaveText('The chart file could not be loaded. Please try again.');
  await expect(page.locator('#engine-dialog')).toBeVisible();
  await expect(page.locator('#engine-dialog-body')).toContainText('No vintage charts imported yet.');
  await page.unroute('**/data/wine-spectator-vintage-charts.json');
  await page.getByRole('button',{name:'Load Wine Spectator charts',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
  await expect(page.locator('#engine-notice')).toContainText('466 Wine Spectator vintage assessments saved');
});
