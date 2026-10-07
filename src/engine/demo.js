import { initialState, ingestDataset } from './ingestion.js';
// These are deliberately fictitious wines and prices, not current retailer inventory.
export function demoState(now = new Date().toISOString()) {
  let state = initialState();
  const categories = ['inventory', 'market', 'critic', 'vintage'];
  for (const category of categories) state.sources.push({ ...state.sources.find(s => s.category === category), id: `demo-${category}`, name: `Synthetic example ${category}`, category, isDemo: true, note: 'Synthetic demonstration only. Not live retailer or licensed critic data.' });
  const base = { producer: 'Example Estate', bottle_ml: 750, pack_count: 1, packaging: 'loose', currency: 'USD', region: 'Example Bordeaux', country: 'France', type: 'Red', price_terms: 'ex_tax' };
  const wines = [
    { ...base, raw_title: 'Example Estate Grand Vin 2019 750ml', cuvee: 'Grand Vin', vintage: 2019, price: 80, available_quantity: 8 },
    { ...base, raw_title: 'Example Estate Reserve 2020 750ml', cuvee: 'Reserve', vintage: 2020, price: 55, available_quantity: 3 },
    { ...base, raw_title: 'Example Estate Blanc 2022 750ml', cuvee: 'Blanc', vintage: 2022, type: 'White', region: 'Example Burgundy', price: 42, available_quantity: 12 },
    { ...base, raw_title: 'Example Estate Grand Vin 2019 1.5L', cuvee: 'Grand Vin', vintage: 2019, bottle_ml: 1500, price: 190, available_quantity: 2 },
  ];
  state = ingestDataset(state, 'demo-inventory', { rows: wines, completeSnapshot: true }, now);
  state = ingestDataset(state, 'demo-market', { rows: wines.slice(0, 3).flatMap((w, i) => [{ ...w, price: [120, 50, 65][i], merchant: 'Synthetic merchant A' }, { ...w, price: [130, 60, 70][i], merchant: 'Synthetic merchant B' }]) }, now);
  state = ingestDataset(state, 'demo-critic', { rows: wines.slice(0, 3).map((w, i) => ({ ...w, critic: 'Synthetic reviewer (not a real critic)', score: [96, 92, 94][i], scale: 100, drink_from: [2025, 2028, 2024][i], drink_to: [2040, 2042, 2030][i] })) }, now);
  state = ingestDataset(state, 'demo-vintage', { rows: [{ country:'France', region: 'Example Bordeaux', type: 'Red', vintage: 2019, score: 96, scale: 100 }, { country:'France', region: 'Example Bordeaux', type: 'Red', vintage: 2020, score: 94, scale: 100 }, { country:'France', region: 'Example Burgundy', type: 'White', vintage: 2022, score: 95, scale: 100 }] }, now);
  return state;
}
