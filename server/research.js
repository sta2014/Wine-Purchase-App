import { requestText } from './adapters.js';
import { wineSearchQuery } from '../src/engine/research.js';

// Documented Brave web-search API. Credentials go only to this fixed HTTPS host.
// No retailer pages are scraped and no search snippet becomes a market quote.
export class WebResearchService {
  constructor({ request = requestText, env = process.env, clock = () => Date.now() } = {}) {
    this.request = request; this.env = env; this.clock = clock;
    this.cache = new Map(); this.pending = new Map(); this.nextRequest = 0;
  }
  async search(wine) {
    const query = wineSearchQuery(wine), now = this.clock();
    const key = this.env.BRAVE_SEARCH_API_KEY;
    if (!key) return { status: 'configuration-required', query, results: [], message: 'Automatic web research needs a server-side search API key. Browser search links work without one.' };
    const cached = this.cache.get(query);
    if (cached && now - cached.at < 6 * 3600000) return { ...cached.result, cached: true };
    if (this.pending.has(query)) return this.pending.get(query);
    if (now < this.nextRequest) throw new Error('Search limit reached. Wait a few seconds before researching another wine.');
    this.nextRequest = now + 3000;
    const work = this.fetch(query, key).then(result => {
      this.cache.set(query, { at: this.clock(), result });
      if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
      return result;
    }).finally(() => this.pending.delete(query));
    this.pending.set(query, work); return work;
  }
  async fetch(query, key) {
    const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q', query); endpoint.searchParams.set('count', '10');
    let response;
    try { response = await this.request(endpoint.href, { Accept: 'application/json', 'X-Subscription-Token': key }); }
    catch { throw new Error('Search provider could not be reached. Check server network access; no prices were changed.'); }
    if (response.status !== 200) throw new Error(response.status === 401 || response.status === 403 ? 'Search API access was denied. Check the server API key and account access.' : response.status === 429 ? 'Search provider quota reached. Try later or check your search plan.' : `Search provider unavailable (HTTP ${response.status}).`);
    let data; try { data = JSON.parse(response.text); } catch { throw new Error('Search provider returned an invalid response.'); }
    if (!data.web || !Array.isArray(data.web.results)) throw new Error('Search provider returned no valid web result list.');
    const seen = new Set(), results = [];
    for (const item of data.web.results.slice(0, 20)) {
      if (!item || typeof item !== 'object') continue;
      let url; try { url = new URL(item.url); } catch { continue; }
      if (url.protocol !== 'https:' || url.username || url.password || /(^|\.)wine-searcher\.com$/i.test(url.hostname) || seen.has(url.href)) continue;
      seen.add(url.href);
      results.push({ title: String(item.title || url.hostname).slice(0, 500), url: url.href, description: String(item.description || '').slice(0, 2000), merchantHost: url.hostname, verification: 'unverified' });
      if (results.length === 10) break;
    }
    return { status: 'ok', provider: 'Brave Search', query, retrievedAt: new Date(this.clock()).toISOString(), cached: false, results, message: 'Search leads only. Verify current price, availability, vintage, format, currency, and tax/shipping terms before importing a market observation.' };
  }
}
