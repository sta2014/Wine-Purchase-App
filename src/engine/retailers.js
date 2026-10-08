import AUDIT from './retailer-audit.json' with {type:'json'};
// Curated relevance, not a sales/traffic ranking. Candidates remain inactive until audited.
const rows=[
 ['wine-com','Wine.com','www.wine.com','retailer',2,'/search/{query}/1'],
 ['total-wine','Total Wine & More','www.totalwine.com','retailer',3,'/search/all?text={query}'],
 ['kl','K&L Wine Merchants','www.klwines.com','retailer',1,'/Products?searchText={query}'],
 ['zachys','Zachys','www.zachys.com','retailer',1,'/search?q={query}'],
 ['benchmark','Benchmark Wine Group','www.benchmarkwine.com','retailer',1,'/search?query={query}'],
 ['winebid','WineBid','www.winebid.com','auction',3,'/BuyWine/Search/{query}'],
 ['jj-buckley','JJ Buckley Fine Wines','www.jjbuckley.com','retailer',1,'/all-wines?search={query}'],
 ['saratoga','Saratoga Wine Exchange','www.saratogawine.com','retailer',2,'/search/{query}'],
 ['empire','Empire Wine','www.empirewine.com','retailer',3,'/search/?q={query}'],
 ['millesima','Millesima USA','www.millesima-usa.com','retailer',1,'/search.html?q={query}'],
 ['vinfolio','Vinfolio','www.vinfolio.com','marketplace',1,'/search?q={query}'],
 ['wine-house','The Wine House','www.winehouse.com','retailer',2,'/search?q={query}'],
 ['woodland','Woodland Hills Wine Company','www.whwc.com','retailer',1,'/search.php?search_query={query}'],
 ['hi-time','Hi-Time Wine Cellars','www.hitimewine.net','retailer',2,'/search.php?search_query={query}'],
 ['chambers','Chambers Street Wines','chambersstwines.com','retailer',1,'/search?q={query}&type=product'],
 ['astor','Astor Wines & Spirits','www.astorwines.com','retailer',2,'/SearchResultsSingle.aspx?search={query}'],
 ['flatiron','Flatiron Wines & Spirits','flatiron-wines.com','retailer',1,'/search?q={query}&type=product'],
 ['crush','Crush Wine & Spirits','crushwineco.com','retailer',1,'/search?q={query}&type=product'],
 ['morrell','Morrell & Company','www.morrellwine.com','retailer',2,'/search?q={query}'],
 ['wallys',"Wally’s Wine & Spirits",'www.wallywine.com','retailer',2,'/search.php?search_query={query}'],
 ['b21','B-21','www.b-21.com','retailer',2,'/searchprods.asp?searchstring={query}'],
 ['garys',"Gary’s Wine & Marketplace",'garyswine.com','retailer',2,'/search?q={query}'],
 ['gordons',"Gordon’s Fine Wine",'www.gordonswine.com','retailer',2,'/search?q={query}'],
 ['macarthur','MacArthur Beverages / Bassin’s','www.bassins.com','retailer',1,'/search?search={query}'],
 ['calvert','Calvert Woodley','www.calvertwoodley.com','retailer',2,'/search?q={query}'],
 ['grapes','Grapes The Wine Company','www.grapesthewineco.com','retailer',1,'/search?q={query}'],
 ['wine-library','Wine Library','winelibrary.com','retailer',2,'/search?search={query}'],
 ['wine-access','Wine Access','www.wineaccess.com','retailer',2,'/search/?q={query}'],
 ['last-bottle','Last Bottle','www.lastbottlewines.com','retailer',3,'/'],
 ['first-bottle','First Bottle Wines','www.firstbottlewines.com','retailer',2,'/search?query={query}'],
 ['envoyer','Envoyer Fine Wines','www.envoyerfinewines.com','retailer',1,'/search?q={query}'],
 ['flickinger-market','Flickinger Wines','www.flickingerwines.com','retailer',1,'/search?q={query}'],
 ['acker','Acker','www.ackerwines.com','marketplace',2,'/search?q={query}'],
 ['sothebys',"Sotheby’s Wine",'www.sothebyswine.com','marketplace',2,'/search?q={query}'],
 ['christies',"Christie’s Wine",'www.christies.com','auction',3,'/search?entry={query}'],
 ['hdh','Hart Davis Hart Wine Co.','www.hdhwine.com','marketplace',1,'/search?q={query}'],
 ['chicago','The Chicago Wine Company','www.tcwc.com','marketplace',2,'/search?q={query}'],
 ['cellarage','Wine Cellarage','winecellarage.com','retailer',1,'/search?q={query}'],
 ['grand-vin','Grand Vin Wine Merchants','grandvinwinemerchants.com','retailer',1,'/search.php?search_query={query}'],
 ['sokolin','Sokolin','www.sokolin.com','retailer',1,'/catalogsearch/result/?q={query}'],
 ['rare-wine','Rare Wine Co.','www.rarewineco.com','retailer',1,'/search/?q={query}'],
 ['european','European Wine Resource','www.europeanwineresource.com','retailer',1,'/search?q={query}'],
 ['italian','Italian Wine Merchants','www.italianwinemerchants.com','retailer',1,'/search?q={query}'],
 ['mission','Mission Wine & Spirits','www.missionliquor.com','retailer',3,'/search?q={query}'],
 ['pogos',"Pogo’s Wine & Spirits",'www.pogoswine.com','retailer',2,'/search?q={query}'],
 ['specs',"Spec’s Wine, Spirits & Finer Foods",'specsonline.com','retailer',3,'/?s={query}'],
 ['belmont','Belmont Wine Exchange','www.belmontwine.com','retailer',1,'/search?q={query}'],
 ['dandm','D&M Wines and Liquors','dandm.com','retailer',2,'/search.php?search_query={query}'],
 ['ledu',"Le Du’s Wines",'leduwines.com','retailer',1,'/search?q={query}&type=product'],
 ['verve','Verve Wine','vervewine.com','retailer',1,'/search?q={query}&type=product'],
];
export const RETAILERS=rows.map(([id,name,domain,classification,priority,searchPath])=>({id,name,domain,classification,priority,scope:'US',homepage:`https://${domain}/`,searchPath,method:'public-web',adapter:classification==='auction'?'historical-only':'structured-products',enabled:false,verifiedDomain:false,termsReviewed:false,termsURL:'',termsNote:'Unreviewed; not authorized for automatic collection.',priceVisibility:'Unknown',historicalAvailability:'Unknown; only explicitly dated observations accepted',status:'Unverified',restrictions:'Robots and terms must be checked; no login/CAPTCHA/paywall bypass.',lastAudit:null,lastSuccess:null,failures:[],minIntervalMs:5000,maxProducts:5}));
for(const source of RETAILERS){const a=AUDIT.find(a=>a.id===source.id);if(a)Object.assign(source,{verifiedDomain:a.verifiedDomain,lastAudit:a.at,status:a.status,priceVisibility:a.priceVisibility || 'Unknown',audit:a});}
Object.assign(RETAILERS.find(s=>s.id==='jj-buckley'),{adapter:'jj-buckley',termsReviewed:true,termsURL:'https://www.jjbuckley.com/privacy-policy',termsNote:'Public site policy reviewed; no automated retrieval prohibition found in accessible policy. Robots permits product URLs and sitemap discovery. Five-second minimum interval, bounded personal research only; any denied response pauses collection.',enabled:true,status:'Active',priceVisibility:'Explicit schema.org Offer and visible bottle-size fields validated',historicalAvailability:'Local dated observations; no externally recovered history'});
export function retailerSearchURL(source,wine) {
 const query=[wine.producer,wine.cuvee,wine.vintage,wine.bottleMl+'ml'].filter(Boolean).join(' ');
 return new URL(source.searchPath.replace('{query}',encodeURIComponent(query)),source.homepage).href;
}
export function ensureMarketResearch(state) {
 state.marketResearch ||= {schemaVersion:1,sources:structuredClone(RETAILERS),jobs:[],failures:[],cache:{},schedule:{enabled:false,frequency:'twice-daily',nextDue:null,maxWines:20,maxSources:5,concurrency:2},lastSuccess:null};
 return state.marketResearch;
}
