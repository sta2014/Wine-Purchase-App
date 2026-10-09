# Vintage Intelligence — Phase 2

Phase 2 extends the existing Vite/vanilla JavaScript terminal, shared ranking engine, IndexedDB browser store and SQLite engine. Wine IDs, package pricing, inventory observations, critic scoring, journal records and the Excel workflow are preserved. No live market-price feature was added.

## Components

| Component | Responsibility |
|---|---|
| `src/engine/geography.js` | Canonical hierarchy, aliases, conservative title inference, type/style context and conflict detection |
| `src/engine/vintages.js` | Provider registry, rating conversions, geographic matching, source revisions, composite, tiers, confidence, chart index |
| `src/engine/ingestion.js`, `actions.js` | Provenance-bearing imports, corrections, decisions, backup validation and historical score snapshots |
| `src/engine/ranking.js` | Independent vintage component, available-evidence reweighting, combined filters and sorting |
| `src/vintage-ui.js`, `terminal.js` | Inventory summary, expanded evidence, manual entry, source/wine corrections, approved refresh |
| `server/vintages.js`, `index.js`, `refresh.js` | Authenticated `/api/vintages`, category-specific provider refresh using the existing safe feed adapter |
| `sources.js`, `server/database.js`, `client.js` | Source configuration migration, persistence and browser/server operations |
| `public/templates/vintage.csv`, `spreadsheet.js` | Extended CSV/Excel assessment fields; original inventory mapping retained |

## Data providers and access

**The 15 user-supplied Wine Spectator charts are bundled as 466 provenance-bearing assessments.** No live professional chart retrieval is active. Synthetic ratings appear only in explicitly labeled tests and the synthetic example.

| Publication | Supported ingestion | Verified access finding |
|---|---|---|
| Wine Advocate / Robert Parker | Authorized manual import or configured licensed JSON feed | Robots allowed the public page; the vintage page returned an application shell, without usable chart facts or a documented endpoint |
| Wine Spectator | Authorized manual import / licensed feed | Robots blocks OpenAI retrieval; no chart page scraped |
| Vinous | Authorized assessment export / licensed feed | No approved endpoint or credentials established |
| Decanter | Permitted manual vintage guide data / approved feed | No approved endpoint established |
| Jancis Robinson | Authorized manual data / approved feed | No approved endpoint established |
| Berry Bros. & Rudd | Authorized professional vintage assessment import | Environment network proxy refused access; no ratings retrieved |
| Professional regional authorities | Explicitly confirmed, named, reference-bearing manual data / approved feed | Importer must supply the actual professional authority and provenance |

Provider entries are disabled by default and show their actual access state. A consumer subscription does not establish API rights. Unknown publications require explicit professional confirmation; recognized community publications cannot be relabeled as professional charts. Missing provenance is retained with warnings and excluded, rather than promoted into facts.

Browser use needs **no new environment variables**. Automatic retrieval requires a running engine, an enabled vintage source configured as `json`, an approved HTTPS endpoint and permission confirmation in **Sources**. If the feed needs a credential, use its `authEnv` variable binding plus existing `WINE_SOURCE_CREDENTIAL_HOSTS`; set the secret only on the server. The existing adapter enforces robots, public HTTPS destinations, response limits, conditional ETag/Last-Modified requests and exact credential-host bindings. Publication-specific scraping is not implemented.

## Geography and applicability

The registry supports country → region → subregion → appellation → explicitly supplied vineyard. Legal cru/appellation names can be appellation nodes. It preserves original text and does not assume all regions have the same hierarchy.

Examples include Bordeaux → Left Bank → Médoc → Pauillac, Bordeaux → Right Bank → Saint-Émilion, Burgundy → Côte de Nuits → Vosne-Romanée, Burgundy → Côte de Beaune → Meursault, Rhône → Northern/Southern Rhône, Piedmont → Langhe → Barolo/Barbaresco, Tuscany → Montalcino → Brunello, Tuscany → Bolgheri/Chianti Classico, Champagne, California → Napa → Rutherford, and German regional nodes. Aliases normalize accents, punctuation, `St.`, DOC/DOCG, Bourgogne, CdP, Côte-Rôtie, Piemonte, Toscana and US names.

Only known phrases infer appellations from titles. Conflicting countries/branches block automatic vintage matching. Unknown geography never receives a fuzzy substitution; country-scoped custom regions can match exactly. Vineyard-specific records require the same explicitly supplied vineyard. Napa Cabernet and Riesling style distinctions apply only when actually supported by source fields and wine identity.

An assessment must have the exact year and a geographic node on the wine's ancestor path, with compatible type/style. Champagne cannot use a generic country assessment. NV, MV, unknown years and conflicting vintage identities receive no year-based factual score. Type is taken from explicit metadata, recognizable style words or a disclosed appellation convention. Mixed-color areas such as Chassagne-Montrachet, Pessac-Léognan, Hermitage and Châteauneuf-du-Pape are not silently assigned one color. An unspecified source type means general/all types; a type-specific chart cannot score a wine whose type remains unknown.

Select the deepest eligible geography first, then prefer style/type-specific evidence at that level. Fall back only along the wine's ancestors: Pauillac → Médoc → Left Bank → Bordeaux → France, for example. Broad assessments never dilute available, reliable specific assessments. Source confidence below 0.8 is excluded, allowing a reliable broader fallback. The UI states the node used and why a fallback occurred.

## Normalization and composite

Every record retains source/publication, raw geographic fields, year, original rating/system/scale, normalized internal score, conversion rule, URL/reference, observed/retrieved/last-checked dates, source confidence, short summary, context tags and update revisions. Original ratings and internal conversions are separately labeled.

Central rules in `VINTAGE_POLICY`:

- Points: original points ÷ original scale × 100. Numeric ranges use the conservative lower bound and retain the upper bound.
- Five stars: 1→60, 2→75, 3→85, 4→93, 5→98. Only whole 1–5 ratings are accepted.
- Categories: poor→50, weak→65, average→75, good→83, very good→88, excellent→93, outstanding→96, exceptional→99, legendary→100.
- Letters: A+→99, A→96, A−→93, B+→89, B→85, B−→80, C→75, D→65, F→50.
- Unsupported qualitative labels fail validation; no LLM invents conversions or factual ratings.

At the selected geographic/type/style level, use the latest observation timestamp per publication. Same-date assessments within a publication use their median, preventing duplicate volume from outweighing other publications. Combine publication medians with credibility × source-confidence weights: registered professional publications 1.0, explicitly confirmed other professional authorities 0.75. Publication aliases share one canonical publication. All excluded/broader/superseded facts remain inspectable; duplicate refreshes retain record IDs and decisions.

Confidence is `(0.7 + 0.09 × min(additional publications, 3)) × geography factor × type factor × minimum source confidence × agreement factor × provisional factor`, capped at 0.99. Geography factors: country 0.35, region 0.75, subregion 0.9, appellation/vineyard 1. Type factors: general chart 0.8, appellation convention 0.9, explicit type 1. Agreement factor is `max(0.4, 1 − publication spread / 40)`. A source-declared provisional assessment multiplies confidence by 0.85; older finalized historical charts are not automatically penalized by age. Labels: Very High ≥0.92, High ≥0.78, Medium ≥0.55, otherwise Low. Spread ≥8 points is explicitly flagged as conflicting source data.

## Ranking and UI

Vintage tiers: Exceptional ≥98, Outstanding ≥95, Excellent ≥92, Very Good ≥88, Good ≥83, Average ≥75, Weak below 75.

The three-factor quality ranking uses professional critic scores (60%), the normalized regional vintage composite (25%), and professional critic consensus/confidence (15%). Existing controls adjust these weights. A missing, NV or MV vintage has no numerical component; available factors are reweighted and reduced coverage is disclosed. No invented neutral score or asking-price contribution is used. New quality histories use algorithm version 6; old scoring data is archived before migration. See [QUALITY_RANKING.md](QUALITY_RANKING.md).

The inventory shows vintage score/tier/confidence, assessed region and a **Vintage Intelligence** button. Details show the hierarchy/fallback, original/normalized ratings, provenance, match decisions, provider states, context and contribution. Filters include minimum vintage score, tier (including Exceptional or Outstanding), minimum confidence and canonical appellation, combinable with critic filters. Sort options cover vintage score, tier and contribution. Ranking still spans the full filtered inventory while displaying 100 offers per page.

Manual entry requires a professional source and reference. Wine geography corrections preserve original inventory fields and wine IDs. Source mapping/rating corrections, approvals and rejections persist through reimport, refresh and backups; hard year/type/geographic/provenance conflicts cannot be approved. Earlier source ratings and manual corrections retain revision history. Historical observations and journal records are preserved.

## Persistence, refresh and limitations

Charts use the existing IndexedDB snapshot in browser mode and `vintage_assessments` plus settings/history in SQLite. Default vintage feed refresh is 720 hours (30 days), with force refresh available on a connected engine. One provider chart fetch serves all wines; ranking indexes charts by year and geographic node. Transport failure preserves cached evidence and marks source error/backoff. No per-wine background chart scraping occurs on GitHub Pages.

The hierarchy is a curated starting set, not every world appellation or vineyard. Inferred geography and color need inspection for ambiguous titles; manual corrections are available. Qualitative conversions are disclosed purchasing heuristics, not scores published by the original source. Legacy vintage records without professional provenance remain retained but excluded until reimported with complete fields. Context tags do not infer additional quality penalties. New chart data must come from actual authorized exports, professional manual entry or a configured approved feed.

## Verification

Run `WINE_TEST_WORKBOOK=/local/private/export.xlsx npm test` and the same environment variable with `npm run test:e2e`. The private workbook is never committed. The optional reference test uses actual imported identities with a clearly synthetic, temporary routing assessment; it does not turn test ratings into user data.

Coverage includes all requested major regions, same-year/different-region scores, exact/fallback hierarchy, color/style/vineyard matching, wrong region/year rejection, NV/MV/missing exclusions, professional provenance, conversion rules, confidence/disagreement, source/wine corrections, update/duplicate history, provider failure/cache/force refresh, SQLite, browser persistence, critic independence, filtering/sorting/explanations and the full 8,648-offer / 4,346-review workbook. Existing journal/import/critic/server tests remain included. The production build and JavaScript syntax validation are required; Pages output is prepared only after deployment approval; the repository has no separate configured lint/type-check script.

Current inventory coverage and reference requests are recorded in [QUALITY_COVERAGE_REPORT.md](QUALITY_COVERAGE_REPORT.md). Test results from earlier releases are not evidence that this unpublished revision has been deployed.

## Private chart packs

Use **Vintage charts** to import a prepared JSON `{rows:[...]}` file and inspect saved chart coverage. The inventory, regional vintage contribution, and rankings update together; backups retain chart provenance and revision history. Reimporting the same chart/year source reference updates the existing record. PDF screenshots are transcribed separately; there is no automatic PDF parser or commercial website scraper in the browser.

Optional row fields: `chart_name`, `source_document`, `source_page`, `source_category`, `drinking_status` (NYR, Drink, Drink or Hold, Hold, Past peak), `allowed_styles` and `allowed_appellations` (arrays or semicolon-separated strings). A numeric rating may retain one trailing source footnote asterisk. Regional drinking labels never become individual wine drinking windows. Chart scopes constrain matches; unsupported varieties/appellations and ambiguous wine metadata remain unassessed.

Subregion/bank and style filters operate on canonical geography, including all ancestor subregions. These descriptive fields never rewrite wine IDs. Uploaded PDFs and retailer exports stay private. To resolve unavailable chat downloads, the transcribed regional rating facts are available as `public/data/wine-spectator-vintage-charts.json`, with a direct Load Wine Spectator charts button and ordinary web download. The public file contains regional assessments and provenance only; loading it does not publish the user’s inventory or purchases. Other private chart packs can still be imported locally.
