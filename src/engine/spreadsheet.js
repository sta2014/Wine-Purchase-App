// Spreadsheet parsing is lazy-loaded; no workbook content leaves the browser.
import { parsePackageFormat } from './identity.js';
const aliases = {
  wine: 'raw_title', winename: 'raw_title', winedescription: 'raw_title', description: 'raw_title', productname: 'raw_title', name: 'raw_title', title: 'raw_title', rawtitle: 'raw_title',
  producer: 'producer', winery: 'producer', estate: 'producer', cuvee: 'cuvee', vineyard: 'vineyard', appellation: 'appellation', region: 'region', country: 'country',
  vintage: 'vintage', year: 'vintage', vintageyear: 'vintage', bottleml: 'bottle_ml', bottlesizeml: 'bottle_ml', sizeml: 'bottle_ml', size: 'format', bottlesize: 'format', format: 'format', packageformat: 'format', packagesize: 'format',
  packcount: 'pack_count', packsize: 'pack_count', bottlecount: 'pack_count', packaging: 'packaging', type: 'type', winetype: 'type', color: 'type', colour: 'type',
  price: 'price', askingprice: 'price', retailprice: 'price', unitprice: 'price', bottleprice: 'unit_price', priceperbottle: 'unit_price', currency: 'currency',
  quantity: 'available_quantity', qty: 'available_quantity', availablequantity: 'available_quantity', available: 'available_quantity', stock: 'available_quantity', instock: 'available_quantity',
  sku: 'external_id', itemnumber: 'external_id', itemno: 'external_id', itemid: 'external_id', productid: 'external_id', externalid: 'external_id',
  merchant: 'merchant', critic: 'critic', publication: 'critic', score: 'score', rating: 'score', scale: 'scale', scorescale: 'scale', drinkfrom: 'drink_from', drinkingstart: 'drink_from', drinkto: 'drink_to', drinkingend: 'drink_to',
  sourceurl: 'source_url', url: 'source_url', observedat: 'observed_at', confidence: 'confidence', notes: 'notes', priceterms: 'price_terms', pricebasis: 'price_basis', saletype: 'sale_type', classification: 'classification', designation: 'designation',
};
export const IMPORT_FIELDS = [...new Set(Object.values(aliases))];
export const IMPORT_LABELS = { raw_title: 'Wine name', producer: 'Producer / winery', cuvee: 'Wine / cuvée', vintage: 'Vintage year', bottle_ml: 'Bottle volume (ml)', format: 'Package format (e.g. 6x750ml or 1.5L)', pack_count: 'Bottles per package', type: 'Wine color / type', price: 'Asking price', unit_price: 'Price per individual bottle', available_quantity: 'Available packages', external_id: 'Retailer SKU / product ID', source_url: 'Source link', observed_at: 'Observation date / time', critic: 'Critic / publication', scale: 'Score scale', drink_from: 'Drinking window start year', drink_to: 'Drinking window end year' };
export function suggestColumns(header) {
  const used = new Set();
  return header.map(value => { const key = String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, ''); const field = aliases[key] || ''; if (used.has(field)) return ''; used.add(field); return field; });
}
export function suggestHeader(data) {
  let best = 0, score = -1;
  for (let i = 0; i < Math.min(25, data.length); i++) { const count = suggestColumns(data[i]).filter(Boolean).length; if (count > score) { score = count; best = i; } }
  return best;
}
export function mapSpreadsheet(data, headerRow, mapping, defaults = {}) {
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= data.length) throw new Error('Choose a valid header row.');
  const fields = mapping.filter(Boolean);
  if (new Set(fields).size !== fields.length || fields.some(f => !IMPORT_FIELDS.includes(f))) throw new Error('Map each field once, or ignore duplicate columns.');
  const rows = data.slice(headerRow + 1).filter(row => row.some(cell => cell != null && cell !== ''));
  if (!rows.length || rows.length > 10000) throw new Error('Choose a sheet with 1–10,000 data rows.');
  return rows.map((row, index) => {
    const item = {};
    mapping.forEach((field, col) => { if (field && row[col] != null && row[col] !== '') { const value = row[col]; if (value instanceof Date) item[field] = value.toISOString(); else if (['string', 'number', 'boolean'].includes(typeof value)) item[field] = value; else throw new Error(`Spreadsheet row ${headerRow + index + 2} contains an unsupported cell.`); } });
    const columnFormat = parsePackageFormat(item.format), titleFormat = parsePackageFormat(item.raw_title);
    for (const [key, value] of Object.entries(defaults)) {
      if (item[key] != null && item[key] !== '') continue;
      if (key === 'bottle_ml' && (columnFormat.bottleMl || titleFormat.bottleMl)) continue;
      if (key === 'pack_count' && (columnFormat.packCount || titleFormat.packCount)) continue;
      if (key === 'packaging' && /\bowc\b|original wooden case/i.test(`${item.raw_title || ''} ${item.format || ''}`)) continue;
      item[key] = value;
    }
    return item;
  });
}
// Bound decompressed ZIP size before opening an XLSX. Never execute formulas/macros.
export function checkWorkbook(buffer) {
  const view = new DataView(buffer); let end = -1;
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 65557); i--) if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('This is not a supported Excel .xlsx file. Save older .xls files as .xlsx or CSV in Excel.');
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  if (count > 500 || count === 0xffff || offset >= view.byteLength) throw new Error('Workbook is too large or uses an unsupported ZIP format.');
  let pos = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > view.byteLength || view.getUint32(pos, true) !== 0x02014b50) throw new Error('Workbook ZIP directory is invalid.');
    total += view.getUint32(pos + 24, true);
    if (total > 64 * 1024 * 1024) throw new Error('Workbook expands beyond the 64 MB limit.');
    pos += 46 + view.getUint16(pos + 28, true) + view.getUint16(pos + 30, true) + view.getUint16(pos + 32, true);
  }
}
export async function readWorkbook(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a workbook smaller than 10 MB.');
  checkWorkbook(await file.arrayBuffer());
  const { default: readExcel } = await import('read-excel-file/browser');
  const sheets = await readExcel(file);
  if (!sheets.length || sheets.length > 50 || sheets.some(s => s.data.length > 10025 || s.data.some(row => row.length > 200))) throw new Error('Workbook exceeds the supported sheet, row, or column limits.');
  return sheets;
}
