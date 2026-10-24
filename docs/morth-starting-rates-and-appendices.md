# MoRTH starting rates and linked appendices

The project cost screen uses current SOR quotes for linked ingredients. Starting
costs also read stored analysis-resource price records and shortlisted SOR
options. Exact stored resource benchmarks take priority over approximate SOR
candidates when the original source resource has its own benchmark. Historical
benchmarks retain their edition and review label; changing project year never
relabels them as current SOR prices. Manual and explicit SOR selections take
priority over these defaults. No amount is invented when no stored route exists.

The missing water prices were a unit-recognition problem: the annual rows contain
81 and 109 per `1 kl`, while the MoRTH ingredients request `kL` or `KL`.
`sor_unit_measure` now recognises kilolitres and their explicit litre basis.
Mass/volume and capacity conversions remain unsupported without an explicit basis.

Selecting a MoRTH analysis loads linked appendix analyses into its recipe, without
creating extra Explorer items. Both explicit dependency codes and stored code
templates/available-code lists are supported. The material row links to an expanded
appendix breakdown on the same DATA screen. The native engine uses the appendix
direct cost where specified, avoiding a second layer of child overheads/profit.
Ingredient changes therefore reprice the appendix and its parent automatically.

Source specifications and approval notes remain visible for review beside the
starting cost. Required arithmetic inputs still need values. Missing rates or
quantities produce an incomplete known subtotal, propagated through dependencies;
the existing cost-ready gate prevents that partial value becoming a final payable
estimate/export. A resource with an explicitly zero quantity does not demand an
unused price.

Verified example: `MORTH-2019-14.01-B-i-p-medium` (RCC M25 solid slab up to 5 m)
automatically includes `MORTH-2019-21.07-medium`. At 2026–27, zone 3 the appendix
starting direct rate is ₹3,654.46/cum. Its plant starts from the stored SOR candidate
at ₹4,120/hour; its 6 cum transit mixer retains the 2019 stored benchmark of
₹2,299/hour. These are review-labelled starting assumptions. Parent haul quantities
still follow its entered haul leads.

Validation: live annual water quotes, stored source defaults, appendix-to-parent
native calculations, ingredient rate changes, incomplete propagation and native
unit tests, plus browser verification of the expanded breakdown and price labels.
