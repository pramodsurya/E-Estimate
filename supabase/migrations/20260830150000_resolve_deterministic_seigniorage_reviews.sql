-- REVIEW_REQUIRED is an internal policy-authoring state, not an estimator
-- choice. Resolve rows whose material, mineral, quantity ratio and CUM basis
-- are already deterministic. Also remove a known false-positive where
-- mechanical "Plummer blocks / hubs" were classified as building stone.

do $migration$
declare
  item_record record;
  policy jsonb;
  policy_row jsonb;
  rewritten_row jsonb;
  rewritten_rows jsonb;
  array_key text;
  material_key text;
  seig_code text;
  charge_unit text;
  description_text text;
  safe_mapping boolean;
begin
  for item_record in
    select code, seigniorage_applicability
    from public.ssr_item
    where seigniorage_applicability::text like '%REVIEW_REQUIRED%'
  loop
    policy := item_record.seigniorage_applicability;

    foreach array_key in array array['rows', 'materials']
    loop
      if jsonb_typeof(policy -> array_key) <> 'array' then
        continue;
      end if;

      rewritten_rows := '[]'::jsonb;
      for policy_row in select value from jsonb_array_elements(policy -> array_key)
      loop
        if policy_row ->> 'status' <> 'REVIEW_REQUIRED' then
          rewritten_rows := rewritten_rows || jsonb_build_array(policy_row);
          continue;
        end if;

        material_key := upper(coalesce(policy_row ->> 'material_key', ''));
        seig_code := upper(coalesce(policy_row ->> 'seig_code', ''));
        charge_unit := upper(coalesce(
          policy_row ->> 'charge_unit',
          policy_row ->> 'quantity_unit',
          policy_row ->> 'recipe_material_unit',
          ''
        ));
        description_text := lower(concat_ws(
          ' ',
          policy_row ->> 'material_desc',
          policy_row ->> 'recipe_material_desc',
          policy_row ->> 'material_label'
        ));

        -- These are mechanical bearing/hoist resources. The word "blocks"
        -- does not make them a mineral, so the row must not be charged.
        if item_record.code like 'IRR-GAW-%'
          and description_text ~ 'plummer blocks|couplings|hubs'
        then
          continue;
        end if;

        safe_mapping := charge_unit in ('CUM', 'CU.M', 'M3', 'M³') and (
          (material_key = 'SAND_FINE_AGGREGATE' and seig_code in (
            'SEIG_SAND_OTHERS', 'SEIG_ORDINARY_SAND'
          ))
          or (material_key = 'SOIL_MORRAM_EARTH'
            and seig_code = 'SEIG_MORRAM_GRAVEL_EARTH')
          or (material_key = 'STONE_AGGREGATE'
            and seig_code = 'SEIG_BUILDING_STONE')
          or (material_key = '' and seig_code = 'SEIG_ORDINARY_SAND')
        );

        rewritten_row := policy_row;
        if safe_mapping then
          rewritten_row := rewritten_row || jsonb_build_object(
            'status', 'REVIEWED',
            'charge_unit', 'CUM',
            'quantity_unit', 'CUM',
            'conversion_factor', 1,
            'conversion_required', false
          );

          if material_key = 'SAND_FINE_AGGREGATE'
            or seig_code = 'SEIG_ORDINARY_SAND'
          then
            rewritten_row := (rewritten_row - 'rate_override') || jsonb_build_object(
              'seig_code', 'SEIG_ORDINARY_SAND',
              'permit_exempt', true,
              'permit_reference', 'G.O.Ms.No.21, dt. 31.03.2022',
              'notes', 'Natural fine aggregate is Ordinary Sand; bill in CUM and do not levy permit fee.'
            );
          end if;
        end if;

        rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
      end loop;

      policy := jsonb_set(policy, array[array_key], rewritten_rows, false);
    end loop;

    update public.ssr_item
    set seigniorage_applicability = policy
    where code = item_record.code
      and seigniorage_applicability is distinct from policy;
  end loop;
end
$migration$;

-- Every CUM policy with a known canonical material/mineral pair must now be
-- reviewed; remaining reviews are genuinely non-volume conversion cases.
do $verify$
begin
  if exists (
    select 1
    from public.ssr_item item
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(item.seigniorage_applicability -> 'rows') = 'array'
          then item.seigniorage_applicability -> 'rows'
        else coalesce(item.seigniorage_applicability -> 'materials', '[]'::jsonb)
      end
    ) policy_row
    where policy_row ->> 'status' = 'REVIEW_REQUIRED'
      and upper(coalesce(
        policy_row ->> 'charge_unit',
        policy_row ->> 'quantity_unit',
        policy_row ->> 'recipe_material_unit',
        ''
      )) in ('CUM', 'CU.M', 'M3', 'M³')
      and upper(coalesce(policy_row ->> 'material_key', '')) in (
        'SAND_FINE_AGGREGATE', 'SOIL_MORRAM_EARTH', 'STONE_AGGREGATE'
      )
  ) then
    raise exception 'Deterministic CUM seigniorage reviews remain unresolved';
  end if;
end
$verify$;
