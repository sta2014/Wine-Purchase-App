# Data and connector contracts

## Imports and canonical identity

Excel (.xlsx) imports read multiple worksheets locally, detect a likely header, and require a column-mapping preview before ingestion. Headers, last data row, price/package basis, and missing-column defaults can be adjusted. File limit is 10 MB, decompressed ZIP limit 64 MB, at most 50 sheets, 10,000 data rows, and 200 columns. Formulas and macros are never executed. Older .xls is rejected with Save As instructions. The original Flickinger workbook layout has not been independently verified; a synthetic multi-sheet XLSX fixture validates the import path.

JSON accepts a row array or `{ "rows": [...], "completeSnapshot": true }`. CSV requires unique headers and data rows. All rows validate before committing. A complete inventory snapshot retires missing listings; partial imports preserve them. Empty inventory needs an explicitly complete JSON snapshot. Stable `external_id`/SKU values identify separate offers for the same wine.

Identity fields: `raw_title`, `producer`, `cuvee`, `vineyard`, `appellation`, `region`, `country`, `vintage`, `bottle_ml`, `pack_count`, `packaging`, `type`, `classification`, `designation`. Packaging is `loose`, `carton`, or `owc`. Canonical IDs encode producer/cuvée/vineyard/appellation/vintage/classification/designation plus bottle volume, count, and packaging. Accents, punctuation, abbreviations, curated aliases, vintage, bottle size, and packs normalize deterministically. Raw titles and structured fields remain available. Sparse enrichment never erases existing inventory metadata.

Market matching requires an identified producer, matching vintage and cuvée identity, verified volume, identical pack count/packaging, no known identity conflicts, and adequate confidence. Automatic threshold defaults to 0.95. Exact canonical matches score 1.0; fuzzy candidates score 0.94 or 0.76 and require review. Hard conflicts cannot be approved. Professional reviews/windows apply to the beverage independently of package size, while rejecting known type/identity conflicts. False matches take precedence over completeness.

Every observation retains source ID/name, URL/reference when supplied, retrieval/observation timestamps, raw title, confidence, parsing warnings, and wine ID when applicable. Missing timestamps default to import time; invalid/materially future dates fail. Inventory history, external observations, runs, match decisions, and opportunity snapshots remain separate. Opportunity snapshots retain weights and algorithm version. Preferences never rewrite past snapshots.

## Category fields

| Category | Additional fields |
| --- | --- |
| Inventory | `price`, `price_basis`, `currency`, `available_quantity`, `is_available`, `external_id`, `price_terms`, `source_url`, `observed_at` |
| Market | Inventory price/format fields plus `merchant`, `sale_type`, `confidence` |
| Critic | `critic`/`publication`, `score`, `scale`, paired `drink_from`/`drink_to`, `notes`, provenance |
| Community | Review fields, stored separately from professional scores |
| Vintage | `region`, `type`, `vintage`, `score`, `scale`, `notes`, provenance; no wine ID required |

Prices must be positive; quantities are nonnegative integer **packages**, unknown if absent. `price_basis` defaults to `package`; `bottle` is explicit. Unit price = package price / pack count; normalized per-750ml = unit price × 750 / bottle_ml. Normalization does not make different formats tradable equivalents. Currency defaults to USD; other supported currencies are preserved without guessed FX.

Tax/shipping bases are `unspecified`, `ex_tax`, `tax_included`, `landed`. Different bases/currencies cannot compare. Two unspecified bases allow an indicative comparison with an explicit warning, not an executable arbitrage claim. `sale_type=auction` observations are recorded but excluded from retail price comparison until a fee model exists.

Review scores may be numbers or ranges such as `94-96`. The lower bound drives scoring; the original scale/range stays recorded. Scores normalize arithmetically to /100, not a calibrated equivalence between critics. Scale defaults to 100. Reviews need a score or an ordered paired drinking window. Community scores do not enter professional quality. Vintage assessments require the same region, year, and type; none are generated from missing evidence.

## Opportunity algorithm v1

Market evidence uses the latest observation per source/merchant/wine/currency/terms/sale type, then one current observation per merchant across feeds. A latest unavailable quote suppresses its older available observation. Available, comparable, sufficiently confident quotes within the configured age limit (48 hours default) produce a median reference. Discount = (reference − asking) / reference.

| Component | Value /100 | Default weight |
| --- | --- | --- |
| Value | Discount / 0.40 × 100, capped 0–100 | 35 |
| Quality | Mean matching professional score normalized to /100 | 35 |
| Vintage | Mean matching regional assessment normalized to /100 | 10 |
| Window | 100 inside a supplied professional window, 0 outside, 50 when windows disagree | 10 |
| Confidence | Minimum identity/match/source confidence across market evidence × 100 | 10 |

Score = sum(component × weight / total weights), capped at 100. Missing evidence contributes zero and reduces weighted coverage; other components are not inflated. Preferred regions add at most 5 × coverage points, disclosed separately. Stale inventory (48 hours default) scores zero with an availability warning. Low-confidence reviews/vintages are excluded. Minimum evidence filters reject unknowns. Ranks are reassigned within the selected subset; absolute scores remain comparable. Weights recalculate scores. This is a buying heuristic, not an investment-return forecast.

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
