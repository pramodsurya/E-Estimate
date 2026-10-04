# Timely rates in project DATA

Create New DATA supports fixed prices and optional yearly catalogue prices. You can also create a new definition directly from a selected SOR/SSR DATA in the DATA Dashboard.

- **Whole DATA:** the checkbox enables all linked resource rows together. In a copied SSR analysis it also enables the source profit/overhead percentage.
- **Each SSR resource row:** its checkbox independently chooses the catalogue price or the saved price. Quantity, description, output quantity and row membership remain the estimator's inputs.
- **SOR DATA:** select the source SOR code, then check Timely rates to follow that code's price. Catalogue selections retain their dimensions.
- **Manual/extract rows:** use Link code to select a catalogue resource before enabling yearly prices. Formula rows follow the prices of their referenced rows.
- **Manual price edits:** typing a rate, unit or rate formula turns off that row's yearly update. Checking again adopts its saved catalogue source. A manually changed overhead can stay fixed separately.

Changing the project year or zone automatically refreshes opted-in definitions. Normal dashboard Sync uses those prices for estimates and exports. Comparative analysis independently resolves the checked rows for each column's year and leaves the real project unchanged. Unchecked rows retain their adopted prices, including when monthly material circulars are applied.

Missing catalogue prices or changed source units stop adoption and show a pending/error state with Retry rates. The resolver never uses a different year's price as a substitute. It matches SSR rows by their saved identities, rather than their order or an edited description. Fuel, hire and crew subcomponents retain their own price fields and applicable zone rates.

The built-in M25 wearing-coat DATA remains available in every project, using these same controls. The published SOR/SSR catalogue is unchanged.

Validation: `npm run test:timely-data` exercises fixed and opted-in SSR/SOR rows, catalogue dimensions, yearly prices, zone rates, machinery subcomponents, formulas, missing prices, native totals, saved source links and comparative shadow projects. `npm run test:built-in-data` covers the default M25 definition and the PDF/Excel payloads. Both use the native Rust calculator.
