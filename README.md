# Wine quality intelligence

The existing desktop website ranks the Flickinger wines you can buy using professional critic scores (60%), regional vintage quality (25%), and critic consensus/confidence (15%). Adjust all three percentages in **Preferences**; they must total 100%. Existing imports, package accounting, sources, vintage charts, personal journal and backups remain.

External market research and CellarTracker have been removed. Flickinger lot price, physical-bottle price, currency, volume and packaging stay visible and filterable; they never contribute quality points. No paid service or account is needed for imports and saved data.

Import your Excel workbook, then use **Vintage charts → Load Wine Spectator charts** for the 15 supplied charts. Retailer-reported scores are labeled unverified. **Professional critics** preserves individual publications, ranges, stages and references, allows identity corrections and checked review entry, and offers original-publication search links. Licensed/reference CSV, Excel and JSON imports support a publication/score column or wide WA/VN/JS/etc. columns. Automatic retrieval runs only for explicitly approved JSON feeds on the optional existing Node backend; no publisher is connected by default.

**Data coverage** reports unique wine/vintage identities and missing evidence. Filters combine country, region, subregion, appellation, style, producer, vintage, type, critic scores, vintage scores, consensus, overall score, confidence, asking prices, physical bottles and format. CSV/Excel shortlists support top 15, 25, 50 or a custom size, deduplicate alternate packages, and include selected weights, references and missing-data flags.

Read [QUALITY_RANKING.md](QUALITY_RANKING.md) for methodology and migration safeguards. Private workbook audits remain under ignored `.local/quality-audit/`; no inventory or synthetic score is published as real data.

Browser data uses IndexedDB (`wine-intelligence` / `engine` / `wine-intelligence.v1`). A pre-refactor snapshot is preserved as `wine-intelligence.before-quality.v1` before existing data migrates. Keep downloadable engine backups as well. Personal journal storage/backup format remains unchanged. Optional SQLite migration snapshots the database before removing dedicated pricing tables and preserves critic, vintage and inventory observations. Do not run migration against production until approval.

## Development

Node.js 24.5+ is required for SQLite. Run `npm ci`, `npm run build`, `npm test`, and `npm run test:e2e` (Chromium required). `npm run dev` starts Vite; `npm run engine` starts the optional existing backend. Set `WINE_DB_FILE` to a temporary database for testing migrations; do not use the personal database for fixtures. Approved feed credentials belong in server environment settings, with exact host bindings, never in VITE_* variables.

`npm run build:pages` writes the GitHub Pages artifact to `docs/`. Publish changes only with user approval. This release includes the three-factor quality model and the column G critic importer. No separate Windows application, mobile application, Cloudflare Worker, price scheduler or external pricing queue is part of this version.
