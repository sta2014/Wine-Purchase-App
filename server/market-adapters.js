import { JSONFeedAdapter,requestText } from './adapters.js';

// Only a deliberately configured, access-approved merchant URL is fetched.
// JSON-LD is read from the merchant response; snippets/search caches never enter here.
export function parseMerchantProducts(html,source,now=new Date()) {
  const nodes=[];
  const walk=value=>{if(Array.isArray(value)) value.forEach(walk);else if(value && typeof value==='object') {nodes.push(value);if(value['@graph']) walk(value['@graph']);}};
  for(const script of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {walk(JSON.parse(script[1]));} catch {throw new Error('Merchant structured product JSON is malformed.');}
  }
  const type=(node,name)=>[node?.['@type']].flat().some(t=>String(t).split(/[\/#]/).at(-1)===name);
  const rows=[];
  for(const product of nodes.filter(n=>type(n,'Product'))) {
    if(!product.name || !product.offers) continue;
    const properties=Object.fromEntries((Array.isArray(product.additionalProperty)?product.additionalProperty:[]).filter(p=>p?.name && p.value!=null).map(p=>[String(p.name).toLowerCase(),p.value]));
    for(const offer of [product.offers].flat()) {
      // AggregateOffer lowPrice is not a traceable purchasable merchant offer.
      if(!type(offer,'Offer') || offer.price==null || !offer.priceCurrency) continue;
      const offerURL=new URL(offer.url || product.url || source.url,source.url);
      if(offerURL.origin!==new URL(source.url).origin) throw new Error('Merchant offer URL leaves the approved merchant origin.');
      const status=String(offer.availability || '').split(/[\/#]/).at(-1);
      const availability_status=({InStock:'CONFIRMED_IN_STOCK',LimitedAvailability:'LIKELY_IN_STOCK',OutOfStock:'OUT_OF_STOCK',SoldOut:'SOLD',PreOrder:'PRE_ARRIVAL',PreSale:'FUTURES',Discontinued:'EXPIRED'})[status] || 'UNKNOWN';
      const validUntil=offer.priceValidUntil?Date.parse(offer.priceValidUntil):null;
      const expired=validUntil!=null && (!Number.isFinite(validUntil) || validUntil<+now);
      const producer=typeof product.brand==='object'?product.brand.name:typeof product.brand==='string'?product.brand:'';
      rows.push({raw_title:String(product.name),producer:properties.producer || properties.winery || producer || '',vintage:properties.vintage || '',cuvee:properties.cuvee || '',appellation:properties.appellation || '',vineyard:properties.vineyard || '',country:properties.country || '',region:properties.region || '',type:properties.color || properties.type || 'Unknown',format:properties.format || properties['bottle size'] || product.size || '',packaging:properties.packaging || 'loose',price:offer.price,currency:offer.priceCurrency,price_basis:'package',merchant:source.name,merchant_url:new URL(source.url).origin,merchant_country:source.merchantCountry || '',merchant_confidence:source.merchantConfidence ?? .5,source_url:offerURL.href,offer_url:offerURL.href,external_id:String(product.sku || offer.sku || product['@id'] || offerURL.href),availability_status:expired?'EXPIRED':availability_status,is_available:availability_status==='CONFIRMED_IN_STOCK' && !expired,availability_verified:availability_status==='CONFIRMED_IN_STOCK' && !expired,verified_at:now.toISOString(),verification_method:'structured_merchant',verification_evidence:`Merchant schema.org Offer: availability=${status || 'missing'}, price=${offer.price} ${offer.priceCurrency}. Retrieved directly from approved merchant URL.`,price_terms:source.priceTerms || 'unspecified',offer_type:status==='PreOrder'?'pre_arrival':status==='PreSale'?'futures':'retail',source_reference:'Merchant schema.org Product / Offer',observed_at:now.toISOString(),confidence:1});
    }
  }
  if(!rows.length) throw new Error('No explicit merchant Product/Offer records found; no prices inferred from page text or AggregateOffer.');
  if(rows.length>10000) throw new Error('Merchant page exceeds offer limit.');
  return {rows,completeSnapshot:false};
}
export class StructuredMerchantAdapter {
  constructor(request=requestText) {this.feed=new JSONFeedAdapter(request,parseMerchantProducts);}
  fetchMarketPrices(source,env,now) {
    if(source.category!=='market' || source.method!=='structured') throw new Error('Structured product connector is for approved market sources only.');
    // Reuse identical credential, SSRF, robots, crawl delay, conditional and timeout safeguards.
    return this.feed.fetch({...source,method:'json'},env,now);
  }
}
