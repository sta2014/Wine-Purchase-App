// Search discovers candidates; it never supplies verified market observations.
export function wineSearchQuery(wine) {
  const identity = ([wine.producer, wine.cuvee, wine.vineyard, wine.appellation].filter(Boolean).join(' ') || wine.rawTitle || '').replace(/\s+/g, ' ').trim().slice(0, 250);
  return [identity, wine.vintage || '', `${wine.bottleMl}ml`, wine.packCount > 1 ? `${wine.packCount} bottles` : '', wine.packaging === 'owc' ? 'original wooden case' : '', 'wine buy price', '-site:wine-searcher.com'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
export function browserSearchLinks(query) {
  return [
    { name: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
    { name: 'Bing', url: `https://www.bing.com/search?q=${encodeURIComponent(query)}` },
  ];
}
