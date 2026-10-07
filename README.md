# Wine purchasing intelligence

[Open the application](https://sta2014.github.io/Wine-Purchase-App/).

The existing Wine Journal now includes a buying terminal. Authorized retailer inventory defines what you can buy; matching market quotes, professional reviews, regional vintage assessments, and drinking windows supply evidence for personalized rankings. Your original wishlist, purchases, notes, and journal backups remain under **Personal journal**.

## Start using it

1. Choose **Explore synthetic example** to try filtering, preferences, and **Explain**. Its wines, merchants, prices, and reviews are fictitious, labeled, and kept out of your real data.
2. Choose **Import data** to load an authorized inventory Excel (.xlsx), CSV, or JSON export into Flickinger Wines. Download a template from the dialog. Excel uploads let you choose a worksheet, confirm the header row, preview rows, and match export columns to wine fields before saving. Older .xls files need Save As .xlsx or CSV in Excel. Supply producer, cuvée, vintage, bottle volume, package count, packaging, currency, price, and quantity whenever known.
3. Import permitted market observations, critic reviews, community reviews, and curated vintage assessments through their corresponding sources. Each observation retains provenance, timestamps, confidence, and warnings.
4. Set filters and buying preferences. Rankings update within the filtered inventory. **Explain** shows contributions, accepted evidence, excluded comparisons, uncertainty, and history.
5. Use **Sources** to enable, disable, or configure sources. **Review matches** handles questionable cuvée matches; hard identity and package conflicts cannot be overridden.
6. Download regular **engine backups**. Browser engine backups up to 100 MB can be restored; source imports retain their 10 MB limit. The journal has a separate **Backups** control and original backup format.

GitHub Pages runs in **browser/manual mode**, with imports and the full analysis pipeline. Engine data lives in the `wine-intelligence` IndexedDB database (`engine` store, `wine-intelligence.v1` record), avoiding localStorage’s small quota. Existing localStorage engine data migrates automatically; the old engine value is removed only after the database transaction commits. Journal storage stays unchanged. Clearing site data can erase browser records. Pages cannot run unattended jobs. Connecting an engine switches to its server dataset and preserves browser data separately; it never silently uploads or merges anything. Engine backup restoration replaces the dataset after confirmation; automated-source approvals must be renewed afterward.

**No live Flickinger inventory, licensed critic data, Wine-Searcher access, or community subscription is currently connected.** Obtain an authorized export or approved feed for real data. Named sites are configuration entries, not claims of working access. Paywalls, logins, CAPTCHA, access restrictions, and anti-bot controls are never bypassed.

Retailer imports treat `6x750ml` as one six-bottle package and `3x750ml` as one three-bottle package. `1.5L` is one magnum (two 750ml equivalents); `3.0L` is one double magnum (four equivalents). The terminal separates package prices, physical bottle counts, and equivalent volume. Excel defaults do not override a detected format. Quantities count available packages.

## Original personal journal

Add wines to your wishlist or purchased wines, with price/currency, quantity, vintage, type, region, notes, and purchase date. Mark as purchased, edit, confirm removal, search, filter, and sort as before. Backups merge by record ID without overwriting existing edits. Storage remains `wine-journal.v1`; backups remain `{ "version": 1, "wines": [...] }`. Records stay on that browser/device/site. Bottle counts represent purchases, not remaining cellar inventory.

## Development and validation

Requires **Node.js 24.5+** (validated on 24.19.0), npm, and Chromium for browser tests. The server uses built-in SQLite.

```sh
npm ci --cache /tmp/wine-npm-cache --no-audit --no-fund
npm run build
npm run engine
```

The engine serves the production frontend and `/api` on port 5180, bound to loopback by default. For development, keep it running and use a second terminal:

```sh
npm run dev -- --port 5173 --strictPort
```

Vite proxies `/api` to the local engine. The browser automatically connects when served at `/` with an available API. On GitHub Pages, choose **Connect engine**, enter your HTTPS engine URL ending in `/api`, and its access token. The token stays in memory; reconnect after reloading. Your journal stays browser-local even when connected.

```sh
npm test
npm run build
npm run test:e2e
```

Node tests cover identity, formats, confidence, atomic imports, history, comparisons, ranking, SQLite persistence, refresh caching, permissions, robots, and HTTP authentication. Browser tests cover the journal and manual terminal pipeline on desktop and phone. Tests use production preview port 4173 and `/usr/bin/chromium`, or `CHROMIUM_PATH`. API probing may log connection refusal when the optional engine is absent; manual mode continues normally. Keep port 4173 free for the tests.

Use the existing `/workspace/Wine-Purchase-App` checkout in cloud tasks; tasks are already isolated. Do not create a worktree unless requested. Processes must restart in new tasks. Reusable cloud setup instructions are saved separately from website publication.

## Server hosting and automatic refresh

An **always-running server with persistent storage and HTTPS** is required for unattended refresh. GitHub Pages cannot host this service. `.env.example` documents bindings; never put secrets in `VITE_*`, source URLs, committed files, or browser bundles.

The default database is `.local/wine-engine.sqlite`. Back up with SQLite's backup mechanism or export an engine backup; copying a live WAL database file alone can miss observations. Schema version 1 initializes automatically. Preserve the database across deployments. This is one personal dataset, not a multiuser service.

Use the included Dockerfile/Compose configuration, or supervise `node server/index.js`. Build the frontend before building the runtime image, which needs no npm dependencies. Docker uses an unprivileged user and persistent `/data` volume. Compose exposes only a loopback port, requires `ENGINE_ACCESS_TOKEN`, and restarts after failures. Put a TLS reverse proxy in front. Store credentials securely on your host and set exact `WINE_ALLOWED_ORIGINS` for remote connections.

```sh
npm ci --no-audit --no-fund
npm run build
docker compose up --build -d
```

For an approved authenticated feed, set its credential binding name in Sources and the corresponding secret on the server. Bind the name to the approved hostname in `WINE_SOURCE_CREDENTIAL_HOSTS`; example non-secret metadata:

```json
{"FLICKINGER_FEED_TOKEN":["approved-feed-host.example"]}
```

The scheduler checks due sources every minute. Inventory/market default to **6 hours**; critic/community/vintage default to **720 hours**. Intervals are configurable. ETag/Last-Modified conditional requests avoid repeat payloads; 304 responses retain original observation timestamps without duplicating history. Errors preserve evidence and back off exponentially, up to 24 hours. Disabled/manual/unapproved sources never fetch. See [DATA_CONTRACTS.md](DATA_CONTRACTS.md).

## Website publication

GitHub Pages is enabled for `main`, folder `/docs`. Rebuild and commit generated assets when frontend source changes:

```sh
npm run build:pages
npm run preview:pages -- --port 4174 --strictPort
```

The Pages build uses `/Wine-Purchase-App/`, includes local fonts and import templates, and contains no visitor records or credentials. Cloud environment publication is separate from website publication. Review screenshots are in `screenshots/`; terminal examples are labeled synthetic.

## Architecture and limits

The original Vite/browser JavaScript journal was preserved. `src/engine/` handles identity, sources, ingestion, ranking, and actions; `src/terminal.js` adds the UI; `server/` provides approved-feed adapters, refresh, authenticated APIs, and SQLite. The audit and assumptions are in [IMPLEMENTATION.md](IMPLEMENTATION.md).

Aliases and appellations start with a conservative curated set. Unknown producers need explicit producer/cuvée fields; fuzzy matches require review. No verified FX conversion, auction-fee model, HTML scraper, investment-return prediction, or purchased-wine synchronization is implemented. At very large inventories, replace full-state APIs, browser analysis, and transactional SQLite state replacement with indexed queries and incremental writes. Browser storage has capacity limits; server history is preferable for sustained use.

## Web price research

Each inventory row has **Research prices**. Google/Bing links search the producer, cuvée, vintage, bottle volume, package count and wooden-case status, excluding Wine-Searcher. These links work on GitHub Pages without a subscription and open an ordinary search in another tab.

For results inside the app, the connected backend implements the documented [Brave Search web API](https://api.search.brave.com/app/documentation/web-search/get-started). Set `BRAVE_SEARCH_API_KEY` securely on the server and permit HTTPS to `api.search.brave.com`; Compose forwards the optional binding. Review the provider's current plan, terms and permitted caching before subscribing. No account is purchased or provisioned by this application. The connector has not been tested against a live account because no key is configured. ChatGPT subscriptions do not supply an app with web-search API credentials.

Research is user-triggered, limited to one new query per three seconds, deduplicated, capped at ten returned links, and cached in process memory for six hours (original retrieval time retained). It neither follows retailer pages nor circumvents their restrictions. Results preserve URL, hostname, provider and retrieval time. Titles/snippets are explicitly unverified; they cannot affect rankings, market observations, or history. Confirm exact identity/format, current availability, price, currency, taxes and shipping from a permitted source, then use **Approved market price imports** to record verified observations. Automatic retailer-page extraction and verified quote promotion are not implemented. Search discovery alone does not establish a buying or executable arbitrage opportunity.

## Professional critic scores

Reimport your retailer export to retain labeled critic columns, then open **Professional critics** on a wine. Scores are marked retailer-reported until independently verified. Publication filters, verified-review filtering, manual evidence, persistent match/identity corrections, composite quality and decomposed ranking are available. Automatic external verification still requires a real approved feed and connected engine; no commercial publication is live by default. See [CRITIC_SCORING.md](CRITIC_SCORING.md) for providers, methodology, configuration and limitations.

## Inventory price import diagnostics

The website defaults to setting aside inventory rows with missing, zero, negative, nonnumeric or out-of-range prices; valid rows and their critic scores still import. **Review excluded price rows** shows the actual imported value and physical Excel worksheet row and downloads every original excluded row. `$400.00` is a valid price. Reports remain in engine backups and survive reload. Imports with excluded rows automatically become partial snapshots, preserving old stock/history. Correct the original cells or mappings and reimport; prices are never invented or converted to zero. Uncheck the option to enforce a strict atomic import. Approved automated feeds remain strict unless their dataset explicitly includes `skipInvalidPrices: true`; market/review/vintage imports are unaffected. An entirely unusable-price file or an unrelated validation error still fails without changing saved inventory.
