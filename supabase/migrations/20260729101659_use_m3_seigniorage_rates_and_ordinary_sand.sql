-- Store and bill the volume-based rates used by SSR/SOR DATA quantities.
-- The filename version matches the migration recorded by Supabase.
-- The statutory rates remain available in rate_per_mt for reference.
alter table public.seigniorage_charge
  add column if not exists rate_per_m3 numeric;

comment on column public.seigniorage_charge.rate_per_m3 is
  'Billing rate in rupees per cubic metre. For the bulk minerals below, derived from the GO MT rate at 1 CUM = 1.5 MT.';

update public.seigniorage_charge
set
  rate_per_m3 = case seig_code
    when 'SEIG_BUILDING_STONE' then 117.00
    when 'SEIG_MORRAM_GRAVEL_EARTH' then 39.00
    else rate_per_m3
  end,
  notes = case
    when coalesce(notes, '') ilike '%1 CUM = 1.5 MT%' then notes
    else concat_ws(
      ' ',
      nullif(notes, ''),
      'M3 billing rate derived at 1 CUM = 1.5 MT; the GO rate_per_mt is retained.'
    )
  end
where seig_code in ('SEIG_BUILDING_STONE', 'SEIG_MORRAM_GRAVEL_EARTH');

insert into public.seigniorage_charge (
  seig_code,
  mineral_name,
  rate_per_mt,
  rate_per_m3,
  schedule,
  go_reference,
  effective_from,
  confidence,
  notes
)
values (
  'SEIG_ORDINARY_SAND',
  'Ordinary Sand',
  27.00,
  40.50,
  'I',
  'G.O.Ms.No.18 (Mines & Geology), dt. 31.03.2022, w.e.f. 01.04.2022',
  date '2022-04-01',
  'VERIFIED',
  'GO rate is Rs. 27/MT. M3 billing rate is derived at 1 CUM = 1.5 MT.'
)
on conflict (seig_code) do update
set
  mineral_name = excluded.mineral_name,
  rate_per_mt = excluded.rate_per_mt,
  rate_per_m3 = excluded.rate_per_m3,
  schedule = excluded.schedule,
  go_reference = excluded.go_reference,
  effective_from = excluded.effective_from,
  confidence = excluded.confidence,
  notes = excluded.notes;

-- All three Part-1 natural-sand resources feed every SSR/SOR recipe that
-- refers to them, including Part-2 aliases through rate_ref_code.
update public.material
set seigniorage_code = 'SEIG_ORDINARY_SAND'
where seigniorage_code = 'SEIG_SAND_OTHERS';

-- Rewrite both v2 ("materials") and v3 ("rows") policy shapes, including
-- selected add-ons. Actual sand quantities are already recorded in CUM, so
-- they use rate_per_m3 directly and require no CUM-to-MT conversion.
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
  description_text text;
  array_key text;
begin
  for item_record in
    select code, seigniorage_applicability
    from public.ssr_item
    where seigniorage_applicability is not null
      and seigniorage_applicability::text like '%SEIG_SAND_OTHERS%'
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

          if policy_row ->> 'seig_code' = 'SEIG_SAND_OTHERS' then
            source_unit := lower(trim(coalesce(
              policy_row ->> 'source_quantity_unit',
              policy_row ->> 'recipe_material_unit',
              policy_row ->> 'charge_unit',
              policy_row ->> 'quantity_unit',
              ''
            )));
            description_text := lower(coalesce(
              policy_row ->> 'material_desc',
              policy_row ->> 'recipe_material_desc',
              policy_row ->> 'material_label',
              ''
            ));

            if source_unit in ('cum', 'cu.m', 'm3', 'm³')
              and description_text !~ '(sand[ -]*blast gun|gun nozzle)'
            then
              rewritten_row := policy_row || jsonb_build_object(
                'seig_code', 'SEIG_ORDINARY_SAND',
                'charge_unit', 'CUM',
                'quantity_unit', 'CUM',
                'conversion_factor', 1,
                'conversion_required', false,
                'preferred_rate_field', 'rate_per_m3',
                'notes', case
                  when nullif(policy_row ->> 'notes', '') is null
                    then 'Natural sand mapped to Ordinary Sand and billed in CUM.'
                  else regexp_replace(
                    policy_row ->> 'notes',
                    'Sand \(Others\)',
                    'Ordinary Sand',
                    'gi'
                  )
                end
              );
            else
              -- "Use rate of sand blast gun nozzle" is equipment measured in
              -- hours, not a mineral quantity. Do not levy seigniorage on it.
              rewritten_row := null;
            end if;
          end if;

          if rewritten_row is not null then
            rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
          end if;
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

            if policy_row ->> 'seig_code' = 'SEIG_SAND_OTHERS' then
              source_unit := lower(trim(coalesce(
                policy_row ->> 'source_quantity_unit',
                policy_row ->> 'recipe_material_unit',
                policy_row ->> 'charge_unit',
                policy_row ->> 'quantity_unit',
                ''
              )));

              if source_unit in ('cum', 'cu.m', 'm3', 'm³') then
                rewritten_row := policy_row || jsonb_build_object(
                  'seig_code', 'SEIG_ORDINARY_SAND',
                  'charge_unit', 'CUM',
                  'quantity_unit', 'CUM',
                  'conversion_factor', 1,
                  'conversion_required', false,
                  'preferred_rate_field', 'rate_per_m3',
                  'notes', 'Selected add-on sand quantity is already in CUM; bill it at the Ordinary Sand M3 rate.'
                );
              else
                rewritten_row := null;
              end if;
            end if;

            if rewritten_row is not null then
              rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
            end if;
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

    if policy ->> 'seig_code' = 'SEIG_SAND_OTHERS' then
      policy := (policy - 'rate_override') || jsonb_build_object(
        'seig_code', 'SEIG_ORDINARY_SAND'
      );
    end if;

    update public.ssr_item
    set seigniorage_applicability = policy
    where code = item_record.code
      and seigniorage_applicability is distinct from policy;
  end loop;
end
$migration$;
