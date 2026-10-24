-- Keep priced water tariffs usable for the exact published kilolitre basis.
create or replace function public.sor_unit_measure(p_unit text) returns jsonb
language plpgsql immutable security invoker set search_path=pg_catalog as $f$
declare u text; parts text[]; size numeric:=1; dimension text;
begin
 u:=lower(trim(p_unit));
 u:=replace(replace(u,'²','2'),'³','3');
 u:=regexp_replace(u,'^per\s+','','i');
 u:=regexp_replace(regexp_replace(u,'\s+',' ','g'),'\.+$','');
 parts:=regexp_match(u,'^([0-9]+(?:\.[0-9]+)?)\s+(.+)$');
 if parts is not null then size:=parts[1]::numeric;u:=regexp_replace(parts[2],'\.+$','');end if;
 if size<=0 then return null;end if;
 if u in('kg','kgs','kilogram','kilograms') then dimension:='mass';
 elsif u in('tonne','tonnes','metric tonne','one metric tonne','mt') then dimension:='mass';size:=size*1000;
 elsif u in('ltr','liter','litre','liters','litres','l') then dimension:='liquid_volume';
 elsif u in('kl','kilolitre','kilolitres','kiloliter','kiloliters','kilo litre','kilo liter') then dimension:='liquid_volume';size:=size*1000;
 elsif u in('cum','m3','cu m') then dimension:='solid_volume';
 elsif u in('sqm','sqmt','m2','sq m','sq mtr','sq mtrs') then dimension:='area';
 elsif u in('sqft','sq ft') then dimension:='area';size:=size*0.09290304;
 elsif u in('rm','rmt','m','mtr','mtrs','meter','metre') then dimension:='length';
 elsif u in('km','k.m.') then dimension:='length';size:=size*1000;
 elsif u in('no','nos','each','number') then dimension:='count';
 elsif u in('doz','dozen') then dimension:='count';size:=size*12;
 elsif u in('hour','hours','hr','hrs') then dimension:='hour';
 elsif u in('day','days') then dimension:='day';
 elsif u in('pair','set','job','ls','bag','roll') then dimension:=u;
 else return null;end if;
 return jsonb_build_object('dimension',dimension,'size',size);
end $f$;

-- Read stored starting choices and benchmarks without changing the source identity
-- or presenting historical/source-review prices as current published SOR tariffs.
create or replace function public.morth_resource_defaults(p_resource_codes text[]) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $f$
begin
 if coalesce(cardinality(p_resource_codes),0)>1000 then raise exception 'Too many resources';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
   'resource_code',a.resource_code,'unit',a.unit,'status',a.status,'pricing_records',a.pricing_records,
   'candidates',coalesce((select jsonb_agg(jsonb_build_object(
      'recipe_code',c->>'recipe_code','description',c->>'description','unit',c->>'unit',
      'component',coalesce(c->'allowed_components'->>0,'rate'),'review_status',c->>'review_status'
    ) order by n) from jsonb_array_elements(coalesce(a.source_definition#>'{pricing_resolution_review,sor_candidates}','[]'))with ordinality x(c,n)
    where (a.source_definition#>'{pricing_resolution_review,pricing_source_plan,sor_choices}') ? (c->>'recipe_code')),'[]')
 )),'[]') from public.analysis_resource a where a.resource_code=any(coalesce(p_resource_codes,'{}')));
end $f$;
revoke all on function public.morth_resource_defaults(text[]) from public;
grant execute on function public.morth_resource_defaults(text[]) to anon,authenticated,service_role;
