import {requestRetailerText} from './retailer-request.js';
import { robotsAllowed, robotsCrawlDelay } from './adapters.js';
import {parseSourceProducts} from './merchant-profiles.js';
import { normalized } from '../src/engine/identity.js';
const decode=s=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
export class PublicMarketAdapter {
 constructor({request=requestRetailerText,clock=()=>Date.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}) {this.request=request;this.clock=clock;this.sleep=sleep;this.policies=new Map();this.last=new Map();this.indices=new Map();this.locks=new Map();}
 async page(source,value) {
  const url=new URL(value),home=new URL(source.homepage);
  if(url.protocol!=='https:' || url.origin!==home.origin || url.username || url.password) throw new Error('Research URL must stay on the verified HTTPS retailer origin.');
  const previous=this.locks.get(home.origin) || Promise.resolve();
  const task=previous.catch(()=>{}).then(async()=>{
   let policy=this.policies.get(home.origin);
   if(!policy || this.clock()-policy.at>86400000) {
    const r=await this.request(home.origin+'/robots.txt');
    if(![200,404].includes(r.status)) throw new Error(`Robots access unavailable (HTTP ${r.status}); collection paused.`);
    policy={text:r.status===404?'':r.text,at:this.clock()};this.policies.set(home.origin,policy);this.last.set(home.origin,this.clock());
   }
   if(!robotsAllowed(policy.text,url.pathname+url.search)) throw new Error('robots.txt disallows this URL; manual discovery only.');
   const delay=Math.max(source.minIntervalMs || 5000,robotsCrawlDelay(policy.text));
   const wait=(this.last.get(home.origin) ?? 0)+delay-this.clock();if(wait>0) await this.sleep(wait);
   this.last.set(home.origin,this.clock());const r=await this.request(url.href);
   if(r.status===429){const e=new Error('Retailer rate limit; retry deferred.');e.retryAfterMs=Math.max(60000,Math.min(86400000,Number(r.headers?.['retry-after'] || 60)*1000));throw e;}
   if(r.status===401 || r.status===403 || /captcha|cf-chl-|access denied|verify you are human/i.test(r.text.slice(0,10000))) throw new Error(`Access restricted (HTTP ${r.status}); no bypass attempted.`);
   if(r.status!==200) throw new Error(`Retailer returned HTTP ${r.status}.`);
   return r;
  });this.locks.set(home.origin,task);return task;
 }
 async productURLs(source,wine) {
  if(source.productURLs?.length) return source.productURLs.slice(0,source.maxProducts || 5);
  if(source.searchVerified && source.searchPath) {
   const q=[wine.producer,wine.cuvee,wine.vintage].filter(Boolean).join(' ');
   const search=new URL(source.searchPath.replace('{query}',encodeURIComponent(q)),source.homepage);
   const r=await this.page(source,search.href),links=[];
   for(const match of r.text.matchAll(/href=["']([^"']+)["']/gi)) {try {const u=new URL(decode(match[1]),source.homepage);if(u.origin===new URL(source.homepage).origin && new RegExp(source.productPathPattern || '/(?:products?|wine)/','i').test(u.pathname)) links.push(u.href);}catch{}}
   return this.select([...new Set(links)],wine,source.maxProducts || 5);
  }
  let cached=this.indices.get(source.id);
  if(!cached || this.clock()-cached.at>7*86400000) {
   const r=await this.page(source,new URL(source.sitemapPath || '/sitemap.xml',source.homepage).href);
   const locations=[...r.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m=>decode(m[1]));let urls=locations;
   if(/<sitemapindex/i.test(r.text)) {
    urls=[];for(const child of locations.filter(u=>/product|wine|sitemap/i.test(u)).slice(0,3)) {const r=await this.page(source,child);urls.push(...[...r.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(m=>decode(m[1])));}
   }
   const origin=new URL(source.homepage).origin;
   cached={at:this.clock(),urls:[...new Set(urls)].filter(v=>{try{return new URL(v).origin===origin;}catch{return false;}}).slice(0,20000)};this.indices.set(source.id,cached);
  }
  return this.select(cached.urls,wine,source.maxProducts || 5);
 }
 select(urls,wine,limit) {
  if(wine.vintage==null) return [];
  const tokens=normalized(wine.rawTitle).split(' ').filter(t=>t.length>3);
  return urls.map(url=>({url,key:normalized(decodeURIComponent(new URL(url).pathname))})).filter(x=>new RegExp(`\\b${wine.vintage}\\b`).test(x.key)).map(x=>({...x,score:tokens.filter(t=>x.key.includes(t)).length/Math.max(1,tokens.length)})).filter(x=>x.score>=.35).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.url);
 }
 async search(source,wine) {
  if(!source.enabled || !source.verifiedDomain || !source.termsReviewed || !source.termsURL || !source.termsNote) throw new Error('Retailer domain and permitted retrieval terms must be verified before activation.');
  if(source.classification==='auction' || source.adapter==='historical-only') return {rows:[],pages:0,status:'Historical-only source; import explicitly dated auction evidence separately.'};
  const urls=await this.productURLs(source,wine),rows=[];const errors=[];
  for(const url of urls) {try {
   const r=await this.page(source,url),dataset=parseSourceProducts(r.text,source,url,new Date(this.clock()));
   // Never copy the searched wine's producer/vintage/format into the retailer evidence.
   rows.push(...dataset.rows.map(row=>({...row,source_reference:`${source.name} direct public product page`,retailer_source_id:source.id})));
  }catch(e){errors.push({url,error:e.message});}}
  return {rows,pages:urls.length,errors,status:rows.length?'Observed product offers':urls.length?'No parseable verified product offers':'No discoverable matching product pages'};
 }
}
