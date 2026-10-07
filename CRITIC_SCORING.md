# Professional critic scoring — Phase 1

This extends the existing Vite/vanilla-JavaScript terminal and shared engine; it preserves the journal, Excel package handling, separate retailer offers, IndexedDB migration, SQLite history, existing price/vintage features and source permission gates. No new market-price or vintage-chart integration was added.

## What works now

Reimport an authorized retailer workbook or CSV/JSON. The column preview recognizes WA/RP, VM/VN/AG, WS, JS, JD, WE, BH/AM, JM/IB, Decanter and JR columns and labeled combined Ratings cells. Original numbers, plus signs and ranges are retained. Anonymous ratings, stars and unparseable cells never become professional scores; warnings do not discard otherwise valid inventory. Imported retailer scores are **retailer-reported, unverified**. An older inventory import cannot recover columns it discarded; the original file must be reimported.

Each listing's **Professional critics** panel shows original reviews, publication/reviewer, scale, date when supplied, URL/reference, provider, retrieval time, confidence, match status and conflicts. It includes publication search links, manual review entry, explicit factual verification with a reference, identity corrections and persistent approval/rejection. Approving an identity match does **not** verify a score. The independent-review checkbox records the user's confirmation, not an automated certification. Community/Vivino/CellarTracker and retailer-star data stay outside the professional composite.

Filters add publication, at least one independently verified review and hiding uncertain matches. Minimum critic composite and sorting remain composable with existing inventory filters. Missing data does not meet a minimum-score filter.

## Matching and persistence

Deterministic canonical producer aliases, cuvée, vintage, appellation, vineyard, classification and designation are checked first. Conflicting type/country/region/subregion, cru classification, producer or vintage block approval. Exact beverage identity matches automatically; strong nonexact matches score 0.94 or 0.76 and require explicit review. Ordinary reviews span bottle/package formats; `format_specific: true` requires an identical format. Explicit NV matches NV and MV matches MV for reviews, while unknown vintage cannot match; original market vintage rules are preserved. Batch/disgorgement identifiers should be supplied as designation for Champagne. Matching is conservative; unknown producers need explicit fields or a canonical correction, and curated aliases are not exhaustive.

Review uniqueness includes provider, beverage identity, publication, reviewer, review date, source reference/URL, score/range/plus/scale, windows, kind, and format where applicable. Retrieval time is excluded. Repeat retrieval keeps the ID, first retrieval time and manual decisions, updating `lastRetrievedAt`; an explicit verification can upgrade a stored fact. Legitimately different reviews are retained. Canonical corrections survive reimport. Historical opportunity records store composite, quality component/contribution, evidence review IDs, confidence, weights and algorithm version 2.

## Composite and ranking

Published 100-point scores are unchanged. Other scales map proportionally to /100 (an explicit linear comparison convention, not a claim of equivalence between critic philosophies). A range uses its **lower bound** for calculations; the original range remains visible. Plus signs confer no invented numeric bonus.

Identical published facts relayed by several providers are counted once. Within each publication, take the median of its distinct reviews. Verified reviews take precedence over unverified reports from that publication; discrepant retailer reports remain visible and flagged. Registered professional publications have equal weight; unregistered, explicitly supplied professional sources receive half weight. Confidence reflects publication count, verified evidence, source registry coverage and cross-publication spread; it is a disclosed heuristic, not a statistical probability. No highest-score rule is used. The composite is displayed to one decimal.

A separate interpretable piecewise-linear quality component maps composite → quality points using central policy anchors: 88→20, 90→25, 93→40, 95→55, 97→70, 98→80, 100→100. Its contribution is quality points × quality weight / total weight. The default quality weight is 35/100 and remains editable in Preferences. Missing critic data retains a null composite/component, uses a neutral 50 quality points for contribution, and adds no evidence coverage. It never becomes a factual score of zero. Critic scores alone do not justify a buying recommendation; availability, freshness, coverage and existing purchasing evidence remain relevant.

## Provider access and operation

**Verified operational:** retailer-file ingestion, approved manual critic CSV/Excel/JSON ingestion, browser publication-search links and reference-backed manual corrections.

**Not verified as live sources:** Wine Advocate, Vinous, Wine Spectator, James Suckling, Jeb Dunnuck, Decanter, Wine Enthusiast, Burghound, Jasper Morris/Inside Burgundy, Jancis Robinson or any regional critic. No live account, approved feed or publication credentials were available during implementation. A Wine Enthusiast robots request was denied by the environment's CONNECT proxy; that does not establish the site's permissions or policy. No site-specific scraper or invented endpoint is claimed. Consumer subscriptions do not automatically confer API/data redistribution access.

The generic `JSONFeedAdapter.fetchCriticReviews()` consumes permitted structured data through the common import contract. Configure **Sources → critic category → Approved JSON feed/API**, supply an actual authorized HTTPS feed URL, confirm permission and select a server-only credential binding when required. This requires a continuously hosted connected engine; GitHub Pages itself cannot perform server-side authenticated retrieval. A configured engine attempts local matching/approved-feed enrichment on inventory import. Its explicit force-search refreshes critic sources only, leaving market/vintage retrieval untouched. Per-wine logs retain canonical identity, provider, candidate IDs/titles, match confidence/reasons, acceptance, auth/HTTP/rate-limit failure and unavailable/no-review distinctions. A successful empty feed means no matching review in that feed, not no review anywhere on the internet.

For example, an access provider can supply a **real approved feed endpoint and bearer token** bound to `WINE_CRITIC_FEED_TOKEN` (the name is configurable) and exact host metadata in `WINE_SOURCE_CREDENTIAL_HOSTS`. Do not supply secret values in chat, URLs, browser settings, source files or `VITE_*`. The actual endpoint/host must be known before creating a proxy secret binding. No new mandatory credential was invented. `ENGINE_ACCESS_TOKEN` and `WINE_ALLOWED_ORIGINS` are required for a publicly hosted engine as documented in README/.env.example.

Approved feeds use existing robots/access restrictions, HTTPS/TLS/SSRF protections, ETag/Last-Modified, configured 720-hour default review TTL and failure backoff. Persistent observations and lookup results survive SQLite restart; matching logs cache for 30 days with source-configuration/freshness fingerprint invalidation. Rendering causes no retrieval. A force search intentionally bypasses TTL while retaining conditional transport and deduplication. API route: POST `/api/critics` with `{wineId, force}`; all normal API authentication/origin rules apply.

## Main components and validation

- `src/engine/critics.js`: publication registry, parsing, retailer extraction, deduplication, composite, central quality policy, publication search links.
- `ingestion.js`, `spreadsheet.js`, `identity.js`, `ranking.js`, `actions.js`: metadata, imports, conservative matching, persistent corrections and decomposable ranking.
- `src/terminal.js`, `client.js`: critic evidence/manual correction UI, filters and connected lookups.
- `server/critics.js`, `refresh.js`, `index.js`: batched permitted-feed retrieval, logs/cache and API integration.
- `tests/critics.test.js`, `tests/e2e/terminal.spec.js`, `tests/fixtures/critic-scores.xlsx`: explicitly synthetic regression fixtures; no test numbers are represented as factual wine ratings.

Node tests cover all 16 requested categories plus retailer extraction, community exclusion, conflicting verified reports, format-specific reviews, dedup/decision preservation, canonical reimport corrections, neutrality and provider TTL/outage/auth behavior. Existing and new desktop/phone browser tests cover actual XLSX parsing/mapping, package totals, unparseable rating warnings, review entry/verification, conflicts, filters, reload and reimport durability. The user's original export was not available in this workspace, so its exact columns and real external-score coverage remain unverified. Reimporting it on the site will expose any parsing or identity warnings rather than silently guessing.

Validation result: **79 Node tests passed; 48 desktop/phone Playwright tests passed**, with the six new critic browser checks also rerun against the final production build. `npm run build`, `npm run build:pages` and `git diff --check` passed. The restarted development engine/proxy and the Pages-base XLSX critic import were checked in fresh browser contexts without changing retained server inventory. There is no configured lint/type-check script in this JavaScript repository. Live publication retrieval and the user’s original workbook were not verified.
