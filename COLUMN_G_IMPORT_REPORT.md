# Column G critic import — implementation and actual workbook results

The existing Vite/JavaScript importer and professional scoring engine were extended. No app rebuild, paid service, new retrieval infrastructure, production migration, push or deployment was performed. Existing weights stay adjustable at 60% professional critics, 25% regional vintage quality and 15% professional consensus/confidence.

## Verified layout

Workbook: Flickinger Applicaiton Upload 10_6_2026.xlsx, worksheet Inventory. Row 1 is the header. A Region Name; B Sub Region; C Vintage; D Size; E Wine Name; F Price (USD); **G Scores**; H Color / Type. Column G automatically maps to Combined ratings (publication + score); all mappings remain editable.

## Actual results

| Measure | Before | After |
|---|---:|---:|
| Inventory rows/listings | 8,645 | 8,645 |
| Rows containing ratings text in G | 2,642 | 2,642 |
| Valid individual rating occurrences extracted | 5,160 | 5,272 |
| Distinct retained ratings after package/row deduplication, fresh import | 4,654 | 4,747 |
| Unique wine/vintage identities | 7,978 | 7,978 |
| Identities with usable professional scores | 2,398 | 2,397 |
| Independently verified external reviews retrieved in this task | 0 | 0 |

The new observations include 99 distinct Jane Anson ratings. 63 distinct JM ratings are correctly attributed to Wine Spectator reviewer James Molesworth. The remaining extraction difference removes six distinct incomplete/malformed scores previously accepted by partial parsing. All asking prices, formats and inventory rows are preserved.

Usable identity coverage decreases by one because one wine's only earlier rating was the uncertain entry “BH 90?”. It remains unassessed until corrected. More extracted facts do not automatically mean more scored identities: the newly supported Jane Anson ratings occur on wines already having another usable rating.

A second import of the same file keeps exactly 4,747 ratings and preserves review IDs and publication consensus. Reimport over the existing pre-change dataset retains 4,816 historical review records: 4,747 active and 69 explicitly excluded legacy records (63 misattributed JM facts and six malformed partial parses). This is retained history, not 4,816 usable opinions. That corrected reimport also yields 2,397 scored identities and preserves every asking price.

## Parsing and evidence

All valid ratings in a cell are extracted separately. Labels are case-insensitive. Commas, semicolons, slashes, newlines, whitespace, parentheses, range dashes and plus signs are supported. Original cell text and notation are preserved. Unknown/invalid text is flagged without stopping the inventory import or shifting rows. Six publication-specific Vinous NR markers in six listing rows (five unique identities) are saved as unscored markers, never zeros.

Each observation preserves publication, reviewer, scale, range endpoints, original notation, file reference, worksheet, physical row, column G and import timestamp. Reimport provenance history is retained. The critic details and ranking explanation display individual observations and verification status. Lower range endpoints are used for ranking; plus signs add no invented bonus. A stage is supplied only when explicitly stated; a range alone does not prove a barrel review.

JM means James Molesworth / Wine Spectator. Existing Jasper Morris reviews remain supported through their explicit name or IB. Publication-level grouping ensures JM/WS do not create two independent publications. Exact compatible verified counterparts retain both references and count as one fact; conflicting values remain visible, with verified evidence preferred under the existing policy. Strict producer/cuvée/vintage matching remains in place.

## Entries needing correction

All eight affected rows still import as inventory. Valid neighbouring ratings are retained. Worksheet row numbers include the header row.

| Worksheet row | Original cell | Rejected portion |
|---|---|---|
| 695 | VM 99 / JD 97_ / JS 99-100 / WA 97-99 | 97_ |
| 821 | WA 90 / VM 90? | 90? |
| 2472 | VM 89-91 / BH 96-89 | 96-89 |
| 2610 | VM 91 / BH 90? | 90? |
| 3369 | BH 857-90 | 857-90 |
| 3833 | BH 90? | 90? |
| 4611 | VM 88? / BH 92 | 88? |
| 6120 | JS 9i7 / WA 96 / VM 95+ | 9i7 |

Consult the original publication or a corrected retailer export before changing these values. No intended score was guessed. The complete local audit, raw warnings and NR records are under `.local/column-g-audit/`, outside the published site.

## External review limitations

The existing approved API/JSON feed adapter, authorized CSV/Excel/JSON review imports, source search links and manual references remain supported. No permitted online score endpoint is currently configured by default, and this task did not perform live review searches or retrieve independently verified scores. All 4,747 imported ratings are explicitly retailer-reported and independently unverified. Browser source links allow manual research but are not an automatic retrieval or verification service.

## Validation

Focused parser, identity, provenance, publication/reviewer, deduplication, malformed-cell and migration tests were added. The private supplied workbook was imported, reloaded and reimported through the actual browser workflow, retaining 8,645 listings, 4,747 reviews, physical worksheet/column provenance, eight warnings and six NR markers. Final test/build results are appended after completion. No deployment was performed.

Final validation: **137 automated unit/integration tests passed**, zero failures; one optional older-workbook test was skipped because that separate fixture was not selected. **21 affected browser tests passed**, including the newly supplied column-G workbook, full import/reload/reimport, critic details, original journal/import safeguards, adjustable quality weights and CSV/Excel downloads. The other 12 browser scenarios passed in the initial full run; three optional older-reference/chart fixtures were skipped. The initial compact-label regression was corrected and the affected suite rerun successfully. Production build, JavaScript syntax checks and `git diff --check` passed. The later score-before-label safety change was covered by the automated test suite and did not change the supplied workbook's extraction results.
