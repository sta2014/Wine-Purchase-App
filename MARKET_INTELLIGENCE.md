# Current market pricing: implementation and outstanding live access

Phase 3 extends the existing Vite/vanilla JavaScript buying terminal, shared engine, IndexedDB browser storage and Node 24/SQLite service. Journal, Excel import, critic and contextual vintage features are retained. No new dependencies or application credentials were introduced.

The verified-offer calculation and manual workflow are implemented. **Automatic real-market retrieval is not complete: no external pricing provider has returned real current offers in this environment.** Tested synthetic connectors are not represented as operational live sources. The reference inventory therefore still has zero externally verified live prices until factual offers are supplied.

## Providers and actual access

| Provider/method | Implemented capability | Actual operational status |
| --- | --- | --- |
| Authorized Excel/CSV/JSON market imports | Explicit wine, package price, merchant, source URL, stock evidence and verification time | Working locally; user-supplied facts, no autonomous external verification |
| Manual merchant entry | Record personally checked exact wine, price and stock in Market Intelligence | Working on the published browser app |
| Approved merchant/aggregator JSON feed | Common normalized offer contract, permission/robots, optional bound credentials, cache and scheduler | Fixture-tested; no real endpoint/license supplied |
| Permitted merchant product page | Explicit schema.org Product/Offer JSON-LD, direct merchant URL, stock/currency/price, no AggregateOffer inference | Fixture-tested; no permitted real endpoint validated |
| Wine-Searcher | Existing disabled licensed configuration; authorized feed can use common adapter | No API/account/approved endpoint; consumer Pro subscription is not a promise of API access |
| Brave Search and browser search links | Discover retailer leads; no snippet price promotion | Browser links available; Brave key absent |

On 2026-10-07, access-policy checks to K&L Wines, JJ Buckley, Benchmark Wine and Wine.com were denied by the environment CONNECT proxy (403), including their root domains. Other checks to Wine Exchange, HDH, BBR and WineBid were also network-denied. This does not establish that any merchant allows or forbids automation. No protected pages, authentication, CAPTCHAs or restrictions were bypassed. Flickinger's public robots file was accessible and excluded `/admin/`; this does not establish permission for an inventory feed, and Flickinger is not used as its own external price comparison.

Environment configuration retains existing domains and adds the four primary merchant domains for future access-policy checks. Saving this draft does not apply runtime networking, establish merchant permission or activate a provider. After network access is applied, examine terms/robots and documented permitted feeds/pages before activating any merchant. If access requires a license or key, use that provider's real approved endpoint and server-only host-bound credential; no invented endpoint or credential is requested.

## Data and matching

`src/engine/market.js` centralizes market policy, offer normalization, identity checks, freshness, deduplication, statistics, confidence and value scoring. Existing source, identity and geographic systems are reused.

Each offer retains original title/format/package price/currency, wine ID, provider, merchant and listing URLs, external ID, package count, volume, packaging, per-physical-bottle and per-750ml prices, quantity if known, location/country, availability/channel, observation/retrieval/verification dates, method/evidence/confidence, source update time, tax, shipping, FX and optional auction metadata. No shipping estimates or prices are manufactured.

Exact matching requires an identified canonical producer, vintage, cuvée, confirmed bottle volume, packaging and no hard identity conflicts. Producer/appellation aliases use existing deterministic normalization and geographic aliases. Different vintages, cuvées, vineyards, wine types or classifications cannot silently join. Fuzzy candidates remain inspectable and excluded until a permitted manual identity approval; approval never bypasses stock, channel, stale-data, currency or merchant checks. Unknown producer and NV/MV release identity remain conservative exclusions for automatic pricing.

Loose 6×750ml at $1,200 is $200 per physical bottle; total and package metadata remain visible. Loose pack counts can be compared on a disclosed per-bottle basis. Original wooden/carton case counts must match because case premiums can differ. A magnum, double magnum, half-bottle and standard bottle remain different primary market products. Per-750ml values are informational; they never substitute for exact-volume comps. No cross-format fallback valuation is implemented.

## Stock, freshness and exclusions

Only `CONFIRMED_IN_STOCK`, retail offers count by default. Required fields include `availability_verified=true`, explicit `verified_at`, a recognized verification method, nonempty stock evidence, actual listing provenance, merchant confidence at least .8 and sufficient source confidence. Manual entries state who checked the offer; the app does not independently verify a manual claim.

`LIKELY_IN_STOCK`, `UNKNOWN`, `OUT_OF_STOCK`, `SOLD`, `EXPIRED`, `PRE_ARRIVAL`, `FUTURES` and `ACTIVE_AUCTION` remain separate. Historical prices/results, active bids, futures and search leads never enter the retail median. Active auction bid/estimate/premium/closing date can be stored; bid is not a fixed retail price.

Freshness uses the oldest observation/retrieval/verification timestamp: fresh through 12 hours, aging through 48, stale afterward by default. Offer/source thresholds can override within the user's maximum-age limit. Aging reduces confidence by 20%; stale/future dates are excluded. Re-fetching, provider failure or HTTP 304 does not renew actual stock verification. Legacy quote records without explicit verification stay in backups/history but cannot drive current values.

A newer report for the same underlying URL suppresses an older in-stock report across providers, even when the newer report is sold-out. Simultaneous conflicting stock/identity reports are excluded for review. Complete market snapshots expire absent offers; partial imports preserve them until their freshness limit.

## Statistics, reliability and value

Tracking parameters/fragments are removed for URL deduplication. Duplicate underlying URLs across feeds collapse. Merchant URLs or normalized merchant names identify merchants; the lowest eligible offer per merchant enters statistics, so one merchant cannot flood the median. Other underlying offers stay visible with exclusion reasons. Configure consistent merchant URLs when aggregator names differ.

With four or more independent merchants, flag prices whose absolute deviation from the median exceeds `max(3 × 1.4826 × median absolute deviation, 50% × median)`. Flagged outliers remain visible/history-retained but do not enter reference, average or credible low. Small samples cannot establish statistical outliers, so low sample depth reduces confidence and is displayed.

Primary reference = median of eligible merchant prices after outlier handling. Also retain lowest, highest, average, range, confirmed merchant comp count, candidate offer count, merchant count and liquidity label. Rarity is not an arbitrage bonus. The core confirmed-offer count reports distinct merchant comps after deduplication, with every other listing inspectable.

Discount = `(median − inventory unit price) / median`; dollar discount = `median − inventory unit price`; package savings multiply by inventory bottle count. The same comparisons are shown against the credible low. Negative discounts are labeled premiums. Missing references stay null and display “No verified current market offers found.”

Confidence = depth × minimum accepted offer reliability/source/match/freshness factors × price-agreement factor. Depth: one merchant .30; two .50; three .65; four–seven .80; eight or more .95. Aging factor .80; manual fuzzy match factor .95. Agreement = `max(.4, 1 − price range / median)`. Labels: Very High ≥.85, High ≥.70, Medium ≥.45, otherwise Low. Confidence is evidence strength, not guaranteed availability. Merchant reliability is central per-offer metadata with persistent user overrides.

Value anchors (discount → raw /100): −25%→0, 0%→20, 5%→35, 10%→50, 20%→75, 30%→90, 40%→100, linearly interpolated/capped. Raw value × confidence gives the actual value component. A single expensive offer cannot create a full-strength value signal. Default opportunity weights stay value35/critic35/vintage10/window10/confidence10, centrally configurable; critic and vintage policies remain separate. Missing market data contributes no market component. Algorithm v4 snapshots retain accepted prices/verification times and each contribution without rewriting history.

## Currency, tax and shipping

Default scope: US merchants, USD. Unknown/outside merchant country does not satisfy US-only scope. Worldwide scope is configurable in Preferences. Foreign prices require supplied conversion currency/rate, timestamp no older than 24 hours and reference; original prices are retained, and no FX feed is invented. Inventory must use the comparison currency; conversion of inventory currency is not yet implemented.

Prices use merchandise basis before shipping. Tax-inclusive amounts can be reduced only with an explicit tax rate and documented reference when compared with tax-exclusive inventory. This calculation is flagged and does not establish the buyer's tax-exemption eligibility. Otherwise differing bases are excluded. Unknown tax treatment is flagged; two unspecified prices remain indicative merchandise comparisons. Delivered/landed values are excluded from the merchandise median. Actual shipping information/amount stays separate; no estimated delivered price is created.

## UI, manual decisions, caching and refresh

`src/market-ui.js` supplies Market Intelligence beside each wine: reference/low, percentage and dollar comparisons, merchant depth, confidence, dates, current/excluded/stale/secondary candidates, stock evidence, original tax/FX/shipping, links and previous offer observations. The main table shows compact median/low/confidence/discount information. Filters include discount, dollar savings, confirmed merchant comps, confidence, below-market and verified-current-comps; sorts cover median/low, discount, savings, offer count, confidence and value contribution. These combine with existing critics/vintages and re-rank the full filtered inventory.

Approve/reject identities, exclude/restore offers, mark duplicates, correct format and merchant confidence. Existing canonical identity correction remains in Professional critics. Decisions/corrections persist through refresh, reimport and IndexedDB/SQLite backups. Offer IDs stay stable; refreshed prices/stock become revisions retaining old observations. Source configuration includes merchant country/reliability/tax basis and JSON/structured/manual/licensed methods.

`server/market.js` adds authenticated POST `/api/market` and logs wine identity, provider status, candidates, match/freshness/stock/price/accept/reject reasons. `server/market-adapters.js` parses merchant JSON-LD using existing HTTPS/robots/credential safeguards. `server/refresh.js` reuses the shared minute scheduler: inventory/market six-hour default refresh, static critic/vintage 720-hour default. Feed-level requests serve all wines, no request per rendered row. Concurrent refresh deduplicates; TTL, ETag, time/size limits, exponential retry and HTTP429 Retry-After apply. Forced stock rechecks request a full body, with a one-minute cooldown; rate-limit deadlines cannot be bypassed with Force. Once stored verification expires, the scheduler also requests a fresh body, but never rewrites an explicitly older observation into current stock. Failure preserves previous data and cannot stop other providers; stale evidence stops contributing.

No new environment variable is mandatory for manual mode. Approved feeds reuse source URL, `authEnv` and `WINE_SOURCE_CREDENTIAL_HOSTS`; secure actual tokens on the server. Hosted engines reuse `ENGINE_ACCESS_TOKEN`, HTTPS and `WINE_ALLOWED_ORIGINS`. GitHub Pages stores on one device and cannot run unattended external retrieval. The existing setup/start commands remain unchanged.

## Verification

The complete Node suite includes original critic/vintage/journal/import/server coverage, mandatory $410 median/26.8% discount, wrong identity/format, package normalization, stock/channel exclusions, stale/aging, cross-provider duplicates/latest-stock suppression, FX/tax, outliers, thin/no market, manual controls/corrections, feed caching/failures/429, structured merchant parsing/permission and authenticated API. It verifies strong critic/vintage plus discount outranks a weaker wine with a larger discount.

Desktop/mobile browser coverage verifies detail calculations, excluded candidates, controls, manual entry/reload/reimport, filters and existing journal/critic/vintage workflows. The private workbook remains private and tests all 8,648 listings / 4,346 retailer-reported critic facts; synthetic market matching against a real imported identity is clearly test-only. No synthetic prices are saved to the user's dataset or shipped as factual data. Actual external merchant retrieval is unverified and is the remaining completion requirement.

This JavaScript project defines no lint or static type-check script. All application/server/test JavaScript files receive syntax checks; production and GitHub Pages builds validate bundling. Results and publication are reported separately from unverified live-source access.


Verified on 2026-10-07: **163 Node tests passed, 0 skipped; 62 desktop/mobile browser tests passed**, including the private reference workbook. The reference/vintage/market browser suites also used the GitHub Pages build and its `/Wine-Purchase-App/` base path. Both production and Pages builds passed; all 45 application/server/test JavaScript files passed syntax checks; `git diff --check` passed. The mandatory current-offer scenario returns median $410 / discount 26.829%; the high outlier scenario excludes $950 and returns median $407.50. Full reference import benchmark: about 1.9 seconds processing plus 0.7 seconds ranking; browser confirmed imports about 3–4 seconds. The running API, Vite proxy and synthetic market detail view were functionally checked without changing the retained personal database.
