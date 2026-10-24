# MoRTH DATA, appendices and percentages

MoRTH DATA and its focused appendix sheets share the SSR sheet typography (Calibri / Arial), page width, document header and navy rate-analysis band. Numbered resource tables use teal Materials, navy Machinery and purple Labour headers, with alternating pale rows and section-coloured totals. The native-calculated Abstract highlights direct cost, total cost and the per-unit rate. Narrow views retain readable columns with table scrolling. Resource rates and calculation inputs are opened through the row's Edit button. Appendix links switch to a focused sheet rather than expanding nested tables.

## Shared appendices

Only dependencies of DATA included in the export are collected. A dependency graph is traversed once per analysis; equal codes, effective component quantities/rates, calculation rules and native abstracts share an appendix. Unused parent parameters do not create duplicate sheets. Genuinely different configurations retain separate labelled analyses. No extra Explorer items or project DATA rows are inserted.

Typst renders the shared MoRTH Appendix section after the main DATA analyses, with internal links from resource rows. Document Preparation uses the same JSON adapter/template. Both previous unedited built-in DATA templates are upgraded when loaded, preserving page/font settings; customized Typst scripts are retained. Print completeness auditing includes appendix resource rows.

Typst uses the same configured font and size as SSR, compact printed table spacing, matching section colours and a navy analysis band. Excel retains the SSR export font (Trebuchet MS), with the same section palette and highlighted abstract totals.

Excel uses MoRTH Items and MoRTH Appendix worksheets. Parent rates reference named appendix direct/full rate cells; quantity × rate, subtotals, percentage bases and the abstract use live formulas with native cached values. A direct-only reference uses the unrounded appendix direct cost divided by its output quantity, so child profit is not charged again. Project component rate links continue to point to each final adopted rate, including Lead where applicable.

## Miscellaneous

Individual Costs has Materials, Machinery, Labour and Miscellaneous tabs. Only rules used by project DATA and its active appendices are listed. The source owner, rule, basis and published default identify each shared setting. SSR retains its published combined contractor-profit/overhead rule. MoRTH overheads, contractor profit and named percentage allowances remain separate; zero-markup appendix rules are separate groups. Conditional allowances can be enabled or disabled and entered up to their printed maximum.

Overrides persist in project.meta.miscellaneousCosts; conditional and quantity selections persist in morthParameters. Changing either invalidates dashboard context and recompiles project costs. Percentage-only SSR changes bypass the published-rate shortcut; saved local quantities/rates are retained while cached abstracts are rebuilt. Export refreshes stale saved analyses before rendering. Source defaults can be restored. No Supabase catalogue rows are changed by a project override.

## Verification

- scripts/test-morth-presentation.cjs checks shared/nested deduplication, unused parameters, configuration isolation, source-separated percentages, appendix markup boundaries, native abstracts, linked Typst output, print completeness and Excel payloads.
- Add --excel to compile a real native workbook and verify its appendix formulas and defined names.
- Live fixture coverage uses scripts/test-morth-appendix.cjs.
- Excel COM recalculation was compared against the native calculator: a shared cement increase of 100 changed both sample slab rates from 6075.18 to 6139.04. The sample uses explicit zero haul inputs.
