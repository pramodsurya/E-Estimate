// SLRB detail injection. The component host owns banner, abstract and signatures.
= SLRB — adopted measurements
#text(9pt)[#SLRB.version · #SLRB.source_status source]
#parbreak()
#strong[Measurements:] #SLRB.readiness.measurements \
#strong[Rate items:] #SLRB.readiness.mappings \
#strong[Design checks:] #SLRB.readiness.design
#parbreak()
Reference: #SLRB.reference \
Saved location: #SLRB.location \
Height context: #SLRB.context
#if SLRB.canal != none [
  #parbreak()
  Canal bed RL: #SLRB.canal.bed; full supply RL: #SLRB.canal.fsl; bank RL: #SLRB.canal.bank.
]
#parbreak()
#text(9pt)[#SLRB.design_review]
#if SLRB.drawing != "" [#image.decode(bytes(SLRB.drawing), width: 100%)]
#table(
  columns: (0.7fr, 1.5fr, 2fr, 0.7fr, 0.5fr, 1fr),
  inset: 4pt,
  table.header([*Member*], [*Work*], [*Measurement*], [*Quantity*], [*Unit*], [*Code / status*]),
  ..SLRB.rows.map(row => (
    [#row.member], [#row.label], [#row.expression],
    [#if row.quantity == none [Pending] else [#str(calc.round(row.quantity, digits: 3))]],
    [#row.unit], [#if row.code == "" [#row.status] else [#row.code \ #row.status]],
  )).flatten(),
)
#if SLRB.issues.len() > 0 [
  == Information still needed
  #for issue in SLRB.issues [#issue #parbreak()]
]
