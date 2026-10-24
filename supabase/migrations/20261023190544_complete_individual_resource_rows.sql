set local statement_timeout='60s';
create or replace function public.individual_cost_source_rows(p_owner text,p_year text)
returns table(owner text,kind text,source_code text,scope text,line_index integer,row_data jsonb)
language sql stable security invoker set search_path=pg_catalog set jit=off as $f$
 select 'MORTH',s.kind,m.code,'base',(x.n-1)::integer,x.row
 from public.morth m cross join lateral(values('materials',m.materials),('machinery',m.machinery),('labour',m.labour))s(kind,rows)
 cross join lateral jsonb_array_elements(s.rows)with ordinality x(row,n) where p_owner='MORTH'
 union all
 select 'MORTH',coalesce(c.row->>'section',s.kind),m.code,'option:'||(r.row->>'resource_key')||':'||o.key,(c.n-1)::integer,
 c.row||jsonb_build_object('unit',coalesce(c.row->>'unit',r.row->>'unit',''),'resource_key',coalesce(c.row->>'resource_key','morth:option:'||(c.row->>'desc')))
 from public.morth m cross join lateral(values('materials',m.materials),('machinery',m.machinery),('labour',m.labour))s(kind,rows)
 cross join lateral jsonb_array_elements(s.rows)r(row)
 cross join lateral jsonb_each(coalesce(r.row->'costing_options'->'options','{}'))o(key,value)
 cross join lateral jsonb_array_elements(coalesce(o.value->'components','[]'))with ordinality c(row,n)
 where p_owner='MORTH' and o.key<>'source'
 union all
 select 'MORTH',s.kind,m.code,'pricing_addition',(c.n-1)::integer,c.row
 from public.morth m cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(coalesce(m.recipe->'pricing_additions'->s.kind,'[]'))with ordinality c(row,n)
 where p_owner='MORTH'
 union all
 select 'SSR',s.kind,y.recipe_code,'base',(x.n-1)::integer,x.row
 from public."SSR_Year" y cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(public.ssr_resource_line_array(y.rates->s.kind))with ordinality x(row,n)
 where p_owner='SSR' and y.year=p_year
 union all
 select 'SSR',s.kind,y.recipe_code,'addon:'||(a.row->>'id'),(x.n-1)::integer,x.row
 from public."SSR_Year" y cross join lateral jsonb_array_elements(public.ssr_resource_line_array(y.addon_rates))a(row)
 cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(public.ssr_resource_line_array(a.row->'rates'->s.kind))with ordinality x(row,n)
 where p_owner='SSR' and y.year=p_year;
$f$;

create or replace function public.individual_cost_choices(p_row jsonb) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
 with refs as(
 select coalesce(x.v->>'recipe_code',x.v->>'code',x.v#>>'{}') code,x.n::bigint n,coalesce(x.v->>'component',p_row->'price_lookup'->>'rate_component',p_row->'resource_identity'->>'rate_component','rate') component
 from jsonb_array_elements(coalesce(p_row->'sor_refs','[]'))with ordinality x(v,n)
 union all select coalesce(v->>'recipe_code',v->>'code'),1000,coalesce(v->>'component',p_row->'price_lookup'->>'rate_component','rate') from (select p_row->'sor_ref' v)s
 union all select coalesce(v->>'recipe_code',v->>'master_code'),1001,coalesce(v->>'rate_component',p_row->'price_lookup'->>'rate_component','rate') from (select p_row->'resource_identity' v)s
 union all select v#>>'{}',2000+n,coalesce(p_row->'price_lookup'->>'rate_component','rate') from jsonb_path_query(coalesce(p_row->'price_lookup','{}'),'strict $.**.recipe_code')with ordinality x(v,n)
 union all select coalesce(v->>'recipe_code',v->>'master_code',v#>>'{}'),3000+n,coalesce(v->>'component','rate') from jsonb_array_elements(coalesce(p_row->'_candidates','[]'))with ordinality x(v,n)
 ), ranked as(select code,min(n) n,(array_agg(component order by n))[1] component from refs where code like 'SOR-%' group by code)
 select coalesce(jsonb_agg(jsonb_build_object('code',r.recipe_code,'description',r.description,'unit',r.unit,'component',a.component,'medium',lower(coalesce(r.variants->>'value',''))='medium') order by a.n,r.recipe_code),'[]')
 from ranked a join public."SOR_Recipie"r on r.recipe_code=a.code
 where coalesce(r.metadata->>'item_type','') not in('conveyance_matrix','conveyance_matrix_cell');
$f$;

create or replace function public.individual_cost_usages(p_owner text,p_year text,p_key jsonb) returns jsonb
language sql stable security invoker set search_path=pg_catalog set jit=off as $f$
 select coalesce(jsonb_agg(jsonb_build_object('code',s.source_code,'description',coalesce(m.description,r.description),'printedItem',m.printed_item,'scope',s.scope,'section',s.kind,'index',s.line_index)order by s.source_code,s.scope,s.line_index),'[]')
 from public.individual_cost_source_rows(p_owner,p_year)s
 left join public.morth m on p_owner='MORTH' and m.code=s.source_code
 left join public.ssr_item r on p_owner='SSR' and r.code=s.source_code
 where public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index)=p_key;
$f$;
