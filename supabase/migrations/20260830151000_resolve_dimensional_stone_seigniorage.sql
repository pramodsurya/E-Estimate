-- Convert reviewed dimensional stone resources to the CUM basis used by the
-- Building Stone seigniorage schedule. Piece volumes use their published
-- dimensions; pitching volumes use the same 1.10 loose-stone factor published
-- by CAW-8-8 (45 cm x 1.10 = 0.495 CUM/SQM).

do $migration$
declare
  mapping record;
  item_policy jsonb;
  array_key text;
  rewritten_rows jsonb;
begin
  for mapping in
    select * from (values
      -- code, equivalent recipe CUM, output ratio CUM per item unit, audit note
      ('IRR-CAW-7-4',  0.96000000::numeric, 0.03000000::numeric,
        '32 stones x 0.20 x 0.20 x 0.75 m = 0.96 CUM per 32 NOS.'),
      ('IRR-CAW-8-11', 33.00000000, 0.33000000,
        '30 cm pitching x published loose-stone factor 1.10 = 0.33 CUM/SQM.'),
      ('IRR-CAW-8-12', 49.50000000, 0.49500000,
        '45 cm pitching x published loose-stone factor 1.10 = 0.495 CUM/SQM.'),
      ('IRR-CAW-8-13', 33.00000000, 0.33000000,
        '30 cm pitching x published loose-stone factor 1.10 = 0.33 CUM/SQM.'),
      ('IRR-CAW-8-14', 49.50000000, 0.49500000,
        '45 cm pitching x published loose-stone factor 1.10 = 0.495 CUM/SQM.'),
      ('IRR-CCDW-4-3', 11.06250000, 1.10625000,
        '60 x 25x25x45 cm + 180 x 25x25x30 cm + 4.50 CUM rubble + 1.50 CUM chips.'),
      ('IRR-CCDW-4-4', 11.06250000, 1.10625000,
        '60 x 25x25x45 cm + 180 x 25x25x30 cm + 4.50 CUM rubble + 1.50 CUM chips.'),
      ('IRR-CCDW-5-1', 1.05000000, 0.10500000,
        '10.50 SQM of 10 cm slab = 1.05 CUM per 10 SQM output.'),
      ('IRR-CCDW-5-2', 1.05000000, 0.10500000,
        '10.50 SQM of 10 cm slab = 1.05 CUM per 10 SQM output.'),
      ('IRR-CCDW-5-3', 1.05000000, 0.10500000,
        '10.50 SQM of 10 cm slab = 1.05 CUM per 10 SQM output.'),
      ('IRR-DAW-3-3', 26.81000000, 1.07240000,
        '244 x 30x30x45 cm + 82 x 30x30x60 cm + 8.75 CUM rubble + 3.75 CUM chips.'),
      ('IRR-DAW-3-4', 26.81000000, 1.07240000,
        '244 x 30x30x45 cm + 82 x 30x30x60 cm + 8.75 CUM rubble + 3.75 CUM chips.'),
      ('IRR-DAW-3-5', 27.21500000, 1.08860000,
        '250 x 30x30x45 cm + 85 x 30x30x60 cm + 8.75 CUM rubble + 3.75 CUM chips.'),
      ('IRR-DAW-3-6', 27.21500000, 1.08860000,
        '250 x 30x30x45 cm + 85 x 30x30x60 cm + 8.75 CUM rubble + 3.75 CUM chips.'),
      ('IRR-PMW-2-10', 0.54000000, 0.03000000,
        '18 stones x 0.20 x 0.20 x 0.75 m = 0.54 CUM per 18 NOS.'),
      ('IRR-PMW-2-11', 0.55000000, 0.05500000,
        '10 stones x 0.20 x 0.20 x 0.75 m + 0.15 + 0.10 CUM aggregate.'),
      ('IRR-PMW-2-12', 1.02000000, 1.02000000,
        'One 20x20x75 cm stone + 0.50 + 0.20 CUM aggregate + 0.25 CUM rubble + 0.04 CUM chips.')
    ) as reviewed(code, recipe_cum, quantity_ratio, audit_note)
  loop
    select seigniorage_applicability into item_policy
    from public.ssr_item
    where code = mapping.code;

    if item_policy is null then
      continue;
    end if;

    foreach array_key in array array['rows', 'materials']
    loop
      if jsonb_typeof(item_policy -> array_key) <> 'array' then
        continue;
      end if;

      select coalesce(jsonb_agg(
        case
          when value ->> 'status' = 'REVIEW_REQUIRED'
            and upper(coalesce(value ->> 'material_key', '')) = 'STONE_AGGREGATE'
          then value || jsonb_build_object(
            'status', 'REVIEWED',
            'seig_code', 'SEIG_BUILDING_STONE',
            'charge_unit', 'CUM',
            'quantity_unit', 'CUM',
            'recipe_material_unit', 'CUM',
            'recipe_material_qty', mapping.recipe_cum,
            'quantity_ratio', mapping.quantity_ratio,
            'conversion_factor', 1,
            'conversion_required', false,
            'preferred_rate_field', 'rate_per_m3',
            'notes', mapping.audit_note
          )
          else value
        end
      ), '[]'::jsonb)
      into rewritten_rows
      from jsonb_array_elements(item_policy -> array_key);

      item_policy := jsonb_set(item_policy, array[array_key], rewritten_rows, false);
    end loop;

    update public.ssr_item
    set seigniorage_applicability = item_policy
    where code = mapping.code;
  end loop;

  -- The remaining slab item permits 25-40 mm thickness. A single automatic
  -- CUM factor would be false precision, so expose the actual missing choice.
  select seigniorage_applicability into item_policy
  from public.ssr_item
  where code = 'IRR-CAW-7-27';

  if item_policy is not null then
    foreach array_key in array array['rows', 'materials']
    loop
      if jsonb_typeof(item_policy -> array_key) <> 'array' then
        continue;
      end if;
      select coalesce(jsonb_agg(
        case
          when value ->> 'status' = 'REVIEW_REQUIRED'
          then (value - 'conversion_factor') || jsonb_build_object(
            'conversion_required', true,
            'notes', 'Select the adopted slab thickness (25-40 mm) to convert 1.05 SQM of slab per SQM output into CUM.'
          )
          else value
        end
      ), '[]'::jsonb)
      into rewritten_rows
      from jsonb_array_elements(item_policy -> array_key);
      item_policy := jsonb_set(item_policy, array[array_key], rewritten_rows, false);
    end loop;
    update public.ssr_item
    set seigniorage_applicability = item_policy
    where code = 'IRR-CAW-7-27';
  end if;
end
$migration$;

do $verify$
begin
  if (
    select count(*)
    from public.ssr_item item
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(item.seigniorage_applicability -> 'rows') = 'array'
          then item.seigniorage_applicability -> 'rows'
        else coalesce(item.seigniorage_applicability -> 'materials', '[]'::jsonb)
      end
    ) policy_row
    where policy_row ->> 'status' = 'REVIEW_REQUIRED'
  ) <> 1 then
    raise exception 'Expected exactly one thickness-dependent seigniorage review';
  end if;
end
$verify$;
