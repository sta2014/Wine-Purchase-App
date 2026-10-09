function robotsGroups(text) {
  const groups = []; let group = null, sawRule = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const index = clean.indexOf(':'); if (index < 0) continue;
    const key = clean.slice(0, index).toLowerCase(), value = clean.slice(index + 1).trim();
    if (key === 'user-agent') { if (!group || sawRule) { group = { agents: [], rules: [] }; groups.push(group); sawRule = false; } group.agents.push(value.toLowerCase()); }
    else if (group && ['allow', 'disallow', 'crawl-delay'].includes(key)) { group.rules.push({ key, value }); sawRule = true; }
  }
  const bot = groups.filter(g => g.agents.some(a => a !== '*' && 'winejournalbot'.includes(a)));
  return bot.length ? bot : groups.filter(g => g.agents.includes('*'));
}
export function robotsCrawlDelay(text) {
  const values = robotsGroups(text).flatMap(g => g.rules).filter(r => r.key === 'crawl-delay').map(r => Number(r.value)).filter(v => Number.isFinite(v) && v >= 0);
  return values.length ? Math.max(...values) * 1000 : 0;
}
export function robotsAllowed(text, path) {
  const selected = robotsGroups(text);
  let best = null;
  for (const rule of selected.flatMap(g => g.rules)) {
    if (!rule.value || rule.key === 'crawl-delay') continue;
    const pattern = '^' + rule.value.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp(pattern).test(path) && (!best || rule.value.length > best.value.length || (rule.value.length === best.value.length && rule.key === 'allow'))) best = rule;
  }
  return !best || best.key === 'allow';
}
