import{test,expect}from'@playwright/test';
test.beforeEach(async({page})=>{await page.route('**/api/**',r=>r.fulfill({status:404,body:'{}'}));await page.goto(process.env.WINE_TEST_URL || '/');});
test('desktop registry exposes real coverage and no paid API requirement in browser mode',async({page})=>{
 await page.getByRole('button',{name:'Market research',exact:true}).click();
 await expect(page.locator('#engine-dialog')).toContainText('50 curated source candidates');
 await expect(page.locator('#engine-dialog')).toContainText('4 domains verified');
 await expect(page.getByRole('button',{name:'Refresh Market Prices',exact:true})).toBeDisabled();
 await expect(page.locator('#engine-dialog')).toContainText('without paid APIs');
 await expect(page.locator('#engine-dialog-body table').first().locator('tbody tr')).toHaveCount(50);
 await page.locator('#engine-dialog-close').click();
 await expect(page.getByRole('combobox',{name:'Pricing confidence',exact:true})).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:'Minimum lot savings',exact:true})).toBeVisible();
});
