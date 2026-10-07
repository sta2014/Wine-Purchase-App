# Data and connector contracts

## Imports and canonical identity

Excel (.xlsx) imports read multiple worksheets locally, detect a likely header, and require a column-mapping preview before ingestion. Headers, last data row, price/package basis, and missing-column defaults can be adjusted. File limit is 10 MB, decompressed ZIP limit 64 MB, at most 50 sheets, 10,000 data rows, and 200 columns. Formulas and macros are never executed. Older .xls is rejected with Save As instructions. The private reference Flickinger workbook is tested end to end: 8,648 listings and 4,346 retailer-reported critic facts; its blank fourth header is mapped to wine names.

JSON accepts a row array or `{ "rows": [...], "completeSnapshot": true }`. CSV requires unique headers and data rows. All rows validate before committing. A complete inventory snapshot retires missing listings; partial imports preserve them. Empty inventory needs an explicitly complete JSON snapshot. Stable unique `external_id`/SKU values identify separate offers for the same wine.

Repeated retailer IDs and repeated wines without IDs are accepted as separate inventory offers, retaining each row's package price and quantity. Unique existing listing IDs remain unchanged. Automatic offer IDs use wine/package identity, currency, sale/tax basis, URL, merchant, and an occurrence slot; changing price/quantity does not create a new ID. Reimport matches unchanged observations before assigning changed offers, preserving IDs when unchanged rows are reordered. No quantities are summed and no identical rows are silently removed. Inferred IDs, raw retailer IDs and their base group are persisted. Import notices and Explain warn that quantities need confirmation and lot-level history is uncertain without unique source lot IDs, particularly when several indistinguishable offers change together. Complete snapshots retire missing offer IDs; partial imports preserve absent offers.

Identity fields: `raw_title`, `producer`, `cuvee`, `vineyard`, `appellation`, `region`, `country`, `vintage`, `bottle_ml`, `pack_count`, `packaging`, `type`, `classification`, `designation`. Packaging is `loose`, `carton`, or `owc`. Canonical IDs encode producer/cuvée/vineyard/appellation/vintage/classification/designation plus bottle volume, count, and packaging. Accents, punctuation, abbreviations, curated aliases, vintage, bottle size, and packs normalize deterministically. Raw titles and structured fields remain available. Sparse enrichment never erases existing inventory metadata.

Market matching requires an identified producer, matching vintage and cuvée identity, verified volume, identical bottle volume and packaging (loose-bottle pack counts can normalize; original-case counts must match), no known identity conflicts, and adequate confidence. Automatic threshold defaults to 0.95. Exact canonical matches score 1.0; fuzzy candidates score 0.94 or 0.76 and require review. Hard conflicts cannot be approved. Professional reviews/windows apply to the beverage independently of package size, while rejecting known type/identity conflicts. False matches take precedence over completeness.

Every observation retains source ID/name, URL/reference when supplied, retrieval/observation timestamps, raw title, confidence, parsing warnings, and wine ID when applicable. Missing timestamps default to import time; invalid/materially future dates fail. Inventory history, external observations, runs, match decisions, and opportunity snapshots remain separate. Opportunity snapshots retain weights and algorithm version. Preferences never rewrite past snapshots.

Wine imports accept `NV`, `N.V.`, and `non-vintage` as non-vintage, and `MV`, `M.V.`, and `multi-vintage` as multi-vintage. Both are valid, separately labeled wine identities with a null year. Other values outside 1800 through next calendar year, zero placeholders, and malformed years are retained as unknown rather than blocking inventory import. `rawVintage` preserves the displayed value, `vintageKind` distinguishes year/non-vintage/multi-vintage/unknown, and warnings identify unresolved values. Canonical IDs keep distinct unresolved values separate; valid existing wine IDs are unchanged. Unknown/non-vintage/multi-vintage wines cannot automatically match year-specific market quotes or critic reviews. Import notices report unresolved vintage counts; each wine's Explain view retains the warning. Regional vintage assessments still require a valid year. Other invalid fields continue to reject imports atomically.

## Category fields

Each listing format describes **one purchasable package**. Physical bottles and equivalent standard 750ml bottles are separate measures:

| Format | Physical bottles in one package | Volume per physical bottle | 750ml equivalents per package |
| --- | --- | --- | --- |
| 6x750ml | 6 | 750ml | 6 |
| 3x750ml | 3 | 750ml | 3 |
| 1.5L / magnum | 1 | 1500ml | 2 |
| 3.0L / double magnum | 1 | 3000ml | 4 |

The importer reads these formats from the wine title or a mapped package-format column, with `x` or `×`, mixed capitalization, and spaces. Detected counts/volumes take priority over Excel defaults. Contradictory explicit fields are flagged and excluded from automatic price matching. Available quantity counts packages; it is not forced to one. Package price is the default asking-price basis. A generic Excel “Unit Price” heading maps to the package asking price; only an explicit per-bottle column or selected per-bottle price basis opts into physical-bottle pricing. Results display package prices, prices per physical bottle, and normalized prices per 750ml equivalent. A magnum's equivalent volume never changes its physical bottle count or makes it the same market product as two loose standard bottles.

| Category | Additional fields |
| --- | --- |
| Inventory | `price`, `price_basis`, `currency`, `available_quantity`, `is_available`, `external_id`, `price_terms`, `source_url`, `observed_at` |
| Market | Inventory price/format fields plus `merchant`, `sale_type`, `confidence` |
| Critic | `critic`/`publication`, `score`, `scale`, paired `drink_from`/`drink_to`, `notes`, provenance |
| Community | Review fields, stored separately from professional scores |
| Vintage | `region`, `type`, `vintage`, `score`, `scale`, `notes`, provenance; no wine ID required |

Prices must be positive; quantities are nonnegative integer **packages**, unknown if absent. `price_basis` defaults to `package`; `bottle` is explicit. Unit price = package price / pack count; normalized per-750ml = unit price × 750 / bottle_ml. Normalization does not make different formats tradable equivalents. Currency defaults to USD; other supported currencies are preserved without guessed FX.

Tax/shipping bases are `unspecified`, `ex_tax`, `tax_included`, `landed`. Different tax bases/currencies cannot compare without documented tax normalization and a fresh traceable FX rate; originals are preserved. Two unspecified bases allow an indicative comparison with an explicit warning, not an executable arbitrage claim. `sale_type=auction` observations are recorded but excluded from retail price comparison until a fee model exists.

Review scores may be numbers or ranges such as `94-96`. The lower bound drives scoring; the original scale/range stays recorded. Scores normalize arithmetically to /100, not a calibrated equivalence between critics. Scale defaults to 100. Reviews need a score or an ordered paired drinking window. Community scores do not enter professional quality. Vintage assessments require the same region, year, and type; none are generated from missing evidence.

## Opportunity algorithm v4

Market offers require explicit confirmed stock, last verification, stock evidence, eligible merchant reliability, exact beverage/bottle format, original packaging, freshness and provenance. Legacy assumed-available quotes remain stored but cannot drive current market values. Median and lowest use one lowest current offer per merchant after URL deduplication and robust outlier exclusion. A newer unavailable observation suppresses an older in-stock report across feeds. Default scope is US merchants, USD; unknown merchant location does not satisfy US scope. See [MARKET_INTELLIGENCE.md](MARKET_INTELLIGENCE.md) for the contract and complete method.

| Component | Value /100 | Default weight |
| --- | --- | --- |
| Value | Piecewise current discount component multiplied by market confidence | 35 |
| Quality | Publication-balanced professional composite through central quality anchors | 35 |
| Vintage | Contextual professional assessment through central vintage anchors | 10 |
| Window | 100 inside a supplied professional window, 0 outside, 50 when windows disagree | 10 |
| Confidence | Current market confidence × 100 | 10 |

Score = sum(component × weight / total weights), capped at 100. Missing critic/vintage components use neutral 50 with zero evidence coverage; other missing signals contribute zero. Missing market price remains null, never $0. Preferred regions add at most 5 × coverage points, disclosed separately. Stale inventory scores zero. Filters assign ranks within the selected subset without changing absolute component scores. Every opportunity snapshot preserves weights, algorithm version, critic/vintage evidence and accepted market offer prices/verification times. Historical snapshots are not rewritten. This is a purchasing comparison, not an investment-return forecast or guaranteed executable resale arbitrage.

## Source access

| Source | Initial state | Implemented access |
| --- | --- | --- |
| Flickinger Wines | Enabled / Manual Import | Authorized CSV/JSON export; approved feed not established |
| Market/critic/community/vintage import sources | Enabled / Manual Import | User-supplied permitted exports |
| Wine-Searcher | Disabled | Manual/licensed configuration; no automatic site retrieval |
| Wine Advocate, Vinous, Decanter, Wine Spectator, James Suckling, Jancis Robinson | Disabled | Manual/licensed configuration; no automatic site retrieval |
| CellarTracker | Disabled | Manual/licensed configuration; no automatic site retrieval |
| Custom approved feed | Configurable | Public HTTPS structured feed/API, explicit permission, optional host-bound Bearer credentials |

Connectors expose `fetchInventory`, `fetchMarketPrices`, `fetchCriticReviews`, `fetchVintageInformation`, and `fetchWineDetails`. The generic structured-feed adapter implements these against a configured endpoint returning the category schema. Sources refresh independently and enrichment joins by canonical identity. No undocumented named-source API is assumed.

Automatic access requires confirmed terms/permission and an approved public HTTPS endpoint. The server caches robots.txt for 24 hours, applies longest-path allow/disallow and bot-specific rules, and defers requests that violate crawl-delay. Robots 404 does not replace terms approval. Other policy failures pause access. Requests have verified TLS, a 20-second timeout, 10MB cap, public DNS/address checks, no redirects, conditional headers, and destination-bound credentials. No credentials go to robots requests. Failures preserve prior data and distinguish authentication from retrieval errors. No paywall, login, CAPTCHA, or anti-bot bypass exists.

Statuses: Active, Disabled, Error, Authentication Required, Manual Import, Unsupported / unavailable. Active means approved/configured, not that a subscription has been purchased. Source cards disclose last success, next due, and failures. Browser/manual mode cannot run connectors; a connected server can.

## API and persistence

Routes: `GET /api/health`, `GET /api/engine`, `POST /api/action`, `POST /api/refresh`. Actions: import, source, preferences, decision, restore. Writes require `expectedRevision`; stale clients receive HTTP 409. Refreshes serialize. Remote access requires `ENGINE_ACCESS_TOKEN` and exact allowed origins; public binding without a token is refused. Credential values never appear in engine responses. Remote connections require HTTPS hosting.

SQLite WAL/transactions persist tables for wines, current inventory, market observations, critic reviews, vintage assessments, inventory history, opportunity history, runs, and versioned settings. Current inventory updates do not remove observations. Full-state writes suit a personal dataset; indexed incremental queries are a future scaling step. Automatic refresh requires persistent hosting, permitted network destinations, and approved source access, which GitHub Pages does not supply.

## Browser persistence

Browser/manual mode stores the engine snapshot as a structured object in IndexedDB (`wine-intelligence`, `engine`, key `wine-intelligence.v1`). Reads and writes are asynchronous. Transactions include inventory, evidence, history, runs, decisions and preferences; client state changes only after a committed write. Expected revisions prevent a stale tab from overwriting another tab’s inventory. Actions within a client are serialized. Existing localStorage engine snapshots are validated and migrated transactionally before removing only their old engine key. Invalid data or failed migrations remain intact and exportable as recovery backups; edits are blocked rather than silently starting fresh. The personal journal retains its original localStorage key and backup format. Browser backup restores accept up to 100 MB; source file imports still accept up to 10 MB. Browser capacity depends on device/browser policy, and clearing site data still removes records. No history is truncated to fit the old quota. The hosted server remains SQLite-backed.

## Professional critic review extensions

Critic rows support `publication` (or `critic`), `reviewer`, original `score` (number/range/plus), `scale`, `review_date`, `source_url`, `source_reference`, `drink_from`, `drink_to`, `format_specific` boolean, and `verified` boolean with `verification` equal to `manually_verified` or `provider_verified`. Only reference-backed explicit verification is retained; supplying a flag on a retailer inventory row cannot verify its scores. Feed verification is an assertion by the authorized data supplier, not an inference from a site's name or an access checkbox. `score` may be empty when a drinking window is supplied. `publication` and `reviewer` remain separate. Date/time unknowns remain null.

Inventory rows may additionally carry registered critic shorthand columns (`wa`, `vn`, `ws`, `js`, `jd`, `we`, `bh`, `jm`, `dc`, `jr`) or labeled `ratings` strings. Recognized publication aliases in CSV/Excel are accepted. `rating`/`score` text is only extracted as retailer critic evidence if it contains a professional publication label; an anonymous number is not a professional review. Unparseable rating cells create warnings and retain the inventory. Dataset `sourceReference` optionally identifies the authorized export file; all UI file imports supply its filename.

Inventory datasets may explicitly set `skipInvalidPrices: true`. Browser imports enable this option by default, with an opt-out checkbox. Only price-validation failures are quarantined; all other validation remains atomic and other source categories remain strict. The import run retains `inputCount`, successful `count`, `rejectedPriceRows` (physical Excel row, original price/title/row and reason), and `snapshotDowngraded`. Complete-snapshot retirement is disabled when any price row is quarantined; an entirely unusable-price file fails unchanged. Spreadsheet rows carry `import_row` to disambiguate data-row numbers from worksheet row numbers.

## Verified market extensions

Use the extended market CSV template, Excel mapping, JSON or Market Intelligence → Add a verified merchant offer. Supply availability_status, availability_verified, verified_at, verification_method, verification_evidence, merchant_confidence, merchant_country, source/offer URL and ordinary wine/price fields. Optional FX/tax/shipping, auction metadata, source update time and provider freshness settings retain their originals. Unknown stock, stale quotes, pre-arrival, futures, active/historical auction records and search leads remain inspectable but excluded from current retail valuation. Source method structured parses only explicit merchant schema.org Product/Offer records after access approval and robots checks; method json handles authorized merchant/aggregator feeds. No external market provider is operational by default. POST /api/market uses existing authentication and market-only refresh; it does not fetch static critic or vintage data.
