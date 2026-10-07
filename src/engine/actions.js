import { ingestDataset, captureScores, validateBackup } from './ingestion.js';
import { validateSource } from './sources.js';
import { validatePreferences } from './ranking.js';
import { matchWine } from './identity.js';
export function applyAction(state, action, now = new Date().toISOString()) {
  if (!action || typeof action !== 'object') throw new Error('Invalid engine action.');
  if (action.type === 'import') return ingestDataset(state, action.sourceId, action.dataset, now);
  if (action.type === 'restore') {
    const restored = validateBackup(action.state);
    // Imported backups cannot turn on unattended network retrieval.
    for (const source of restored.sources) source.accessApproved = false;
    restored.revision = state.revision + 1;
    return restored;
  }
  const next = structuredClone(state);
  if (action.type === 'source') {
    const old = next.sources.find(s => s.id === action.source.id);
    const source = validateSource({ ...(old ?? {}), ...action.source });
    if (old && old.category !== source.category && next.runs.some(r => r.sourceId === source.id)) throw new Error('Cannot change the category of a source with imported history. Create a new source.');
    if (old && (old.url !== source.url || old.authEnv !== source.authEnv || old.method !== source.method)) { source.etag = ''; source.lastModified = ''; source.nextDue = null; source.error = ''; }
    if (old) next.sources[next.sources.indexOf(old)] = source; else next.sources.push(source);
  } else if (action.type === 'preferences') next.preferences = validatePreferences(action.preferences);
  else if (action.type === 'decision') {
    const item = [...next.market, ...next.reviews].find(r => r.id === action.observationId);
    const wine = next.wines[action.wineId];
    if (!item || !wine || !['approved', 'rejected'].includes(action.decision)) throw new Error('Invalid match review.');
    const match = matchWine(wine, next.wines[item.wineId], { format: next.market.includes(item) });
    if (action.decision === 'approved' && !match.reviewable) throw new Error('Vintage, producer, or package conflicts cannot be overridden by match review.');
    next.decisions[item.id] = { wineId: wine.id, state: action.decision, at: now, confidence: match.confidence, note: String(action.note || 'Reviewed in terminal').slice(0, 1000) };
  } else throw new Error('Unknown engine action.');
  next.revision++;
  captureScores(next, now, action.type);
  return next;
}
