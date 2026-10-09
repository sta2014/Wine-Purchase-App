# Quality coverage audit — unpublished revision

This audit reruns the latest supplied Flickinger workbook against the original implementation and the revised implementation, using the same 466 real assessments transcribed from the 15 supplied Wine Spectator charts. It covers 8,645 available offers and 7,978 unique wine/vintage identities. Different package formats count once in identity coverage. This is a local audit, not a read of your browser database or a deployed change.

## Result

| Measure | Before | After | Change |
|---|---:|---:|---:|
| Professional critic-score coverage | 2,395 | 2,398 | +3 |
| Multiple professional publications | 1,394 | 1,395 | +1 |
| Independently verified professional reviews | 0 | 0 | 0 |
| Regional vintage assessments | 6,349 | 6,421 | +72 |
| Missing professional critic scores | 5,583 | 5,580 | −3 |
| Missing vintage assessments | 1,629 | 1,557 | −72 |

Critic coverage is 30.06%; vintage coverage is 80.48%. All 8,645 asking prices are unchanged. There are 1,927 identities with all three components and 2,150 with sufficient evidence under the documented reliability rules. Complete components do not mean independently verified critic evidence. All current professional scores originate in the retailer export.

## Implementation

CellarTracker has been removed from sources, settings, ranking, templates and retrieval controls. Existing adjustable controls now default to 60% professional critic scores, 25% regional vintage quality and 15% professional critic consensus/confidence. Missing components stay null; available weights are reweighted and coverage/confidence remain visible. Asking prices remain visible and filterable but do not influence quality ranking. External price retrieval was removed as requested in the quality-refactor task.

The current website, journal, spreadsheet import, package distinctions, filters, source evidence, identity review, backups and history are preserved. The revision adds current-filter/current-weight CSV and Excel shortlists of 15, 25, 50 or a custom number of unique wine/vintage identities. Browser and SQLite migrations retain recoverable pre-refactor copies. No production database was migrated.

## Critic gaps: established causes versus unknowns

Three genuine identity-context failures were corrected: 1990 Ducru-Beaucaillou reconditioned in 2021, and 2022 Marsau and Mouton-Rothschild labelled 2023 en-primeur release. Explicit reconditioning/release dates no longer count as another wine vintage. Genuine conflicting vintages remain rejected. Reimport repairs stored context warnings without changing wine/listing/review IDs, prices or provenance.

| Remaining cause | Identities | Interpretation |
|---|---:|---|
| No usable score supplied | 5,574 | No independent per-wine search was performed; review availability is unknown. |
| Explicit Vinous “NR” | 5 | Cappellano Pie Franco 2016 and Pie Rupestris 2011, 2013, 2014, 2015. Other publications remain unknown. |
| Malformed score | 1 | 2013 Domaine de Montille Volnay Les Mitans: “BH 857-90”. The intended value must be confirmed from the source. |
| Demonstrated per-wine search failures | 0 | There were no live per-wine searches to fail. |
| Reviews proven unavailable across publications | 0 | Missing export data is not proof no review exists. |

Source restrictions are a separate access issue, not a fabricated root cause assigned to thousands of records: Wine Enthusiast's robots request returned an access-challenge document; it was not bypassed. James Suckling's robots file allowed paths, but that does not establish terms clearance or an approved score feed. No licensed/API endpoint or authorized external review dataset is configured. No independently verified scores were fetched in this task.

Permitted ingestion was expanded to accept wide professional-score reference exports (WA/VN/JS/etc.) as well as the existing long-form import, with retained publication, score ranges, stage, scale, source reference and verification status. The Wine Independent aliases are supported. A reference must be supplied before marking a score independently verified. The approved JSON feed interface remains available if an authorized endpoint is later provided. No new retrieval infrastructure, paywall access, guessed values or weaker match thresholds were introduced.

## Prioritized critic reference requests

An export or spreadsheet you are permitted to use is most efficient; screenshots or individual review references are also usable. Include producer, exact wine/cuvée/vineyard, vintage (including NV/MV when applicable), publication, original score/scale/range, final versus barrel status, and source URL/reference. Do not buy subscriptions solely on the expectation they provide an API or bulk-export right.

| Priority | Specific material | Currently missing identities |
|---|---|---:|
| 1 | Burgundy: Burghound, Jasper Morris / Inside Burgundy, or Vinous wine-by-wine reports matched to the missing producer/cuvée/year list | 3,213 |
| 2 | Piedmont Barolo/Barbaresco: Vinous or Wine Advocate reviews | 801 |
| 3 | Northern/Southern Rhône: Wine Advocate, Vinous or Jeb Dunnuck reviews | 380 |
| 4 | Tuscany / Brunello: Wine Advocate, Vinous or James Suckling reviews | 329 |
| 5 | Other Italian wines: wine-by-wine references with appellation labels | 302 |
| 6 | Champagne: Wine Advocate or Vinous, including release/disgorgement detail for NV/MV | 217 |
| 7 | Bordeaux: Wine Advocate, Vinous, Wine Spectator, Decanter or James Suckling | 195 |

These counts are inventory gaps, not promises that any publication covers every wine. Lower-priority gaps: Germany 79, Veneto 34, California 23, Sicily 7. The exact missing-wine request list is kept locally in `.local/quality-audit/missing-critics.csv` and JSON, outside the published website.

## Vintage matching fixes and remaining gaps

72 identities gained an assessment; none lost a previously matched assessment. Geography fixes include Fixin, Marsannay, Côte de Nuits Villages, La Grande Rue, Clos des Lambrays and Bordeaux right-bank appellation aliases. Producer-name collisions (Domaine du Clos de Tart; Marchesi di Barolo) and the Gevrey lieu-dit Aux Échezeaux no longer imply an unrelated appellation. Genuine geographic contradictions stay flagged. Côte de Nuits charts are not assigned to Côte de Beaune reds; Chianti charts are not assigned to Super Tuscans; California Cabernet charts are not assigned to unidentified red blends.

Of 1,557 remaining gaps, 47 are NV/MV and intentionally have no normal vintage assessment; 1,510 are dated wines needing additional chart scope, missing years, more precise geography/style, or review of conflicting metadata.

| Mapped region | Missing identities including NV/MV |
|---|---:|
| Burgundy | 650 |
| Italy | 507 |
| Tuscany | 92 |
| California | 90 |
| Piedmont | 77 |
| Champagne | 56 |
| Veneto | 34 |
| Rhône | 20 |
| Bordeaux | 17 |
| Sicily | 11 |
| Germany | 3 |

## Prioritized vintage materials

1. **Côte de Beaune red chart**: 573 missing identities in that mapped subregion, especially Volnay, Corton, Pommard and Beaune. Supply the full chart with its actual years and red-wine scope. The provided Côte de Nuits chart is a different scope.
2. **Bolgheri/coastal Tuscany and other Tuscan red charts, plus wine appellation/style references**: 507 wines currently mapped only to Italy and 92 to Tuscany. Names such as Sassicaia, Ornellaia, Masseto and Tignanello require supported wine-specific geography/style references; no producer-region guess was applied. The Chianti chart cannot cover them automatically.
3. **Updated Barolo/Barbaresco chart**: 77 Piedmont gaps, especially 2022 and 2023, plus older years and Langhe styles outside the chart scope. Supply ratings only where the publication actually provides them.
4. **California styles and confirmed grape information**: 90 gaps, mostly unidentified red blends, Syrah and other styles. Existing Cabernet/Franc, Pinot Noir and Chardonnay charts remain loaded; additional copies will not fix unsupported styles.
5. **Updated vintage Champagne years**: 15 dated gaps; 41 NV Champagne identities intentionally remain without a vintage score.
6. **Veneto/Amarone and Sicily/Etna charts**: 34 and 11 identities respectively, with explicit red/white scope.
7. **Older/missing Bordeaux, Rhône and Germany years or more specific regional charts**: see the exact year appendix before collecting data. Some Rhône geographic conflicts require correcting wine metadata rather than another chart.

Keep headers, source name, edition date when available, score scale/legend, years, region/subregion and wine style visible. Screenshots, PDF or Excel are acceptable; no coding or template preparation is required. No year is filled from an adjacent year. Updated chart observations retain history.

## Exact region/appellation/year appendix

Counts below use unique identities and include explicit NV/MV markers. “Unspecified” means the existing file/title cannot establish a precise appellation; a wine-specific reference is needed before chart matching.

| Region | Appellation | Year / marker | Missing identities |
|---|---|---|---:|
| Bordeaux | Unspecified | 2007 | 1 |
| Bordeaux | Unspecified | 2013 | 1 |
| Bordeaux | Unspecified | 2015 | 1 |
| Bordeaux | Unspecified | 2016 | 2 |
| Bordeaux | Unspecified | 2017 | 2 |
| Bordeaux | Unspecified | 2020 | 1 |
| Bordeaux | Unspecified | NV | 5 |
| Bordeaux | Saint-Julien | 1982 | 1 |
| Bordeaux | Saint-Julien | 1990 | 2 |
| Bordeaux | Saint-Émilion | 1993 | 1 |
| Burgundy | Unspecified | 2001 | 1 |
| Burgundy | Unspecified | 2003 | 1 |
| Burgundy | Unspecified | 2005 | 1 |
| Burgundy | Unspecified | 2009 | 1 |
| Burgundy | Unspecified | 2013 | 2 |
| Burgundy | Unspecified | 2014 | 3 |
| Burgundy | Unspecified | 2015 | 1 |
| Burgundy | Unspecified | 2017 | 5 |
| Burgundy | Unspecified | 2018 | 5 |
| Burgundy | Unspecified | 2019 | 10 |
| Burgundy | Unspecified | 2020 | 10 |
| Burgundy | Unspecified | 2021 | 11 |
| Burgundy | Unspecified | 2022 | 11 |
| Burgundy | Unspecified | 2023 | 16 |
| Burgundy | Aloxe-Corton | 2018 | 1 |
| Burgundy | Aloxe-Corton | 2020 | 1 |
| Burgundy | Auxey-Duresses | 2016 | 1 |
| Burgundy | Auxey-Duresses | 2017 | 1 |
| Burgundy | Auxey-Duresses | 2018 | 1 |
| Burgundy | Auxey-Duresses | 2019 | 2 |
| Burgundy | Auxey-Duresses | 2020 | 2 |
| Burgundy | Auxey-Duresses | 2021 | 1 |
| Burgundy | Auxey-Duresses | 2022 | 1 |
| Burgundy | Auxey-Duresses | 2023 | 2 |
| Burgundy | Beaune | 1995 | 1 |
| Burgundy | Beaune | 2010 | 1 |
| Burgundy | Beaune | 2011 | 1 |
| Burgundy | Beaune | 2012 | 1 |
| Burgundy | Beaune | 2013 | 1 |
| Burgundy | Beaune | 2015 | 1 |
| Burgundy | Beaune | 2016 | 8 |
| Burgundy | Beaune | 2017 | 6 |
| Burgundy | Beaune | 2018 | 10 |
| Burgundy | Beaune | 2019 | 8 |
| Burgundy | Beaune | 2020 | 8 |
| Burgundy | Beaune | 2021 | 6 |
| Burgundy | Beaune | 2022 | 9 |
| Burgundy | Beaune | 2023 | 3 |
| Burgundy | Beaune | MV | 1 |
| Burgundy | Chassagne-Montrachet | 2017 | 1 |
| Burgundy | Chassagne-Montrachet | 2018 | 1 |
| Burgundy | Chassagne-Montrachet | 2019 | 1 |
| Burgundy | Chassagne-Montrachet | 2020 | 1 |
| Burgundy | Chassagne-Montrachet | 2022 | 1 |
| Burgundy | Chorey-lès-Beaune | 2017 | 1 |
| Burgundy | Chorey-lès-Beaune | 2019 | 1 |
| Burgundy | Chorey-lès-Beaune | 2022 | 1 |
| Burgundy | Corton | 2001 | 1 |
| Burgundy | Corton | 2005 | 2 |
| Burgundy | Corton | 2006 | 1 |
| Burgundy | Corton | 2009 | 2 |
| Burgundy | Corton | 2010 | 1 |
| Burgundy | Corton | 2011 | 6 |
| Burgundy | Corton | 2012 | 6 |
| Burgundy | Corton | 2013 | 7 |
| Burgundy | Corton | 2014 | 12 |
| Burgundy | Corton | 2015 | 8 |
| Burgundy | Corton | 2016 | 16 |
| Burgundy | Corton | 2017 | 17 |
| Burgundy | Corton | 2018 | 16 |
| Burgundy | Corton | 2019 | 17 |
| Burgundy | Corton | 2020 | 18 |
| Burgundy | Corton | 2021 | 17 |
| Burgundy | Corton | 2022 | 16 |
| Burgundy | Corton | 2023 | 4 |
| Burgundy | Monthélie | 2012 | 1 |
| Burgundy | Pommard | 2000 | 1 |
| Burgundy | Pommard | 2001 | 1 |
| Burgundy | Pommard | 2004 | 1 |
| Burgundy | Pommard | 2005 | 1 |
| Burgundy | Pommard | 2008 | 3 |
| Burgundy | Pommard | 2009 | 2 |
| Burgundy | Pommard | 2010 | 4 |
| Burgundy | Pommard | 2011 | 3 |
| Burgundy | Pommard | 2012 | 1 |
| Burgundy | Pommard | 2013 | 2 |
| Burgundy | Pommard | 2014 | 3 |
| Burgundy | Pommard | 2015 | 4 |
| Burgundy | Pommard | 2016 | 6 |
| Burgundy | Pommard | 2017 | 14 |
| Burgundy | Pommard | 2018 | 10 |
| Burgundy | Pommard | 2019 | 12 |
| Burgundy | Pommard | 2020 | 7 |
| Burgundy | Pommard | 2021 | 5 |
| Burgundy | Pommard | 2022 | 10 |
| Burgundy | Pommard | 2023 | 5 |
| Burgundy | Santenay | 2011 | 1 |
| Burgundy | Santenay | 2020 | 2 |
| Burgundy | Savigny-lès-Beaune | 2009 | 1 |
| Burgundy | Savigny-lès-Beaune | 2017 | 1 |
| Burgundy | Savigny-lès-Beaune | 2018 | 1 |
| Burgundy | Savigny-lès-Beaune | 2019 | 4 |
| Burgundy | Savigny-lès-Beaune | 2020 | 3 |
| Burgundy | Savigny-lès-Beaune | 2021 | 2 |
| Burgundy | Savigny-lès-Beaune | 2022 | 5 |
| Burgundy | Savigny-lès-Beaune | 2023 | 2 |
| Burgundy | Volnay | 2004 | 1 |
| Burgundy | Volnay | 2005 | 1 |
| Burgundy | Volnay | 2006 | 1 |
| Burgundy | Volnay | 2008 | 1 |
| Burgundy | Volnay | 2009 | 1 |
| Burgundy | Volnay | 2011 | 3 |
| Burgundy | Volnay | 2012 | 5 |
| Burgundy | Volnay | 2013 | 3 |
| Burgundy | Volnay | 2014 | 7 |
| Burgundy | Volnay | 2015 | 6 |
| Burgundy | Volnay | 2016 | 19 |
| Burgundy | Volnay | 2017 | 32 |
| Burgundy | Volnay | 2018 | 23 |
| Burgundy | Volnay | 2019 | 17 |
| Burgundy | Volnay | 2020 | 25 |
| Burgundy | Volnay | 2021 | 16 |
| Burgundy | Volnay | 2022 | 21 |
| Burgundy | Volnay | 2023 | 19 |
| California | Unspecified | 1990 | 1 |
| California | Unspecified | 2002 | 1 |
| California | Unspecified | 2004 | 1 |
| California | Unspecified | 2005 | 2 |
| California | Unspecified | 2006 | 1 |
| California | Unspecified | 2007 | 2 |
| California | Unspecified | 2008 | 7 |
| California | Unspecified | 2009 | 9 |
| California | Unspecified | 2010 | 13 |
| California | Unspecified | 2011 | 14 |
| California | Unspecified | 2012 | 3 |
| California | Unspecified | 2013 | 3 |
| California | Unspecified | 2014 | 8 |
| California | Unspecified | 2015 | 7 |
| California | Unspecified | 2016 | 4 |
| California | Unspecified | 2017 | 4 |
| California | Unspecified | 2018 | 5 |
| California | Unspecified | 2019 | 3 |
| California | Unspecified | 2020 | 1 |
| California | Unspecified | 2022 | 1 |
| Champagne | Unspecified | 2020 | 7 |
| Champagne | Unspecified | 2021 | 6 |
| Champagne | Unspecified | 2022 | 2 |
| Champagne | Unspecified | N.V. | 1 |
| Champagne | Unspecified | NV | 40 |
| Germany | Unspecified | 2018 | 2 |
| Germany | Unspecified | 2019 | 1 |
| Italy | Unspecified | 1993 | 1 |
| Italy | Unspecified | 1995 | 1 |
| Italy | Unspecified | 2001 | 5 |
| Italy | Unspecified | 2002 | 2 |
| Italy | Unspecified | 2003 | 5 |
| Italy | Unspecified | 2004 | 9 |
| Italy | Unspecified | 2005 | 6 |
| Italy | Unspecified | 2006 | 8 |
| Italy | Unspecified | 2007 | 13 |
| Italy | Unspecified | 2008 | 19 |
| Italy | Unspecified | 2009 | 11 |
| Italy | Unspecified | 2010 | 17 |
| Italy | Unspecified | 2011 | 21 |
| Italy | Unspecified | 2012 | 13 |
| Italy | Unspecified | 2013 | 25 |
| Italy | Unspecified | 2014 | 18 |
| Italy | Unspecified | 2015 | 26 |
| Italy | Unspecified | 2016 | 36 |
| Italy | Unspecified | 2017 | 37 |
| Italy | Unspecified | 2018 | 33 |
| Italy | Unspecified | 2019 | 48 |
| Italy | Unspecified | 2020 | 44 |
| Italy | Unspecified | 2021 | 43 |
| Italy | Unspecified | 2022 | 40 |
| Italy | Unspecified | 2023 | 25 |
| Italy | Unspecified | 2024 | 1 |
| Piedmont | Unspecified | 2007 | 1 |
| Piedmont | Unspecified | 2010 | 1 |
| Piedmont | Unspecified | 2013 | 2 |
| Piedmont | Unspecified | 2014 | 1 |
| Piedmont | Unspecified | 2018 | 2 |
| Piedmont | Unspecified | 2019 | 2 |
| Piedmont | Unspecified | 2020 | 5 |
| Piedmont | Unspecified | 2021 | 4 |
| Piedmont | Unspecified | 2022 | 4 |
| Piedmont | Unspecified | 2023 | 2 |
| Piedmont | Barbaresco | 2022 | 13 |
| Piedmont | Barbaresco | 2023 | 10 |
| Piedmont | Barolo | 2022 | 30 |
| Rhône | Unspecified | 2020 | 1 |
| Rhône | Unspecified | 2021 | 3 |
| Rhône | Unspecified | 2022 | 2 |
| Rhône | Unspecified | 2023 | 2 |
| Rhône | Côtes du Rhône | 2011 | 1 |
| Rhône | Côtes du Rhône | 2018 | 1 |
| Rhône | Côtes du Rhône | 2019 | 1 |
| Rhône | Côtes du Rhône | 2020 | 2 |
| Rhône | Côtes du Rhône | 2021 | 1 |
| Rhône | Côtes du Rhône | 2022 | 1 |
| Rhône | Côtes du Rhône | 2023 | 1 |
| Rhône | Côtes du Rhône Villages | 2007 | 1 |
| Rhône | Côtes du Rhône Villages | 2022 | 1 |
| Rhône | Côtes du Rhône Villages | 2023 | 1 |
| Rhône | Saint-Péray | 2024 | 1 |
| Sicily | Etna | 2014 | 3 |
| Sicily | Etna | 2016 | 1 |
| Sicily | Etna | 2017 | 1 |
| Sicily | Etna | 2019 | 3 |
| Sicily | Etna | 2021 | 2 |
| Sicily | Etna | 2023 | 1 |
| Tuscany | Unspecified | 2008 | 1 |
| Tuscany | Unspecified | 2009 | 1 |
| Tuscany | Unspecified | 2010 | 2 |
| Tuscany | Unspecified | 2011 | 4 |
| Tuscany | Unspecified | 2012 | 5 |
| Tuscany | Unspecified | 2013 | 4 |
| Tuscany | Unspecified | 2014 | 4 |
| Tuscany | Unspecified | 2015 | 6 |
| Tuscany | Unspecified | 2016 | 4 |
| Tuscany | Unspecified | 2017 | 5 |
| Tuscany | Unspecified | 2018 | 8 |
| Tuscany | Unspecified | 2019 | 7 |
| Tuscany | Unspecified | 2020 | 8 |
| Tuscany | Unspecified | 2021 | 10 |
| Tuscany | Unspecified | 2022 | 2 |
| Tuscany | Unspecified | 2023 | 1 |
| Tuscany | Bolgheri | 2010 | 1 |
| Tuscany | Bolgheri | 2011 | 1 |
| Tuscany | Bolgheri | 2012 | 2 |
| Tuscany | Bolgheri | 2013 | 1 |
| Tuscany | Bolgheri | 2014 | 1 |
| Tuscany | Bolgheri | 2015 | 2 |
| Tuscany | Bolgheri | 2016 | 3 |
| Tuscany | Bolgheri | 2017 | 1 |
| Tuscany | Bolgheri | 2018 | 1 |
| Tuscany | Bolgheri | 2019 | 1 |
| Tuscany | Bolgheri | 2020 | 1 |
| Tuscany | Bolgheri | 2021 | 2 |
| Tuscany | Bolgheri | 2022 | 2 |
| Tuscany | Bolgheri | 2023 | 1 |
| Veneto | Unspecified | 2023 | 1 |
| Veneto | Amarone della Valpolicella | 2004 | 1 |
| Veneto | Amarone della Valpolicella | 2007 | 1 |
| Veneto | Amarone della Valpolicella | 2008 | 1 |
| Veneto | Amarone della Valpolicella | 2009 | 4 |
| Veneto | Amarone della Valpolicella | 2010 | 1 |
| Veneto | Amarone della Valpolicella | 2011 | 2 |
| Veneto | Amarone della Valpolicella | 2012 | 2 |
| Veneto | Amarone della Valpolicella | 2013 | 2 |
| Veneto | Amarone della Valpolicella | 2015 | 2 |
| Veneto | Amarone della Valpolicella | 2016 | 3 |
| Veneto | Amarone della Valpolicella | 2017 | 4 |
| Veneto | Amarone della Valpolicella | 2018 | 6 |
| Veneto | Amarone della Valpolicella | 2019 | 2 |
| Veneto | Amarone della Valpolicella | 2020 | 2 |

Full record lists, parsing warnings, grouped counts and gain/loss evidence are retained privately in `.local/quality-audit/`. They contain no invented ratings. No changes have been deployed or pushed.

## Validation and environment setup

128 Node unit/integration tests passed, with no failures or skips, including the authorized private reference workbook. The 35 desktop browser scenarios have all passed: the full run passed 34, and the remaining vintage explanation assertion was updated to check the actual three-factor table and passed on a targeted rerun (both vintage scenarios passed). The private workbook import/reload/reimport and chart-pack tests passed. CSV and real Excel exports were downloaded and read back successfully. The production build, JavaScript syntax checks and `git diff --check` passed.

The latest 8,645-offer workbook was independently rerun for the coverage figures above; the browser regression fixture is the older 8,648-offer workbook. These dataset counts are intentionally distinguished.

A temporary SQLite service was started and verified through health, settings, frontend and removed-route requests, without opening the user's personal database. The Vite development frontend was also started and checked. Tested installation/startup instructions were saved as an environment configuration draft; saving did not publish the environment or the application. Existing published `docs/` output remains unchanged.
