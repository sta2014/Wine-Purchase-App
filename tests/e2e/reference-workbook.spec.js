import { test, expect } from '@playwright/test';

// Private reference workbook remains outside the repository and published site.
const workbook = process.env.WINE_TEST_WORKBOOK;
test('full reference workbook imports, filters, reloads and reimports without losing history', async ({ page }) => {
  test.skip(!workbook, 'Set WINE_TEST_WORKBOOK to a local authorized export.');
  test.setTimeout(180000);
  await page.route('**/api/**', route => route.fulfill({ status: 404, body: '{}' }));
  await page.goto(process.env.WINE_TEST_URL || '/');
  async function upload(firstImport = false) {
    await page.getByRole('button', { name: 'Import data', exact: true }).click();
    await page.getByLabel('Excel, CSV or JSON file').setInputFiles(workbook);
    await page.getByRole('button', { name: 'Validate and import', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review Excel columns' })).toBeVisible();
    const expected = ['region','vintage','format','raw_title','price','ratings'];
    for (let i = 0; i < expected.length; i++) await expect(page.locator(`[name="column-${i}"]`)).toHaveValue(expected[i]);
    const start = Date.now();
    await page.getByRole('button', { name: 'Confirm Excel import', exact: true }).click();
    await expect(page.locator('#engine-dialog')).not.toBeVisible({ timeout: 60000 });
    console.log(`Reference workbook confirm import: ${Date.now() - start} ms`);
    await expect(page.locator('#engine-result-count')).toContainText('8648');
    await expect(page.locator('#engine-results tbody tr')).toHaveCount(100);
    if (firstImport) await expect(page.locator('#engine-notice')).toContainText('4346 retailer-reported critic reviews saved');
  }
  async function summary() {
    return page.evaluate(async () => {
      const db = await new Promise((resolve,reject)=>{const r=indexedDB.open('wine-intelligence',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try { const state = await new Promise((resolve,reject)=>{const r=db.transaction('engine').objectStore('engine').get('wine-intelligence.v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
        return { listings:state.listings.length, reviews:state.reviews.length, history:state.history.length, exclusions:state.runs.at(-1).rejectedPriceRows?.length || 0, has400:state.listings.some(l=>l.price===400), unverified:state.reviews.every(r=>!r.verified), ids:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(state.listings.map(l=>l.id).sort().join('|'))))).map(b=>b.toString(16).padStart(2,'0')).join('') };
      } finally { db.close(); }
    });
  }
  await upload(true); const first = await summary();
  expect(first).toMatchObject({listings:8648,reviews:4346,history:8648,exclusions:0,has400:true,unverified:true});
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(page.locator('.rank-number').first()).toHaveText('101');
  await page.getByRole('searchbox',{name:'Search inventory',exact:true}).fill('Angelus');
  await expect(page.locator('.rank-number').first()).toHaveText('1');
  await expect(page.locator('#engine-results')).toContainText('awaiting independent verification');
  await page.getByRole('button',{name:'Reset filters',exact:true}).click();
  await expect(page.locator('#engine-result-count')).toContainText('8648');
  await page.reload(); await expect(page.locator('#engine-result-count')).toContainText('8648',{timeout:60000});
  expect(await summary()).toEqual(first);
  await upload(); const second = await summary();
  expect(second).toEqual({...first,history:17296});
  await page.reload(); await expect(page.locator('#engine-result-count')).toContainText('8648',{timeout:60000});
  expect(await summary()).toEqual(second);
});
