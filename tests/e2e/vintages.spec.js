import { test, expect } from '@playwright/test';

// Synthetic ratings only; this suite never represents real professional data.
async function upload(page,sourceId,rows) {
  await page.getByRole('button',{name:'Import data',exact:true}).click();
  await page.getByRole('combobox',{name:'Import source',exact:true}).selectOption(sourceId);
  await page.getByLabel('Excel, CSV or JSON file').setInputFiles({name:'synthetic-vintage-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({rows}))});
  await page.getByRole('button',{name:'Validate and import',exact:true}).click();
  await expect(page.locator('#engine-dialog')).not.toBeVisible();
}
test.beforeEach(async({page})=>{await page.route('**/api/**',route=>route.fulfill({status:404,body:'{}'}));await page.goto(process.env.WINE_TEST_URL || '/');});

test('vintage context filters combine with critic scores and survive reload with corrections',async({page})=>{
  const rows=[{raw_title:'Synthetic Barolo Cannubi',producer:'Synthetic Estate',vintage:2016,region:'Italy',type:'Red',format:'6x750ml',price:400,ratings:'WA 98'},{raw_title:'Synthetic Barbaresco',producer:'Synthetic Estate',vintage:2016,region:'Italy',type:'Red',format:'3x750ml',price:250,ratings:'WA 96'},{raw_title:'Synthetic Champagne NV',vintage:'NV',region:'Champagne',format:'750ml',price:90}];
  await upload(page,'flickinger',rows);
  await upload(page,'vintage-import',[{region:'Barolo DOCG',type:'Red',vintage:2016,publication:'Wine Advocate',original_rating:'5',rating_system:'stars',scale:5,source_reference:'SYNTHETIC CHART ONLY'},{region:'Barbaresco',type:'Red',vintage:2016,publication:'Decanter',original_rating:'Good',rating_system:'category',source_reference:'SYNTHETIC CHART ONLY'}]);
  const table=page.locator('#engine-results');
  await expect(table).toContainText('98.0 /100');await expect(table).toContainText('Exceptional');await expect(table).toContainText('Not applicable');
  await page.getByLabel('Minimum critic /100',{exact:true}).fill('96');
  await page.getByLabel('Vintage tier',{exact:true}).selectOption('Exceptional|Outstanding');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Barolo Cannubi');await expect(table.locator('.rank-number')).toHaveText('1');
  await table.getByRole('button',{name:'Vintage Intelligence',exact:true}).click();
  const dialog=page.locator('#engine-dialog');
  await expect(dialog).toContainText('Italy → Piedmont → Langhe → Barolo');
  await expect(dialog).toContainText('Internal normalized score: 98.0');await expect(dialog).toContainText('1→60');
  await expect(dialog.getByRole('button',{name:'Force refresh approved vintage feeds'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Reject geography',exact:true}).first().click();
  await expect(dialog).toContainText('Manually rejected geographic match');
  await dialog.getByRole('button',{name:'Approve geography',exact:true}).first().click();
  await expect(dialog).toContainText('Used in composite');
  await page.locator('#engine-dialog-close').click();await page.reload();
  await expect(table).toContainText('98.0 /100');await expect(table.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Rank by',{exact:true}).selectOption('vintage');await expect(table.locator('tbody tr').first()).toContainText('Barolo');
  await table.locator('tbody tr').first().getByRole('button',{name:'Explain',exact:true}).click();
  await expect(dialog.getByRole('row',{name:'Regional vintage quality 98.0 25 25.0 24.5',exact:true})).toBeVisible();await expect(dialog).toContainText('Vintage component 98.0 /100');await expect(dialog).toContainText('Critic and vintage components are separate');
});

test('manual vintage entry, source correction and wine mapping persist across reimport',async({page})=>{
  const row={raw_title:'Synthetic Barolo',producer:'Synthetic Estate',region:'Italy',type:'Red',vintage:2016,format:'750ml',price:80,ratings:'WA 97'};
  await upload(page,'flickinger',[row]);
  await page.getByRole('button',{name:'Vintage Intelligence',exact:true}).click();
  let form=page.locator('#manual-vintage-form');
  await form.getByLabel('Professional publication',{exact:true}).fill('Decanter');
  await form.getByLabel('Original vintage rating',{exact:true}).fill('Outstanding');
  await form.getByLabel('Original rating system',{exact:true}).selectOption('category');
  await form.getByLabel('Source reference',{exact:true}).fill('SYNTHETIC CHART ONLY');
  await form.getByRole('checkbox').check();
  await form.getByRole('button',{name:'Save vintage assessment and re-rank'}).click();
  const dialog=page.locator('#engine-dialog');await expect(dialog).toContainText('Internal composite 96.0');
  await dialog.getByRole('button',{name:'Correct source mapping / rating',exact:true}).click();
  form=page.locator('#vintage-edit-form');
  await form.getByLabel('Original rating',{exact:true}).fill('Exceptional');
  await form.getByRole('button',{name:'Save assessment correction'}).click();await expect(dialog).toContainText('Internal composite 99.0');
  form=page.locator('#wine-geography-form');await form.getByLabel('Appellation',{exact:true}).fill('Barbaresco');
  await form.getByRole('button',{name:'Save geographic correction'}).click();await expect(dialog).toContainText('No reliable vintage data found');
  await page.locator('#engine-dialog-close').click();await upload(page,'flickinger',[row]);await page.reload();
  await page.getByRole('button',{name:'Vintage Intelligence',exact:true}).click();await expect(dialog).toContainText('Italy → Piedmont → Langhe → Barbaresco');
  await expect(dialog).toContainText('No reliable vintage data found');
});
