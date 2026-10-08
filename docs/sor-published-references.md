# Published SOR references

The generated `sor_catalogue_item.item_code` identifies a catalogue cell internally.
It is not a printed SOR item number. Display references must come from the source.

## Supabase inspection on 2026-10-08

- `sor_catalogue.name` holds the catalogue/table name.
- `sor_catalogue_item.source_context` retains `headers`, `raw_row`, `title` and contextual headings.
- `sor_catalogue_rate` retains the SOR year and source page.
- All 13,440 catalogue cells inspected retained raw rows and headers. Only 965 cells had
  a nonblank cell under a recognized serial-number header; many are rate matrices.
- The example `RB_WORK_6411571526E0` is Roads and Bridges work items, printed
  Sl. No. **230**, S.S. item **b**, 50 mm thickness, SOR 2026–27, page **96**.
  Context includes `(S ) ROAD WORK ITEMS` and `1 (I ) HARD METAL`.
- There are 149 RB_WORK cells; 137 have a nonblank printed serial. Missing values
  must not be filled using a hash, matrix `row_key`, or `sort_order`.

The road selector and its measured-item summary now display table name and printed
serial. Matrix cells without a serial display the printed table title, row and
column labels. Selection from either catalogue picker retains this reference in
the project. Older road selections look up their metadata once per item/year,
without changing project quantities or triggering recalculation.

## Extractor/import contract

The extractor source is not present in this application workspace. A future update
should explicitly retain these source fields, rather than making the application
recover them repeatedly from raw arrays:

```json
{
  "table_name": "(S) ROAD WORK ITEMS",
  "serial_number": "230",
  "schedule_item_number": "b"
}
```

Also retain parent item/subheading references (for example `1 (I) HARD METAL`),
row/column labels for matrices, the source page, SOR year, and raw extraction evidence.
Keep printed numbering as text to preserve letters and subitems. Leave an absent
serial empty. Store these references for each year's publication: current item-level
`source_context` is shared by all annual rate rows, so it cannot prove that a printed
serial remained the same across different SOR editions. Annual rate metadata/RPCs
should return the reference for the selected year when the extractor is updated.

No database records, rates, item identities, or extractor code were changed by this UI update.
