-- Natural fine aggregate is Ordinary Sand, not Sand (Others).
-- G.O.Ms.No.21 (Industries & Commerce (Mines-I)), dt. 31.03.2022,
-- excludes Ordinary Sand from the permit fee introduced from 01.04.2022.

update public.seigniorage_charge
set notes = concat_ws(
  ' ',
  nullif(notes, ''),
  'Ordinary Sand is exempt from permit fee under G.O.Ms.No.21, dt. 31.03.2022.'
)
where seig_code = 'SEIG_ORDINARY_SAND'
  and coalesce(notes, '') not ilike '%exempt from permit fee%';

-- Keep the resource catalogue canonical even if an older import or database
-- snapshot restores Sand (Others). Specialty and manufactured sands are not
-- included in this natural-sand rule.
update public.material
set seigniorage_code = 'SEIG_ORDINARY_SAND'
where (
    lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) ~
      '(^| )(fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)( |$)'
    or trim(lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) = 'sand'
  )
  and lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) !~
    '(^| )(m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)( |$)'
  and seigniorage_code is distinct from 'SEIG_ORDINARY_SAND';

-- Canonicalize every material row in v2/v3 policies and selected add-ons.
-- The rewrite is idempotent and also removes a stale Sand (Others) rate
-- override so the current Ordinary Sand CUM rate is read from the charge table.
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
  description_text text;
  material_key text;
  array_key text;
  is_natural_sand boolean;
begin
  for item_record in
    select code, seigniorage_applicability
    from public.ssr_item
    where seigniorage_applicability is not null
  loop
    policy := item_record.seigniorage_applicability;

    foreach array_key in array array['rows', 'materials']
    loop
      if jsonb_typeof(policy -> array_key) = 'array' then
        rewritten_rows := '[]'::jsonb;

        for policy_row in
          select value from jsonb_array_elements(policy -> array_key)
        loop
          description_text := trim(lower(regexp_replace(concat_ws(
            ' ',
            policy_row ->> 'material_desc',
            policy_row ->> 'recipe_material_desc',
            policy_row ->> 'material_label'
          ), '[^a-zA-Z0-9]+', ' ', 'g')));
          material_key := upper(coalesce(policy_row ->> 'material_key', ''));
          is_natural_sand := (
            material_key = 'SAND_FINE_AGGREGATE'
            or description_text = 'sand'
            or description_text ~ '(^| )(fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)( |$)'
          ) and description_text !~
            '(^| )(m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)( |$)';

          rewritten_row := policy_row;
          if is_natural_sand then
            rewritten_row := (policy_row - 'rate_override') || jsonb_build_object(
              'seig_code', 'SEIG_ORDINARY_SAND',
              'charge_unit', 'CUM',
              'quantity_unit', 'CUM',
              'conversion_factor', 1,
              'conversion_required', false,
              'preferred_rate_field', 'rate_per_m3',
              'permit_exempt', true,
              'permit_reference', 'G.O.Ms.No.21, dt. 31.03.2022',
              'notes', 'Natural fine aggregate is Ordinary Sand; bill in CUM and do not levy permit fee.'
            );
          end if;

          rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
        end loop;

        policy := jsonb_set(policy, array[array_key], rewritten_rows, false);
      end if;
    end loop;

    if jsonb_typeof(policy -> 'addons') = 'array' then
      rewritten_addons := '[]'::jsonb;

      for addon in select value from jsonb_array_elements(policy -> 'addons')
      loop
        rewritten_addon := addon;
        if jsonb_typeof(addon -> 'rows') = 'array' then
          rewritten_rows := '[]'::jsonb;

          for policy_row in select value from jsonb_array_elements(addon -> 'rows')
          loop
            description_text := trim(lower(regexp_replace(concat_ws(
              ' ',
              policy_row ->> 'material_desc',
              policy_row ->> 'recipe_material_desc',
              policy_row ->> 'material_label'
            ), '[^a-zA-Z0-9]+', ' ', 'g')));
            material_key := upper(coalesce(policy_row ->> 'material_key', ''));
            is_natural_sand := (
              material_key = 'SAND_FINE_AGGREGATE'
              or description_text = 'sand'
              or description_text ~ '(^| )(fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)( |$)'
            ) and description_text !~
              '(^| )(m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)( |$)';

            rewritten_row := policy_row;
            if is_natural_sand then
              rewritten_row := (policy_row - 'rate_override') || jsonb_build_object(
                'seig_code', 'SEIG_ORDINARY_SAND',
                'charge_unit', 'CUM',
                'quantity_unit', 'CUM',
                'conversion_factor', 1,
                'conversion_required', false,
                'preferred_rate_field', 'rate_per_m3',
                'permit_exempt', true,
                'permit_reference', 'G.O.Ms.No.21, dt. 31.03.2022',
                'notes', 'Selected add-on natural fine aggregate is Ordinary Sand; do not levy permit fee.'
              );
            end if;

            rewritten_rows := rewritten_rows || jsonb_build_array(rewritten_row);
          end loop;

          rewritten_addon := jsonb_set(rewritten_addon, '{rows}', rewritten_rows, false);
        end if;
        rewritten_addons := rewritten_addons || jsonb_build_array(rewritten_addon);
      end loop;

      policy := jsonb_set(policy, '{addons}', rewritten_addons, false);
    end if;

    -- Legacy one-code policies used Sand (Others) only for the natural-sand
    -- recipe path. The 2026 migration established this same canonical mapping.
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

-- Migration-time verification: fail atomically if a natural fine-aggregate
-- resource or policy row still points at a non-Ordinary-Sand mineral.
do $verify$
begin
  if exists (
    select 1
    from public.material
    where (
        lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) ~
          '(^| )(fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)( |$)'
        or trim(lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) = 'sand'
      )
      and lower(regexp_replace(coalesce(name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) !~
        '(^| )(m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)( |$)'
      and seigniorage_code is distinct from 'SEIG_ORDINARY_SAND'
  ) then
    raise exception 'Natural fine-aggregate material classification verification failed';
  end if;

  if exists (
    with policy_rows as (
      select item.code, policy_row.value as row
      from public.ssr_item as item
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(item.seigniorage_applicability -> 'rows') = 'array'
            then item.seigniorage_applicability -> 'rows'
          else '[]'::jsonb
        end
      ) as policy_row

      union all

      select item.code, policy_row.value as row
      from public.ssr_item as item
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(item.seigniorage_applicability -> 'materials') = 'array'
            then item.seigniorage_applicability -> 'materials'
          else '[]'::jsonb
        end
      ) as policy_row

      union all

      select item.code, policy_row.value as row
      from public.ssr_item as item
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(item.seigniorage_applicability -> 'addons') = 'array'
            then item.seigniorage_applicability -> 'addons'
          else '[]'::jsonb
        end
      ) as addon
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(addon.value -> 'rows') = 'array'
            then addon.value -> 'rows'
          else '[]'::jsonb
        end
      ) as policy_row
    ), normalized_rows as (
      select
        code,
        row,
        upper(coalesce(row ->> 'material_key', '')) as material_key,
        trim(lower(regexp_replace(concat_ws(
          ' ',
          row ->> 'material_desc',
          row ->> 'recipe_material_desc',
          row ->> 'material_label'
        ), '[^a-zA-Z0-9]+', ' ', 'g'))) as description_text
      from policy_rows
    )
    select 1
    from normalized_rows
    where (
        material_key = 'SAND_FINE_AGGREGATE'
        or description_text = 'sand'
        or description_text ~ '(^| )(fine aggregate|ordinary sand|natural sand|river sand|sand screened|sand un screened|screened sand|un screened sand|sand for filling|filling sand)( |$)'
      )
      and description_text !~
        '(^| )(m sand|manufactured sand|stone dust|crusher dust|silica sand|quartz sand|moulding sand|molding sand|foundry sand|filter sand|sand blast|blasting sand|blast gun|gun nozzle)( |$)'
      and row ->> 'seig_code' is distinct from 'SEIG_ORDINARY_SAND'
  ) then
    raise exception 'Natural fine-aggregate SSR policy verification failed';
  end if;

  if exists (
    select 1
    from public.ssr_item
    where seigniorage_applicability ->> 'seig_code' = 'SEIG_SAND_OTHERS'
  ) then
    raise exception 'Legacy Sand (Others) root policy verification failed';
  end if;
end
$verify$;
