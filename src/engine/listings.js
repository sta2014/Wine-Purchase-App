// Wine identity is shared; inventory offers need their own identity.
// Price/quantity can change, so neither belongs in a generated listing ID.
const signature = r => JSON.stringify([r.wineId, r.currency, r.priceTerms, r.saleType, r.sourceURL, r.merchant]);
const observation = r => JSON.stringify([r.price, r.availableQuantity, r.isAvailable]);
export function identifyListings(items, source, existing) {
  const groups = new Map(), result = new Array(items.length), assigned = new Set();
  items.forEach((item, index) => {
    const base = `${source.id}:${item.externalId || item.wineId}`;
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push({ item, index });
  });
  const reserved = new Set(groups.keys());
  const priorGroups = new Map();
  for (const listing of existing.filter(r => r.sourceId === source.id)) {
    const base = listing.identityBase || listing.id;
    if (!priorGroups.has(base)) priorGroups.set(base, []);
    priorGroups.get(base).push(listing);
  }
  for (const [base, rows] of groups) {
    const prior = priorGroups.get(base) || [];
    const repeated = rows.length > 1 || prior.some(p => p.listingIdentity === 'inferred-offer');
    if (!repeated) {
      const { item, index } = rows[0];
      result[index] = { ...item, id: base, identityBase: base, listingIdentity: item.externalId ? 'source-id' : 'canonical-wine' };
      assigned.add(base); continue;
    }
    const bySignature = new Map();
    for (const row of rows) {
      const key = signature(row.item);
      if (!bySignature.has(key)) bySignature.set(key, []);
      bySignature.get(key).push(row);
    }
    const baseOwner = prior.find(p => p.id === base);
    const owner = baseOwner ? signature(baseOwner) : [...bySignature.keys()].sort()[0];
    for (const [key, candidates] of bySignature) {
      const available = prior.filter(p => signature(p) === key && (!reserved.has(p.id) || p.id === base));
      const matched = new Map();
      // Reordered unchanged rows keep their IDs before changed rows are assigned.
      for (const row of candidates) {
        const index = available.findIndex(p => observation(p) === observation(row.item));
        if (index >= 0) matched.set(row.index, available.splice(index, 1)[0].id);
      }
      for (const row of candidates) if (!matched.has(row.index) && available.length) matched.set(row.index, available.shift().id);
      const matchedIds = new Set(matched.values()); let slot = 1;
      for (const { item, index } of candidates) {
        let id = matched.get(index);
        if (!id) {
          do { id = key === owner && slot === 1 ? base : `${base}:offer:${encodeURIComponent(key)}:${slot}`; slot++; }
          while (assigned.has(id) || matchedIds.has(id) || (reserved.has(id) && id !== base));
        }
        assigned.add(id);
        result[index] = { ...item, id, identityBase: base, listingIdentity: 'inferred-offer', warnings: [...item.warnings, 'Repeated wine or retailer ID: this row is retained as a separate offer with an inferred listing ID. Confirm that repeated quantities represent separate stock. Lot-level history is uncertain without unique retailer lot IDs, especially when several offers change together.'] };
      }
    }
  }
  return result;
}
