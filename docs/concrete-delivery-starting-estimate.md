# MoRTH concrete transport distance

Concrete delivery records a route distance, not an SOR conveyance price. The cement/steel tariff substitute, tonne/cum selector and density conversions have been deleted. No existing-estimate migration is included.

The original MoRTH machinery row remains in DATA or its consuming appendix. Distance precedence is:

1. Manual km saved on that DATA usage and appendix path.
2. Actual km from the applied Concrete delivery route (not SOR equivalent/ghat km).
3. A labelled 1 km starting default.

Zero is a valid explicit distance. Clearing a manual value restores the applied Lead distance or default. Removing a route restores the default. DATA shows the origin beside its km control and a reminder when the default is used. Manual values survive project save/reopen and source/year refresh, without changing another usage of the same item.

For the 120 cum slab, DATA 14.01 retains `300 × L1` tonne-km. It does not convert an SOR price per cum into a price per tonne. Source reference: MoRTH SDB, Second Revision 2019, Volume I, printed pages 599–600 (PDF pages 619–620).

For a missing bare 6 cum transit-truck carriage price, the starting estimate uses the matching 6 cum truck hourly operating rate and SDB chapter 1, item 1.04(v), Case V (printed page 16 / PDF page 36): 15 tonne payload, 20 km/h loaded, 30 km/h empty return. Bare rate = hourly rate × (1/20 + 1/30) / 15 = hourly rate / 180, per tonne-km. Native DATA arithmetic owns rounding and percentages. A directly adopted tonne-km rate takes precedence. This derivation does not substitute a 2 cum SOR mixer rate or add fuel, crew, unloading, overheads or profit a second time. Historical hourly benchmarks remain starting estimates requiring review.

Fixed unloading and pumping stay in their original rows. Ingredient Lead for cement/sand/aggregate remains in the consuming appendix; the existing separate water Lead arrangement is unchanged. Other transport equipment without an established matching carriage price stays visibly incomplete rather than receiving the 6 cum truck factor.

Lead applications carry route identity/scope and no additional price. Repricing binds the kilometres to the original source parameter and recalculates native machinery, appendix dependencies, formwork allowances, overheads, profit and project rates. DATA, Typst and Excel use the resulting original machinery quantity and amount. No Supabase schema change is required: source expressions already carry the distance parameter and native formula.

Reference PDF: https://law.resource.org/pub/in/bis/irc/mort.sdb.01.2019.pdf
