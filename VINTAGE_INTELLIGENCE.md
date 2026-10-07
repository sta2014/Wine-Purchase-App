# Vintage Intelligence — Phase 2

Phase 2 extends the existing Vite/vanilla JavaScript terminal, shared ranking engine, IndexedDB browser store and SQLite engine. Wine IDs, package pricing, inventory observations, critic scoring, journal records and the Excel workflow are preserved. No live market-price feature was added.

## Components

| Component | Responsibility |
|---|---|
| `src/engine/geography.js` | Canonical hierarchy, aliases, conservative title inference, type/style context and conflict detection |
| `src/engine/vintages.js` | Provider registry, rating conversions, geographic matching, source revisions, composite, tiers, confidence, chart index |
| `src/engine/ingestion.js`, `actions.js` | Provenance-bearing imports, corrections, decisions, backup validation and historical score snapshots |
| `src/engine/ranking.js` | Independent vintage component, neutral missing-data treatment, combined filters and sorting |
| `src/vintage-ui.js`, `terminal.js` | Inventory summary, expanded evidence, manual entry, source/wine corrections, approved refresh |
| `server/vintages.js`, `index.js`, `refresh.js` | Authenticated `/api/vintages`, category-specific provider refresh using the existing safe feed adapter |
| `sources.js`, `server/database.js`, `client.js` | Source configuration migration, persistence and browser/server operations |
| `public/templates/vintage.csv`, `spreadsheet.js` | Extended CSV/Excel assessment fields; original inventory mapping retained |

## Data providers and access

**No live professional vintage chart was retrieved or activated. No factual vintage ratings are bundled.** Synthetic ratings appear only in explicitly labeled tests and the existing synthetic example.

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

The separate vintage ranking component interpolates between score→component anchors `0→20, 75→35, 83→45, 88→55, 92→65, 95→80, 98→95, 100→100`. This emphasizes exceptional vintages while bounding a weak-vintage penalty. Its existing default weight stays 10 versus critic quality 35; all weights remain independently configurable in Preferences. Missing/NV/MV vintage evidence uses a disclosed neutral component of 50 with **zero vintage evidence coverage**. The actual vintage composite remains null. At default weights, neutral vintage contributes 5 opportunity points; this replaces the previous missing-vintage zero contribution. A strong individual critic review remains the stronger signal. Historical opportunity snapshots retain their original algorithm versions; new snapshots use version 3 with vintage evidence/contribution and geography.

The inventory shows vintage score/tier/confidence, assessed region and a **Vintage Intelligence** button. Details show the hierarchy/fallback, original/normalized ratings, provenance, match decisions, provider states, context and contribution. Filters include minimum vintage score, tier (including Exceptional or Outstanding), minimum confidence and canonical appellation, combinable with critic filters. Sort options cover vintage score, tier and contribution. Ranking still spans the full filtered inventory while displaying 100 offers per page.

Manual entry requires a professional source and reference. Wine geography corrections preserve original inventory fields and wine IDs. Source mapping/rating corrections, approvals and rejections persist through reimport, refresh and backups; hard year/type/geographic/provenance conflicts cannot be approved. Earlier source ratings and manual corrections retain revision history. Historical observations and journal records are preserved.

## Persistence, refresh and limitations

Charts use the existing IndexedDB snapshot in browser mode and `vintage_assessments` plus settings/history in SQLite. Default vintage feed refresh is 720 hours (30 days), with force refresh available on a connected engine. One provider chart fetch serves all wines; ranking indexes charts by year and geographic node. Transport failure preserves cached evidence and marks source error/backoff. No per-wine background chart scraping occurs on GitHub Pages.

The hierarchy is a curated starting set, not every world appellation or vineyard. Inferred geography and color need inspection for ambiguous titles; manual corrections are available. Qualitative conversions are disclosed purchasing heuristics, not scores published by the original source. Legacy vintage records without professional provenance remain retained but excluded until reimported with complete fields. Context tags do not infer additional quality penalties. New chart data must come from actual authorized exports, professional manual entry or a configured approved feed.

## Verification

Run `WINE_TEST_WORKBOOK=/local/private/export.xlsx npm test` and the same environment variable with `npm run test:e2e`. The private workbook is never committed. The optional reference test uses actual imported identities with a clearly synthetic, temporary routing assessment; it does not turn test ratings into user data.

Coverage includes all requested major regions, same-year/different-region scores, exact/fallback hierarchy, color/style/vineyard matching, wrong region/year rejection, NV/MV/missing neutrality, professional provenance, conversion rules, confidence/disagreement, source/wine corrections, update/duplicate history, provider failure/cache/force refresh, SQLite, browser persistence, critic independence, filtering/sorting/explanations and the full 8,648-offer / 4,346-review workbook. Existing journal/import/critic/server tests remain included. Production and Pages builds and JavaScript syntax validation are required; the repository has no separate configured lint/type-check script.

Verified on 2026-10-07: **120 engine/unit/integration tests passed with no skips**, including the private reference workbook and large-chart indexing; **58 desktop/mobile browser tests passed**, including the six private-workbook/vintage workflows against the Pages base path. Both production builds, JavaScript syntax checks and patch whitespace checks passed. The actual workbook imported in approximately 3–4 seconds in browser tests and preserved all 8,648 offers and 4,346 retailer-reported critic facts across reload/reimport. Local terminal and detail layouts were visually inspected using clearly labeled synthetic examples. Source network findings above establish access limitations, not successful live vintage-chart retrieval.
