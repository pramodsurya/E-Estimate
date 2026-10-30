# Individual Items output

The Individual Costs page offers Typist Preview and Excel. Apply staged rate changes first. Preview uses all project resources, grouped into Materials, Machinery and Labour, with orange MoRTH and yellow SSR source labels. Its saved Typst layout is reused for the Individual Items section appended to the final project book.

Excel from this page contains the DATA sheets and a separate Individual Items sheet. The regular DATA export and final project workbook include that sheet too. Edit its blue Rate cells to update linked DATA amounts, section totals, percentage allowances, appendix rates and project abstracts. Source identities, units and differing adopted rates retain separate input cells; local DATA overrides retain their own cells. Explicit amount overrides remain fixed amounts. Published SSR amounts and subtotals are retained until their contributing inputs change, preserving the application's source arithmetic.

MoRTH's 6 cum transit agitator carriage rate retains its hourly-rate / 180 formula. Changing the hourly input also updates that derived resource rate. No separate fuel or journey charge is introduced by the workbook export.

Excel changes belong to the exported workbook; they do not write back into the app. Use Individual Costs in the app to change the saved project.

Validation: `npm run test:individual-items-output` builds the workbook with the native Excel compiler, recalculates after edits, verifies SSR allowance, MoRTH appendix and truck dependencies, separate local rates, the project abstract, and an audited Typst PDF. The desktop native binary must have been rebuilt. Additional validation uses Excel's own full recalculation and PDF export. QA artifacts are under `output/individual-items-qa/`.
