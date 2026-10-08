import {parseMerchantProducts} from './market-adapters.js';
const plain=v=>v.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
// Separate retailer rules enrich schema Offer evidence with explicit visible format fields.
const profiles={
 'jj-buckley':{format:/<dt[^>]*>\s*Size\s*<\/dt>\s*<dd[^>]*>\s*([^<]+)<\/dd>/i},
 'benchmark':{format:/<[^>]+(?:itemprop=["']size["']|data-bottle-size)[^>]*>\s*([^<]+)</i},
 'kl':{format:/<[^>]+itemprop=["']size["'][^>]*>\s*([^<]+)</i},
};
export function parseSourceProducts(html,source,url,now=new Date()) {
 const dataset=parseMerchantProducts(html,{name:source.name,url,merchantCountry:'US',merchantConfidence:source.merchantConfidence ?? .9,priceTerms:source.priceTerms || 'unspecified'},now);
 if(source.id==='jj-buckley') {const fields=Object.fromEntries([...html.matchAll(/<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gis)].map(m=>[plain(m[1]).toLowerCase(),plain(m[2])]));for(const row of dataset.rows)for(const [label,key] of [['country','country'],['region','region'],['sub-region','subregion'],['vintage','vintage'],['color & type','type']])if(fields[label])row[key]=fields[label];}
 const rule=profiles[source.id];const format=rule?.format.exec(html)?.[1];
 for(const row of dataset.rows) {
  if(!row.format && format && /^\d+(?:\.\d+)?\s*(?:ml|cl|l)$/i.test(plain(format)))row.format=plain(format);
  row.condition=html.match(/itemprop=["']itemCondition["'][^>]*content=["']([^"']+)/i)?.[1] || '';
  // Ambiguous pack/case wording must never default to a singleton bottle comparison.
  if(/\b(?:\d+[ -]pack|case of \d+)\b/i.test(row.raw_title) && !/\d+\s*[x×]\s*\d+\s*(?:ml|cl|l)/i.test(row.format)) {
   row.confidence=.5;row.verification_evidence+=' Package price basis requires review.';
  }
 }
 return dataset;
}
export const MERCHANT_PROFILES=Object.keys(profiles);
