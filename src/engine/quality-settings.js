export const QUALITY_WEIGHTS = {quality:60,vintage:25,consensus:15};
export const FACTOR_LABELS = {quality:'Professional critic scores',vintage:'Regional vintage quality',consensus:'Critic consensus and confidence'};
export function migrateQuality(state) {
  if(!state || !Array.isArray(state.sources) || !Array.isArray(state.reviews) || !Array.isArray(state.runs) || !Array.isArray(state.scoreHistory) || !state.decisions)throw new Error('Choose a valid intelligence-engine backup.');
  if(state.qualityModelVersion===2)return state;
  const old=state.preferences?.weights || {};
  state.preferences ||= {};
  state.preferences.weights=Object.keys(QUALITY_WEIGHTS).every(k=>Number.isFinite(old[k])) && old.value==null ? {quality:old.quality+(old.community || 0),vintage:old.vintage,consensus:old.consensus} : {...QUALITY_WEIGHTS};
  delete state.preferences.communityPriorCount;delete state.preferences.communityAdequateCount;
  state.reviews=state.reviews.filter(r=>r.kind!=='community');
  for(const k of Object.keys(state.preferences))if(/^market|^baseCurrency/.test(k))delete state.preferences[k];
  state.sources=state.sources.filter(s=>!['market','community'].includes(s.category));
  for(const k of ['market','marketResearch','marketControls','marketCorrections','merchantReliability','pricingSync'])delete state[k];
  state.runs=state.runs.filter(r=>!['market','community'].some(k=>String(r.category || '').includes(k)));for(const r of state.runs)delete r.marketResearch;
  state.scoreHistory=state.scoreHistory.filter(r=>r.algorithmVersion===6);
  const ids=new Set(state.reviews.map(r=>r.id));state.decisions=Object.fromEntries(Object.entries(state.decisions).filter(([id])=>ids.has(id)));
  state.qualityModelVersion=2;
  return state;
}
