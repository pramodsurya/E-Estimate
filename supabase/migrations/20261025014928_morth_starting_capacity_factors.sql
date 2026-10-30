-- User-requested provisional starting estimates. Source equipment identities,
-- published SOR tariffs and historical pricing records remain unchanged.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $guard$
begin
  if (select count(*) from public.analysis_resource where resource_code in (
    'MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168',
    'MORTH_PM_035', 'MORTH_SRC_5395D38AAA3590B03A00'
  ) and kind = 'machinery' and unit = 'hour') <> 4 then
    raise exception 'Expected four exact hourly tanker resource identities';
  end if;
end $guard$;

update public.analysis_resource a
set source_definition = jsonb_set(a.source_definition, '{starting_rate_basis}',
  jsonb_build_object(
    'version', 1, 'enabled', true,
    'method', 'capacity_ratio_component_estimate',
    'status', 'provisional_starting_estimate',
    'reference_recipe_code', 'SOR-P01-T08-R0064',
    'reference_capacity_litres', 8000,
    'target_capacity_litres', case when a.resource_code in (
      'MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168') then 12000 else 16000 end,
    'capacity_factor', case when a.resource_code in (
      'MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168') then 1.5 else 2 end,
    'component_factors', jsonb_build_object(
      'hire_charge', case when a.resource_code in (
        'MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168') then 1.5 else 2 end,
      'fuel_charge', case when a.resource_code in (
        'MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168') then 1.5 else 2 end,
      'crew_charge', 1),
    'included_components', jsonb_build_array('hire_charge', 'fuel_charge', 'crew_charge'),
    'quantity_policy', 'Keep source equipment operating hours; this scales hourly cost only.',
    'assumption', 'Hire and fuel scale linearly with tank capacity for a starting estimate; one crew is retained. This is not a published SOR equivalence or a verified consumption model.',
    'origin', 'User-requested tanker capacity factors, 2026-10-25',
    'requires_review', true,
    'prefer_to_historical_benchmark', true
  ), true)
where a.resource_code in ('MORTH_PM_036', 'MORTH_SRC_439D2BEB5CFFDB611168',
  'MORTH_PM_035', 'MORTH_SRC_5395D38AAA3590B03A00');

create or replace function public.morth_resource_starting_quote(
  p_resource_code text, p_year text, p_zone text,
  p_component text default 'rate', p_unit text default null
) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog
as $function$
declare
  a public.analysis_resource;
  basis jsonb; q jsonb; factors jsonb; components jsonb := '{}'::jsonb;
  name text; amount numeric; scaled numeric; total numeric := 0;
  unit_factor numeric; capacity_factor numeric;
begin
  select * into a from public.analysis_resource where resource_code = p_resource_code;
  basis := a.source_definition->'starting_rate_basis';
  if basis is null or basis->>'enabled' is distinct from 'true' then
    return jsonb_build_object('status', 'starting_basis_missing', 'rate', null);
  end if;
  if basis->>'method' is distinct from 'capacity_ratio_component_estimate'
    or basis->>'status' is distinct from 'provisional_starting_estimate'
    or nullif(basis->>'reference_recipe_code', '') is null then
    return jsonb_build_object('status', 'starting_basis_review_required', 'rate', null);
  end if;
  capacity_factor := (basis->>'capacity_factor')::numeric;
  factors := basis->'component_factors';
  if capacity_factor <= 0 or capacity_factor is null
    or (basis->>'reference_capacity_litres')::numeric <= 0
    or (basis->>'target_capacity_litres')::numeric / (basis->>'reference_capacity_litres')::numeric <> capacity_factor then
    return jsonb_build_object('status', 'starting_basis_review_required', 'rate', null);
  end if;
  q := public.sor_resource_quote(basis->>'reference_recipe_code', p_year, p_zone, 'rate', p_unit);
  if q->>'status' is distinct from 'priced' then
    return q || jsonb_build_object('status', 'starting_reference_unavailable',
      'reference_status', q->>'status', 'rate', null, 'resource_code', p_resource_code);
  end if;
  unit_factor := (q->>'conversion_factor')::numeric;
  foreach name in array array['hire_charge', 'fuel_charge', 'crew_charge'] loop
    if jsonb_typeof(q->'rate_detailed'->name) is distinct from 'number'
      or jsonb_typeof(factors->name) is distinct from 'number'
      or (factors->>name)::numeric <= 0 or unit_factor is null then
      return jsonb_build_object('status', 'starting_components_unavailable', 'rate', null);
    end if;
    amount := (q->'rate_detailed'->>name)::numeric;
    scaled := round(amount * (factors->>name)::numeric * unit_factor, 2);
    components := components || jsonb_build_object(name, scaled);
    total := total + scaled;
  end loop;
  if p_component in ('rate', 'total', 'hire_total') then amount := total;
  elsif p_component in ('hire_charge', 'fuel_charge', 'crew_charge') then
    amount := (components->>p_component)::numeric;
  else
    return jsonb_build_object('status', 'starting_component_unavailable', 'rate', null);
  end if;
  return jsonb_build_object(
    'status', 'priced', 'rate', amount, 'component', p_component,
    'resource_code', a.resource_code, 'description', a.description,
    'year', p_year, 'zone', p_zone, 'unit', q->'unit',
    'reference_recipe_code', basis->'reference_recipe_code',
    'reference_rate', q->'rate', 'reference_components', q->'rate_detailed',
    'rate_detailed', components, 'capacity_factor', capacity_factor,
    'component_factors', factors, 'unit_conversion_factor', unit_factor,
    'starting_rate_basis', basis,
    'rate_role', 'capacity_scaled_starting_estimate',
    'includes_fuel', p_component in ('rate', 'total', 'hire_total'),
    'includes_crew', p_component in ('rate', 'total', 'hire_total'),
    'is_published_sor_rate', false, 'requires_review', true);
end $function$;
revoke all on function public.morth_resource_starting_quote(text,text,text,text,text) from public;
grant execute on function public.morth_resource_starting_quote(text,text,text,text,text) to anon, authenticated, service_role;

create or replace function public.morth_resource_defaults(p_resource_codes text[]) returns jsonb
language plpgsql stable security invoker set search_path = pg_catalog as $function$
begin
  if coalesce(cardinality(p_resource_codes),0)>1000 then raise exception 'Too many resources'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'resource_code', a.resource_code, 'unit', a.unit, 'status', a.status,
    'pricing_records', a.pricing_records,
    'starting_rate_basis', a.source_definition->'starting_rate_basis',
    'candidates', coalesce((select jsonb_agg(jsonb_build_object(
      'recipe_code', c->>'recipe_code', 'description', c->>'description', 'unit', c->>'unit',
      'component', coalesce(c->'allowed_components'->>0,'rate'), 'review_status', c->>'review_status'
    ) order by n) from jsonb_array_elements(coalesce(a.source_definition#>'{pricing_resolution_review,sor_candidates}','[]')) with ordinality x(c,n)
      where (a.source_definition#>'{pricing_resolution_review,pricing_source_plan,sor_choices}') ? (c->>'recipe_code')), '[]')
  )), '[]') from public.analysis_resource a where a.resource_code=any(coalesce(p_resource_codes,'{}')));
end $function$;
revoke all on function public.morth_resource_defaults(text[]) from public;
grant execute on function public.morth_resource_defaults(text[]) to anon, authenticated, service_role;
