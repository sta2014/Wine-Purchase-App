# Purchasing intelligence implementation

## Audit (before implementation)

- Stack: Vite 8, browser JavaScript, locally bundled fonts; no React or backend. Node 24 is available. GitHub Pages serves the compiled `docs/` folder.
- Existing data: `wine-journal.v1` localStorage, Wine Journal JSON backups, wine name/producer/vintage/type/region/status/price/currency/quantity/date/notes. No retailer listings, market observations, canonical identifiers, critic data, ranking, ingestion, source integrations, scheduler, fixtures, or database.
- Existing filtering: journal list, type, text search, date/name sorting. No preferences or comparison sources.
- Preserve: journal CRUD, purchase flow, confirmations, filtering, corruption/write-failure protection, backups, phone layouts, original storage key and backup format.
- Tests: 8 Node tests and 6 Playwright scenarios repeated on desktop/mobile. Baseline data tests pass. No CI or server configuration. No application credential bindings exist; `.env` is ignored.
- Limitations: static hosting cannot execute scheduled jobs, keep server credentials, or store shared historical observations. Monolithic journal rendering must remain isolated from the new terminal. Browser storage can be cleared and has capacity limits.

## Plan

1. Add shared deterministic identity, strict CSV/JSON schemas, source registry, provenance-bearing observations, historical reducers, and explainable ranking.
2. Add Node 24 SQLite service, source adapters, conditional HTTP refresh, differentiated TTLs, backoff, and a bounded scheduler. Expose authenticated APIs; preserve database state across restart.
3. Add a terminal alongside the journal: inventory imports, market/review/vintage enrichment, filters, weights, evidence, matching review, history, source controls, and engine backups. Keep GitHub Pages usable in clearly identified browser/manual mode.
4. Verify identity/package safety, data history, missing/stale evidence, refresh behavior, real API persistence, and desktop/mobile workflows; build and publish the static upgrade. Document backend hosting prerequisites.

## Assumptions and contracts

- No real retailer or critic data is bundled or invented. Demonstration data is optional, explicitly synthetic, and isolated from real source IDs.
- Flickinger initially accepts an authorized CSV/JSON export. Named commercial sources are connector configurations, not claims of working licensed API access. No paywall, CAPTCHA, login, or anti-bot bypass is implemented.
- Prices are package totals unless `price_basis=bottle` is explicitly supplied; quantities count available packages. 750ml normalization is displayed, but market comparison requires the same vintage, bottle volume, pack count, packaging, currency, and price basis. Shipping/taxes and auction fees are not assumed equal.
- Critic scores retain their original scale. Lower ends of ranges are used conservatively. Missing scores, market prices, vintage assessments, and drinking windows are unknown, never invented. Missing components earn no scoring contribution and reduce evidence coverage.
- Ranking is recomputed after filters and preferences change, with rank assigned inside the selected universe. Absolute evidence-based scores remain comparable; filters do not fabricate improved value.
- Vintage assessments are scoped to region, vintage, and wine type. Windows come from reviews; none are inferred from vintage alone.
- Background refresh is a backend capability, not a promise that a static tab or GitHub Pages runs continuously. Automatic feeds require explicit access approval and an approved JSON endpoint; HTML scraping is not enabled.
- Journal data remains browser-local. Engine data uses its own storage namespace or the server's SQLite database. A backend connection never silently migrates or overwrites browser data.

## Validation and deployment

- The original journal remains intact, with only an integration import/mount added to its entry point.
- Direct .xlsx support uses a lazy-loaded reader and a worksheet/header/column preview, not guessed prices or hidden data conversion. A synthetic two-sheet workbook exercises actual Excel parsing.
- Node/model/API suites and desktop/phone browser workflows verify the pipeline, historical observations, strict format safety, confidence, source controls, backups, and original journal behavior. Browser suites force manual mode so they never modify a separately running engine dataset.
- The real Node service and Vite proxy were started and functionally checked. The Docker runtime was built and verified for authenticated import and inventory/history persistence across a restart.
- The initial Docker npm build could not resolve the package registry from its isolated network; the deployment image now consumes the frontend built with the host's verified locked install and needs no runtime npm dependencies. Restrictive source-file permissions were explicitly made readable by the unprivileged container user.
- GitHub Pages publishes the manual terminal, not an unattended server. A hosted backend, permitted source endpoints, and required licenses remain external prerequisites.
- Flickinger public rules could not be checked because the environment proxy denied that domain. Domain additions are saved in the environment draft; saving the draft does not change the running network. No retailer scrape was performed.
