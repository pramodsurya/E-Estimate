-- Reviewed multi-rate classifications and fabricated-parts Lead policy.
-- Applied to Supabase project hqddsxnykndgcmxwqwmn on 2026-07-17.

begin;

update public.ssr_item
set rate_structure =
  coalesce(rate_structure, '{}'::jsonb) ||
  jsonb_build_object(
    'multi_rate_classification',
    case
      when code in ('IRR-GAW-1-3','IRR-GAW-2-7','IRR-GAW-2-9','IRR-GAW-2-10')
        then 'dual_measurement_basis'
      when code in ('IRR-CAW-7-31','IRR-CAW-8-1')
        then 'optional_addition'
      when code in ('IRR-CCDW-3-1','IRR-DAW-1-10')
        then 'quantity_depth_bands'
      when code = 'IRR-DAW-5-5'
        then 'derived_adjustment_chain'
    end,
    'classification_version', 'ssr_multi_rate_v1'
  ) ||
  case
    when code = 'IRR-CAW-7-31'
      then jsonb_build_object('optional_addition_label', 'Add sand backing')
    when code = 'IRR-CAW-8-1'
      then jsonb_build_object('optional_addition_label', 'Add 15 cm thick murum bed below pitching')
    else '{}'::jsonb
  end
where code in (
  'IRR-CAW-7-31','IRR-CAW-8-1','IRR-CCDW-3-1','IRR-DAW-1-10','IRR-DAW-5-5',
  'IRR-GAW-1-3','IRR-GAW-2-7','IRR-GAW-2-9','IRR-GAW-2-10'
);

-- The payable GAW rate is per tonne capacity; the tonne-weight rate is an
-- intermediate conversion of the same total cost.
update public.ssr_year as sy
set base_rate = (
  select (entry->>'value')::numeric
  from jsonb_array_elements(coalesce(sy.rate_values, '[]'::jsonb)) as entry
  where entry->>'label' ilike '%capacity%'
  order by case when entry->>'label' ilike '%capacity of hoist%' then 0 else 1 end
  limit 1
)
where sy.code in ('IRR-GAW-1-3','IRR-GAW-2-7','IRR-GAW-2-9','IRR-GAW-2-10')
  and exists (
    select 1
    from jsonb_array_elements(coalesce(sy.rate_values, '[]'::jsonb)) as entry
    where entry->>'label' ilike '%capacity%'
      and sy.base_rate is distinct from (entry->>'value')::numeric
  );

-- Every GAW item selected here has an explicit published abstract line for
-- fabricated-parts lead. One mapped route represents two haul legs. Each leg
-- already includes 1 km; the published DATA also includes unloading twice.
update public.ssr_item as si
set
  lead_applicability =
    coalesce(si.lead_applicability, '{}'::jsonb) ||
    jsonb_build_object(
      'builtin',
      coalesce(si.lead_applicability->'builtin', '{}'::jsonb) ||
      jsonb_build_object('mode', 'explicit_lines', 'all_leads', false, 'builtin_lead_km', 1),
      'classes', jsonb_build_array('STEEL'),
      'earthwork', false,
      'materials', jsonb_build_object('Fabricated parts', 'STEEL'),
      'rate_refs', jsonb_build_array(
        jsonb_build_object(
          'class', 'STEEL',
          'formula', 'lead_amount = fabricated_weight_tonne * haul_legs * (lead_rate_for_distance - included_1km_rate)',
          'column_key', 'CEMENT_STEEL_PACKED',
          'charge_code', 'COM-LDLFT-2',
          'detail_code', 'COM-DTL-LDLFT-2',
          'pricing_basis', 'distance_km'
        )
      )
    ),
  lead_policy = jsonb_build_object(
    'purpose', 'MATERIAL_SUPPLY',
    'included_lead_m', 1000,
    'included_lift_m', 0,
    'includes_all_lifts', true,
    'quantity_basis', 'PUBLISHED_FABRICATED_WEIGHT_TONNE',
    'allow_loading', false,
    'allow_unloading', false,
    'scrutiny_required', false,
    'default_conveyance_class', 'STEEL',
    'haul_legs', 2,
    'note', 'Published DATA includes two 1 km lead legs and two unloading operations for fabricated parts. Pay only two-leg lead above the included 1 km; do not duplicate loading or unloading.',
    'policy_version', 'ts_sor_fabricated_parts_lead_v1'
  )
where exists (
  select 1
  from public.ssr_year as sy
  where sy.code = si.code
    and sy.abstract::text ilike '%lead charges for fabricated parts%'
);

commit;
