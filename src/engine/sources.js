import { VINTAGE_PROVIDERS } from './vintages.js';
export const CATEGORIES = ['inventory', 'critic', 'vintage'];
export const STATUSES = ['Active', 'Disabled', 'Error', 'Authentication Required', 'Manual Import', 'Unsupported / unavailable'];
const source = (id, name, category, method, enabled, note, homepage = '') => ({ id, name, category, method, enabled, note, homepage, url: '', accessApproved: false, authEnv: '', refreshHours: category === 'inventory' ? 6 : 720, status: enabled ? 'Manual Import' : 'Disabled', lastChecked: null, lastSuccess: null, nextDue: null, failures: 0, error: '', etag: '', lastModified: '' });
export function defaultSources() {
  return [
    source('flickinger', 'Flickinger Wines', 'inventory', 'manual', true, 'Import an authorized inventory export. No automated Flickinger retrieval permission or feed has been established.', 'https://www.flickingerwines.com/'),
    source('critic-import', 'Approved critic review imports', 'critic', 'manual', true, 'Import licensed/exported scores and windows with critic, scale, and provenance.'),
    source('vintage-import', 'Curated vintage assessments', 'vintage', 'manual', true, 'Documented region/type/vintage assessments; no generated vintage ratings.'),
    ...VINTAGE_PROVIDERS.filter(p=>p.id!=='regional').map(p=>source(`vintage-${p.id}`,`${p.name} vintage assessments`,'vintage',p.method,false,p.note,p.homepage)),
    ...[['wine-advocate', 'Robert Parker / Wine Advocate', 'critic'], ['vinous', 'Vinous', 'critic'], ['decanter', 'Decanter', 'critic'], ['spectator', 'Wine Spectator', 'critic'], ['suckling', 'James Suckling', 'critic'], ['jancis', 'Jancis Robinson', 'critic'], ['dunnuck', 'Jeb Dunnuck', 'critic'], ['enthusiast', 'Wine Enthusiast', 'critic'], ['burghound', 'Burghound / Allen Meadows', 'critic'], ['morris', 'Jasper Morris / Inside Burgundy', 'critic'], ['independent','The Wine Independent','critic']].map(([id, name, category]) => source(id, name, category, 'licensed', false, 'No access agreement or documented endpoint configured. Requires approved/manual/licensed ingestion; no scraping implemented.')),
  ];
}
export function sourceStatus(source, credentialsAvailable = false) {
  if (!source.enabled) return 'Disabled';
  if (source.method === 'manual') return 'Manual Import';
  if (source.method === 'licensed') return 'Authentication Required';
  if (!source.accessApproved || !source.url) return 'Unsupported / unavailable';
  if (source.authEnv && !credentialsAvailable) return 'Authentication Required';
  if (source.status === 'Authentication Required' && source.error) return 'Authentication Required';
  return source.error ? 'Error' : 'Active';
}
export function validateSource(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid source.');
  const s = { ...input };
  if (!/^[a-z0-9-]{1,60}$/.test(s.id)) throw new Error('Source ID must use lowercase letters, numbers, and hyphens.');
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 150) throw new Error('Source name is required (150 characters maximum).');
  if (!CATEGORIES.includes(s.category) || !['manual', 'json', 'licensed'].includes(s.method)) throw new Error('Invalid source category or connector method.');
  if (typeof s.enabled !== 'boolean' || typeof s.accessApproved !== 'boolean') throw new Error('Source enablement and approval must be booleans.');
  if (s.url) {
    const u = new URL(s.url);
    if (u.protocol !== 'https:' || u.username || u.password || [...u.searchParams.keys()].some(k => /token|secret|api.?key|signature/i.test(k))) throw new Error('Use an HTTPS endpoint without credentials or secret query parameters.');
  }
  if (s.authEnv && !/^[A-Z][A-Z0-9_]{1,79}$/.test(s.authEnv)) throw new Error('Credential binding must be an environment-variable name, never a token value.');
  if (!Number.isFinite(Number(s.refreshHours)) || Number(s.refreshHours) < 1 || Number(s.refreshHours) > 8760) throw new Error('Refresh interval must be 1–8760 hours.');
  s.refreshHours = Number(s.refreshHours);
  s.name = s.name.trim();
  s.status = sourceStatus(s);
  return s;
}

export function ensureVintageSources(state) {
  for(const s of defaultSources().filter(s=>s.category==='vintage')) if(!state.sources.some(existing=>existing.id===s.id)) state.sources.push(s);
  return state;
}
