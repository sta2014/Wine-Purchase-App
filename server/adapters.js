import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { parseDataset } from '../src/engine/ingestion.js';

export function isPublicAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0 && c === 113));
  }
  // Reject IPv4-mapped and local IPv6. Only globally routable 2000::/3 is allowed.
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0):|^2002:/i.test(ip);
}
export function credentialAvailable(source, env = process.env) {
  if (!source.authEnv) return true;
  let bindings; try { bindings = JSON.parse(env.WINE_SOURCE_CREDENTIAL_HOSTS || '{}'); } catch { return false; }
  return Boolean(env[source.authEnv] && Array.isArray(bindings[source.authEnv]) && bindings[source.authEnv].includes(new URL(source.url).hostname));
}
export async function approvedURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Feeds require public HTTPS endpoints on port 443.');
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error('Private, loopback, reserved, or ambiguous network destinations are not allowed.');
  return { url, addresses };
}
export async function requestText(value, headers = {}) {
  const { url, addresses } = await approvedURL(value);
  const agent = new https.Agent({ proxyEnv: process.env,
    lookup(hostname, options, callback) {
      if (hostname !== url.hostname) return import('node:dns').then(d => d.lookup(hostname, options, callback));
      const candidates = addresses.filter(a => !options.family || a.family === options.family);
      if (!candidates.length) return callback(new Error('No approved destination address.'));
      if (options.all) callback(null, candidates); else callback(null, candidates[0].address, candidates[0].family);
    },
  });
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'WineJournalBot/1.0', ...headers }, agent, timeout: 20000 }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.statusCode !== 304) { response.resume(); reject(new Error('Redirect refused; configure the approved final endpoint.')); return; }
      let bytes = 0; const chunks = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 10 * 1024 * 1024) response.destroy(new Error('Source response exceeds 10 MB.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => { agent.destroy(); resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }); });
    });
    req.on('timeout', () => req.destroy(new Error('Source timed out.')));
    req.on('error', error => { agent.destroy(); reject(error); });
  });
}
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
export class JSONFeedAdapter {
  constructor(request = requestText, parser = parseDataset) { this.parser=parser; this.request = request; this.robots = new Map(); this.lastRequest = new Map(); }
  async fetch(source, env = process.env, now = new Date()) {
    if (!source.enabled || source.method !== 'json' || !source.accessApproved) throw new Error('Source does not have approved automated access.');
    if (!credentialAvailable(source, env)) { const e = new Error('Server credential is missing or not bound to this approved destination.'); e.authRequired = true; throw e; }
    const url = new URL(source.url);
    let policy = this.robots.get(url.origin);
    if (!policy || +now - policy.at > 24 * 3600000) {
      const result = await this.request(url.origin + '/robots.txt');
      if (result.status !== 200 && result.status !== 404) throw new Error('Cannot establish robots policy; automated access paused.');
      policy = { text: result.status === 404 ? '' : result.text, at: +now };
      this.robots.set(url.origin, policy);
      this.lastRequest.set(url.origin, +now);
    }
    if (!robotsAllowed(policy.text, url.pathname + url.search)) throw new Error('robots.txt disallows this endpoint; use approved manual ingestion.');
    const due = (this.lastRequest.get(url.origin) ?? -Infinity) + robotsCrawlDelay(policy.text);
    if (+now < due) throw new Error('robots.txt crawl-delay requires waiting before the next request; refresh will retry after backoff.');
    const headers = {};
    if (source.etag) headers['If-None-Match'] = source.etag;
    if (source.lastModified) headers['If-Modified-Since'] = source.lastModified;
    if (source.authEnv) headers.Authorization = `Bearer ${env[source.authEnv]}`;
    this.lastRequest.set(url.origin, +now);
    const result = await this.request(source.url, headers);
    if (result.status === 401 || result.status === 403) { const e = new Error('Source authentication or authorization was rejected.'); e.authRequired = true; throw e; }
    if(result.status===429) { const error=new Error('Provider rate limit reached (HTTP 429); refresh deferred.');const wait=Number(result.headers['retry-after']);error.retryAfterMs=Number.isFinite(wait)?Math.min(7*86400000,Math.max(0,wait*1000)):Math.max(0,Math.min(7*86400000,Date.parse(result.headers['retry-after'])-+now)) || 3600000;throw error; }
    if (result.status !== 200 && result.status !== 304) throw new Error(`Source returned HTTP ${result.status}.`);
    return { notModified: result.status === 304, dataset: result.status === 304 ? null : this.parser(result.text,source,now), etag: result.headers.etag || source.etag, lastModified: result.headers['last-modified'] || source.lastModified };
  }
  fetchInventory(...args) { return this.fetch(...args); }
  fetchMarketPrices(...args) { return this.fetch(...args); }
  fetchCriticReviews(...args) { return this.fetch(...args); }
  fetchVintageInformation(...args) { return this.fetch(...args); }
  fetchWineDetails(...args) { return this.fetch(...args); }
}
