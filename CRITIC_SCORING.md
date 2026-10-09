# Professional critic evidence

Current policy is documented in [QUALITY_RANKING.md](QUALITY_RANKING.md). Scores remain professional facts, separate from vintage and consensus. The default weight is 60%, adjustable in the existing controls.

Inventory exports extract labeled WA/RP, VN/VM/AG, WS, JS, JD, WE, BH, JA, JM, DC, JR and TWI scores. Anonymous scores, malformed ranges and NR values are never converted into guessed numbers. Retailer-reported evidence stays unverified. Independent manual reviews require original publication/authorized record references; providers must explicitly supply verification and provenance.

Approved critic imports accept CSV, Excel or JSON in long form (exact raw_title, producer, cuvee/vineyard, vintage, critic, score, scale, source_url/reference, review_stage) or wide publication columns. Wide rows expand into separate referenced facts. Original scores, plus/range notation, barrel/preliminary/final stage, reviewer, date, source and retrieval time remain stored. Paid consumer subscriptions do not automatically supply an API.

Exact vintage/cuvée/vineyard and producer matching remain strict. Hard conflicts cannot be approved. Labelled release/reconditioning dates are kept as context, rather than mistaken for a different vintage. No critic website is automatically scraped. The existing backend supports approved JSON feeds and batched lookup; browser mode supports authorized imports, source search links and checked manual entry.

## Flickinger column G

The supplied eight-column Inventory worksheet maps A Region Name, B Sub Region, C Vintage, D Size, E Wine Name, F Price (USD), G Scores, H Color / Type. Header-based mappings remain editable. Each clearly labelled rating in G becomes its own retailer-reported observation. Mixed commas, semicolons, slashes, newlines, spaces, parentheses, Unicode range dashes and plus signs are supported. Compact existing labels such as WS94 also remain supported. The entire labelled value is validated: 90?, 97_, 9i7 and reversed/out-of-scale ranges are not silently truncated into scores. Valid neighbouring ratings still import. Publication-specific NR markers remain unscored and inspectable.

In this application JM now means **James Molesworth**, reviewer for **Wine Spectator**, as specified for the Flickinger export. Jasper Morris remains supported under his full publication name or IB. Legacy retailer JM facts misattributed to Jasper Morris are retained but explicitly excluded on reimport, rather than added as another critic. Legacy partial parses of unchanged malformed cells are likewise retained for inspection and excluded. Existing explicitly sourced Jasper Morris reviews are unaffected.

Per-rating provenance retains file, worksheet, physical row, ratings column, complete original cell, notation and import time, with prior import references retained. Ranges use their lower bound with no plus bonus; a range alone does not assert a barrel stage. Verified exact corroborating facts with compatible reviewer/date/stage metadata retain references and do not count twice. Conflicting ratings and genuinely different named reviewers remain inspectable, while consensus counts publications rather than reviewer copies. Verified evidence and final bottle observations take precedence under the existing aggregation policy.

Actual workbook results and correction requests: [COLUMN_G_IMPORT_REPORT.md](COLUMN_G_IMPORT_REPORT.md). No new online connector, paid service or deployment is included.
