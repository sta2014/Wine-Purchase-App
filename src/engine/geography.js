// Geography is descriptive metadata: it never rewrites existing wine/offer IDs.
export const geoKey = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\bst\.?\b/g,'saint').replace(/\bdocg?\b/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const rows = [
  ['france','France',null,'country',['FR']], ['italy','Italy',null,'country',['Italia']], ['usa','United States',null,'country',['USA','US','United States of America']],
  ['germany','Germany',null,'country',['Deutschland']], ['spain','Spain',null,'country',['Espana']], ['portugal','Portugal',null,'country',[]], ['australia','Australia',null,'country',[]], ['nz','New Zealand',null,'country',[]], ['south-africa','South Africa',null,'country',[]],
  ['bordeaux','Bordeaux','france','region',[]], ['left-bank','Left Bank Bordeaux','bordeaux','subregion',['Left Bank','Bordeaux Left Bank']],
  ['medoc','Médoc','left-bank','subregion',[]], ['haut-medoc','Haut-Médoc','medoc','appellation',[],'Red'], ['pauillac','Pauillac','medoc','appellation',[],'Red'], ['margaux','Margaux','medoc','appellation',[],'Red'], ['saint-julien','Saint-Julien','medoc','appellation',[],'Red'], ['saint-estephe','Saint-Estèphe','medoc','appellation',[],'Red'],
  ['graves','Graves','left-bank','subregion',[]], ['pessac','Pessac-Léognan','graves','appellation',[]],
  ['right-bank','Right Bank Bordeaux','bordeaux','subregion',['Right Bank','Bordeaux Right Bank','Libournais']], ['saint-emilion','Saint-Émilion','right-bank','appellation',[],'Red'], ['pomerol','Pomerol','right-bank','appellation',[],'Red'],
  ['sauternes','Sauternes','bordeaux','appellation',[],'Sweet'], ['barsac','Barsac','bordeaux','appellation',[],'Sweet'],
  ['burgundy','Burgundy','france','region',['Bourgogne']], ['nuits','Côte de Nuits','burgundy','subregion',[]], ['cote-beaune','Côte de Beaune','burgundy','subregion',[]],
  ['chablis','Chablis','burgundy','appellation',[],'White'], ['petit-chablis','Petit Chablis','burgundy','appellation',[],'White'],
  ...['Vosne-Romanée','Gevrey-Chambertin','Chambolle-Musigny','Nuits-Saint-Georges','Morey-Saint-Denis','Vougeot','Flagey-Échezeaux'].map(n=>[geoKey(n).replaceAll(' ','-'),n,'nuits','appellation',[], n==='Vougeot' ? null : 'Red']),
  ...['Meursault','Puligny-Montrachet','Chassagne-Montrachet','Beaune','Pommard','Volnay','Aloxe-Corton','Savigny-lès-Beaune','Saint-Aubin'].map(n=>[geoKey(n).replaceAll(' ','-'),n,'cote-beaune','appellation',[], ['Meursault','Puligny-Montrachet'].includes(n)?'White':['Pommard','Volnay'].includes(n)?'Red':null]),
  ['maconnais','Mâconnais','burgundy','subregion',[]], ['pouilly-fuisse','Pouilly-Fuissé','maconnais','appellation',[],'White'],
  ...['Montrachet','Chevalier-Montrachet','Bâtard-Montrachet','Bienvenues-Bâtard-Montrachet','Corton-Charlemagne'].map(n=>[geoKey(n).replaceAll(' ','-'),n,'cote-beaune','appellation',[],'White']),
  ...['Chambertin','Griotte-Chambertin','Clos de Vougeot','Échezeaux','Grands-Échezeaux','Richebourg','Romanée-Conti','Romanée-Saint-Vivant','Clos de la Roche','Clos Saint-Denis'].map(n=>[geoKey(n).replaceAll(' ','-'),n,'nuits','appellation',[],'Red']),
  ['rhone','Rhône','france','region',['Rhone Valley']], ['north-rhone','Northern Rhône','rhone','subregion',['North Rhone']], ['south-rhone','Southern Rhône','rhone','subregion',['South Rhone']],
  ['cote-rotie','Côte-Rôtie','north-rhone','appellation',[],'Red'], ['hermitage','Hermitage','north-rhone','appellation',[]], ['crozes','Crozes-Hermitage','north-rhone','appellation',[]], ['saint-joseph','Saint-Joseph','north-rhone','appellation',[]], ['cornas','Cornas','north-rhone','appellation',[],'Red'], ['condrieu','Condrieu','north-rhone','appellation',[],'White'],
  ['cdp','Châteauneuf-du-Pape','south-rhone','appellation',['CdP']], ['gigondas','Gigondas','south-rhone','appellation',[],'Red'], ['vacqueyras','Vacqueyras','south-rhone','appellation',[]], ['cotes-rhone','Côtes du Rhône','rhone','appellation',[]],
  ['champagne','Champagne','france','region',[],'Sparkling'], ['loire','Loire','france','region',['Loire Valley']], ['alsace','Alsace','france','region',[]], ['jura','Jura','france','region',[]],
  ['piedmont','Piedmont','italy','region',['Piemonte']], ['langhe','Langhe','piedmont','subregion',[]], ['barolo','Barolo','langhe','appellation',[],'Red'], ['barbaresco','Barbaresco','langhe','appellation',[],'Red'],
  ['tuscany','Tuscany','italy','region',['Toscana']], ['montalcino','Montalcino','tuscany','subregion',[]], ['brunello','Brunello di Montalcino','montalcino','appellation',['Brunello'],'Red'], ['rosso-montalcino','Rosso di Montalcino','montalcino','appellation',[],'Red'], ['chianti-classico','Chianti Classico','tuscany','appellation',[],'Red'], ['bolgheri','Bolgheri','tuscany','appellation',[]],
  ['veneto','Veneto','italy','region',[]], ['amarone','Amarone della Valpolicella','veneto','appellation',['Amarone'],'Red'], ['sicily','Sicily','italy','region',['Sicilia']], ['etna','Etna','sicily','appellation',[]],
  ['california','California','usa','region',['California / USA']], ['napa','Napa Valley','california','subregion',['Napa']],
  ...['Rutherford','Oakville','Stags Leap District','Howell Mountain','Spring Mountain District','Mount Veeder','Diamond Mountain District'].map(n=>[geoKey(n).replaceAll(' ','-'),n,'napa','appellation',[]]),
  ['sonoma','Sonoma','california','subregion',['Sonoma County']], ['oregon','Oregon','usa','region',[]], ['washington','Washington','usa','region',['Washington State']],
  ...['Mosel','Rheingau','Rheinhessen','Pfalz','Nahe','Baden'].map(n=>[geoKey(n),n,'germany','region',[]]),
  ['rioja','Rioja','spain','region',[]], ['ribera','Ribera del Duero','spain','region',[]], ['douro','Douro','portugal','region',[]], ['barossa','Barossa Valley','australia','region',[]],
];
export const GEOGRAPHY = Object.fromEntries(rows.map(([id,name,parent,level,aliases,defaultType])=>[id,{id,name,parent,level,aliases,defaultType}]));
const aliases = new Map(rows.flatMap(([id,name,,,a])=>[name,...a].map(v=>[geoKey(v),id])));
export function geographyNode(value) { return GEOGRAPHY[aliases.get(geoKey(value))]; }
export function geographyPath(node) { const result=[],seen=new Set(); while(node) { if(seen.has(node.id)) throw new Error('Invalid geographic hierarchy cycle.'); seen.add(node.id); result.unshift(node); node=GEOGRAPHY[node.parent]; } return result; }
const titleAliases=rows.map(([id,name,,,a])=>({id,phrases:[name,...a].filter(n=>n.length>3 || geoKey(n)==='cdp').map(geoKey)}));
const contains = (text, phrase) => (` ${geoKey(text)} `).includes(` ${geoKey(phrase)} `);
export function canonicalType(value) {
  const key=geoKey(value);
  return ({red:'Red',rouge:'Red',white:'White',blanc:'White',rose:'Rosé',rosato:'Rosé',sparkling:'Sparkling',champagne:'Sparkling',sweet:'Sweet',dessert:'Sweet',fortified:'Fortified',unknown:'Unknown','dry white':'White','red burgundy':'Red','white burgundy':'White','red bordeaux':'Red','sweet bordeaux':'Sweet'})[key] || (key ? String(value) : 'Unknown');
}
export function canonicalGeography(input, { inferTitle = true } = {}) {
  const raw=Object.fromEntries(['country','region','subregion','appellation','vineyard'].map(k=>[k,String(input[k] || '')]));
  const explicit=['country','region','subregion','appellation'].map(k=>({field:k,node:geographyNode(raw[k])})).filter(x=>x.node);
  let candidates=explicit.map(x=>x.node), warnings=[];
  if (inferTitle) {
    const text=input.rawTitle || input.raw_title || '';
    const titleKey=` ${geoKey(text)} `;
    const inferred=titleAliases.filter(({phrases})=>phrases.some(p=>titleKey.includes(` ${p} `))).map(({id})=>GEOGRAPHY[id]);
    // A longer appellation wins over a contained name: Crozes-Hermitage is not Hermitage.
    const specific=inferred.filter(n=>!inferred.some(other=>other.id!==n.id && contains(other.name,n.name) && other.name.length>n.name.length));
    candidates.push(...specific);
  }
  const compatible = (a,b) => geographyPath(a).some(n=>n.id===b.id) || geographyPath(b).some(n=>n.id===a.id);
  if (candidates.some((a,i)=>candidates.slice(i+1).some(b=>!compatible(a,b)))) warnings.push('Conflicting geographic fields or appellations; review mapping.');
  candidates.sort((a,b)=>geographyPath(b).length-geographyPath(a).length);
  const leaf=candidates[0];
  let path=leaf ? geographyPath(leaf) : [];
  if (leaf?.level==='country' && raw.region && !geographyNode(raw.region)) path.push({id:`custom:${geoKey(path[0].name)}:${geoKey(raw.region)}`,name:raw.region,level:'region'});
  // Unrecognized regions are only usable as exact, country-scoped custom geography.
  if (!leaf && raw.region) path=[...(raw.country?[{id:`custom-country:${geoKey(raw.country)}`,name:raw.country,level:'country'}]:[]),{id:`custom:${geoKey(raw.country)}:${geoKey(raw.region)}`,name:raw.region,level:'region'}];
  for (const {field,node} of explicit) if (field==='country' && path[0]?.id!==node.id) warnings.push('Country conflicts with geographic hierarchy.');
  for (const field of ['country','region','subregion','appellation']) if (raw[field] && !geographyNode(raw[field])) {
    if (field==='country' && path[0]?.level==='country' && geoKey(raw[field])!==geoKey(path[0].name)) warnings.push('Unrecognized country conflicts with geography.');
    if (field==='region' && leaf && !path.some(n=>geoKey(n.name)===geoKey(raw.region))) warnings.push('Unrecognized supplied region requires review.');
    if (['subregion','appellation'].includes(field)) warnings.push(`Unrecognized ${field}; no automatic specificity inferred from it.`);
  }
  if(raw.vineyard && path.at(-1)?.level==='appellation') path.push({id:`vineyard:${path.at(-1).id}:${geoKey(raw.vineyard)}`,name:raw.vineyard,level:'vineyard'});
  const explicitType=canonicalType(input.type), title=input.rawTitle || input.raw_title || '';
  const titleType=/\b(blanc|white|chardonnay|riesling|sauvignon blanc)\b/i.test(title)?'White':/\b(rouge|red|cabernet(?: sauvignon)?|pinot noir)\b/i.test(title)?'Red':null;
  const type=explicitType!=='Unknown' && !['All','Any','all','any'].includes(explicitType)?explicitType:titleType || leaf?.defaultType || 'Unknown';
  const style=geoKey(input.style || (/\bcabernet(?: sauvignon)?\b/i.test(title)?'Cabernet Sauvignon':/\briesling\b/i.test(title)?'Riesling':''));
  const country=path.find(n=>n.level==='country')?.name || raw.country;
  const region=path.find(n=>n.level==='region')?.name || raw.region;
  const subregion=path.filter(n=>n.level==='subregion').at(-1)?.name || raw.subregion;
  const appellation=path.find(n=>n.level==='appellation')?.name || raw.appellation;
  return {raw,country,region,subregion,appellation,vineyard:raw.vineyard,path,leafId:path.at(-1)?.id || '',level:path.at(-1)?.level || 'unknown',type,style,warnings,conflict:warnings.some(w=>/conflict|requires review/.test(w)),typeBasis:explicitType!=='Unknown'?'Imported wine type':titleType?'Explicit style in title':leaf?.defaultType?'Appellation convention':'Unknown'};
}
