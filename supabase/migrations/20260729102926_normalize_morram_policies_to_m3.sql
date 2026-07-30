-- Morram/earth SSR quantities are stored in CUM and must use the M3 billing
-- rate (Rs. 39/M3), not the retained statutory reference rate (Rs. 26/MT).
-- The filename version matches the migration recorded by Supabase.
do $migration$
declare
  item_record record;
  policy jsonb;
  policy_row jsonb;
  rewritten_row jsonb;
  rewritten_rows jsonb;
  addon jsonb;
  rewritten_addon jsonb;
  rewritten_addons jsonb;
  source_unit text;
  array_key text;
begin
  for item_record in
    select code, seigniorage_applicability
    from public.ssr_item
    where seigniorage_applicability is not null
      and seigniorage_applicability::text like '%SEIG_MORRAM_GRAVEL_EARTH%'
  loop
    policy := item_record.seigniorage_applicability;

    foreach array_key in array array['rows', 'materials']
    loop
      if jsonb_typeof(policy -> array_key) = 'array' then
        rewritten_rows := '[]'::jsonb;

        for policy_row in
          select value
          from jsonb_array_elements(policy -> array_key)
        loop
          rewritten_row := policy_row;

          if policy_row ->> 'seig_code' = 'SEIG_MORRAM_GRAVEL_EARTH' then
            source_unit := lower(trim(coalesce(
              policy_row ->> 'source_quantity_unit',
              policy_row ->> 'recipe_material_unit',
              policy_row ->> 'item_unit',
              policy_row ->> 'charge_unit',
              policy_row ->> 'quantity_unit',
              ''
            )));

            if source_unit in ('cum', 'cu.m', 'm3', 'm³') then
              rewritten_row := policy_row || jsonb_build_object(
                'charge_unit', 'CUM',
                'quantity_unit', 'CUM',
                'source_quantity_unit', 'CUM',
                'conversion_factor', 1,
                'conversion_required', false,
                'preferred_rate_field', 'rate_per_m3',
                'notes', case
                  when policy_row ->> 'mode' = 'FULL_ITEM_QUANTITY'
                    then 'Full item earth quantity is in CUM; bill at the Morram / Gravel & Ordinary Earth M3 rate.'
                  else 'Morram / earth recipe quantity is in CUM; bill at rate_per_m3 without MT conversion.'
                end
              );
            end if;
          end if;

          rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
        end loop;

        policy := jsonb_set(policy, array[array_key], rewritten_rows, false);
      end if;
    end loop;

    if jsonb_typeof(policy -> 'addons') = 'array' then
      rewritten_addons := '[]'::jsonb;

      for addon in
        select value
        from jsonb_array_elements(policy -> 'addons')
      loop
        rewritten_addon := addon;

        if jsonb_typeof(addon -> 'rows') = 'array' then
          rewritten_rows := '[]'::jsonb;

          for policy_row in
            select value
            from jsonb_array_elements(addon -> 'rows')
          loop
            rewritten_row := policy_row;

            if policy_row ->> 'seig_code' = 'SEIG_MORRAM_GRAVEL_EARTH' then
              source_unit := lower(trim(coalesce(
                policy_row ->> 'source_quantity_unit',
                policy_row ->> 'recipe_material_unit',
                policy_row ->> 'item_unit',
                policy_row ->> 'charge_unit',
                policy_row ->> 'quantity_unit',
                ''
              )));

              if source_unit in ('cum', 'cu.m', 'm3', 'm³') then
                rewritten_row := policy_row || jsonb_build_object(
                  'charge_unit', 'CUM',
                  'quantity_unit', 'CUM',
                  'source_quantity_unit', 'CUM',
                  'conversion_factor', 1,
                  'conversion_required', false,
                  'preferred_rate_field', 'rate_per_m3',
                  'notes', 'Selected add-on murum quantity is in CUM; bill at the Morram / Gravel & Ordinary Earth M3 rate.'
                );
              end if;
            end if;

            rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
          end loop;

          rewritten_addon := jsonb_set(
            rewritten_addon,
            '{rows}',
            rewritten_rows,
            false
          );
        end if;

        rewritten_addons := rewritten_addons || jsonb_build_array(rewritten_addon);
      end loop;

      policy := jsonb_set(policy, '{addons}', rewritten_addons, false);
    end if;

    update public.ssr_item
    set seigniorage_applicability = policy
    where code = item_record.code
      and seigniorage_applicability is distinct from policy;
  end loop;
end
$migration$;
