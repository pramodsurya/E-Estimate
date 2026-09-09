-- Selected 15 cm Murum-bed add-on: seigniorage applies only when the
-- optional addition is selected on the eligible CAW pitching items.
with eligible(code) as (
  values
    ('IRR-CAW-8-1'),
    ('IRR-CAW-8-3'),
    ('IRR-CAW-8-5'),
    ('IRR-CAW-8-6'),
    ('IRR-CAW-8-7'),
    ('IRR-CAW-8-8'),
    ('IRR-CAW-8-9'),
    ('IRR-CAW-8-10'),
    ('IRR-CAW-8-11'),
    ('IRR-CAW-8-12'),
    ('IRR-CAW-8-13'),
    ('IRR-CAW-8-14')
)
update public.ssr_item item
set seigniorage_applicability =
  coalesce(item.seigniorage_applicability, '{}'::jsonb)
  || jsonb_build_object(
    'conditional_addons_applicable', true,
    'addons',
      coalesce(
        (
          select jsonb_agg(existing.value)
          from jsonb_array_elements(
            case
              when jsonb_typeof(item.seigniorage_applicability -> 'addons') = 'array'
                then item.seigniorage_applicability -> 'addons'
              else '[]'::jsonb
            end
          ) as existing(value)
          where existing.value ->> 'addon_id' <> 'murum_bed_15cm'
        ),
        '[]'::jsonb
      )
      || jsonb_build_array(
        jsonb_build_object(
          'addon_id', 'murum_bed_15cm',
          'applicable', true,
          'activation', jsonb_build_object(
            'type', 'ADDON_SELECTED',
            'addon_id', 'murum_bed_15cm'
          ),
          'rows', jsonb_build_array(
            jsonb_build_object(
              'mode', 'ADDON_MATERIAL_RATIO',
              'status', 'REVIEWED',
              'item_unit', 'SQM',
              'seig_code', 'SEIG_MORRAM_GRAVEL_EARTH',
              'charge_unit', 'CUM',
              'material_key', 'SOIL_MORRAM_EARTH',
              'material_code', 'P1_057',
              'material_desc', 'Murum',
              'quantity_unit', 'CUM',
              'quantity_basis', 'ITEM_QTY_X_RATIO',
              'quantity_ratio', 0.18,
              'conversion_factor', 1,
              'conversion_required', false,
              'preferred_rate_field', 'rate_per_m3',
              'source_quantity_unit', 'CUM',
              'notes', 'Selected 15 cm Murum-bed add-on: 18 CUM per 100 SQM.'
            )
          )
        )
      )
  )
from eligible
where item.code = eligible.code;

