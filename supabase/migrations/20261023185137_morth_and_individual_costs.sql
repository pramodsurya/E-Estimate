-- Read-only catalogue/resource projections. Authoritative source records remain untouched.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.individual_cost_key(p_owner text,p_kind text,p_row jsonb,p_context text default '') returns jsonb
language sql immutable security invoker set search_path=pg_catalog as $f$
 select case when p_owner='MORTH' then jsonb_build_array(p_owner,p_kind,lower(regexp_replace(coalesce(p_row->>'unit',''),'\s+','','g')),
 coalesce(p_row->>'resource_key',p_context),
 coalesce((select jsonb_agg(t order by t) from (select distinct v#>>'{}' t from (
 select jsonb_path_query(coalesce(p_row->'price_lookup','{}'),'strict $.**.recipe_code') v
 union all select jsonb_path_query(coalesce(p_row->'price_lookup','{}'),'strict $.**.resource_code')
 union all select coalesce(p_row->'resource_identity'->'recipe_code',p_row->'resource_identity'->'master_code',p_row->'resource_identity'->'resource_code')
 )a where v is not null and v<>'null'::jsonb)b),'[]'::jsonb),coalesce(p_row->'price_lookup'->>'rate_component',p_row->'resource_identity'->>'rate_component',p_row->'sor_ref'->>'component','rate'))
 else jsonb_build_array(p_owner,p_kind,lower(regexp_replace(coalesce(p_row->>'unit',''),'\s+','','g')),
 coalesce(p_row->'resource_identity'->>'master_code',p_row->'resource_identity'->>'recipe_code',p_row->'resource_identity'->>'resource_key',p_context),
 coalesce(p_row->'resource_identity'->>'rate_component','rate'),coalesce(p_row->'resource_identity'->'link_review'->>'rate_basis_multiplier','1')) end;
$f$;

create or replace function public.individual_cost_source_rows(p_owner text,p_year text)
returns table(owner text,kind text,source_code text,scope text,line_index integer,row_data jsonb)
language sql stable security invoker set search_path=pg_catalog set jit=off as $f$
 select 'MORTH',s.kind,m.code,'base',(x.n-1)::integer,x.row
 from public.morth m cross join lateral(values('materials',m.materials),('machinery',m.machinery),('labour',m.labour))s(kind,rows)
 cross join lateral jsonb_array_elements(s.rows)with ordinality x(row,n) where p_owner='MORTH'
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
 select coalesce(x.v->>'recipe_code',x.v->>'code',x.v#>>'{}') code,x.n::bigint n,coalesce(x.v->>'component','rate') component
 from jsonb_array_elements(coalesce(p_row->'sor_refs','[]'))with ordinality x(v,n)
 union all select coalesce(v->>'recipe_code',v->>'code'),1000,'rate' from (select p_row->'sor_ref' v)s
 union all select coalesce(v->>'recipe_code',v->>'master_code'),1001,coalesce(v->>'rate_component','rate') from (select p_row->'resource_identity' v)s
 union all select v#>>'{}',2000+n,coalesce(p_row->'price_lookup'->>'rate_component','rate') from jsonb_path_query(coalesce(p_row->'price_lookup','{}'),'strict $.**.recipe_code')with ordinality x(v,n)
 union all select coalesce(v->>'recipe_code',v->>'master_code',v#>>'{}'),3000+n,coalesce(v->>'component','rate') from jsonb_array_elements(coalesce(p_row->'_candidates','[]'))with ordinality x(v,n)
 ), ranked as(select code,min(n) n,(array_agg(component order by n))[1] component from refs where code like 'SOR-%' group by code)
 select coalesce(jsonb_agg(jsonb_build_object('code',r.recipe_code,'description',r.description,'unit',r.unit,'component',a.component,'medium',lower(coalesce(r.variants->>'value',''))='medium') order by a.n,r.recipe_code),'[]')
 from ranked a join public."SOR_Recipie"r on r.recipe_code=a.code
 where coalesce(r.metadata->>'item_type','') not in('conveyance_matrix','conveyance_matrix_cell');
$f$;

create or replace function public.individual_cost_catalogue(p_owner text,p_kind text,p_year text,p_query text default '',p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set plan_cache_mode=force_custom_plan as $f$
declare result jsonb;
begin
 if p_owner not in('MORTH','SSR') or p_kind not in('materials','machinery','labour') or p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid resource page';end if;
 with filtered as materialized(
 select *,public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index) k from public.individual_cost_source_rows(p_owner,p_year)
 where kind=p_kind and coalesce(trim(row_data->>'desc'),'')<>'' and lower(trim(row_data->>'desc')) not in('nil','nill','none','total','subtotal')
 ), groups as materialized(
 select k,min(row_data->>'desc') description,min(coalesce(row_data->>'unit','')) unit,min(source_code) first_code,count(*) usages,count(distinct source_code) analyses,
 (array_agg(row_data order by source_code,scope,line_index))[1] sample,
 min(case when row_data->>'rate' ~ '^[0-9,.]+$' then replace(row_data->>'rate',',','')::numeric else null end) min_rate,
 max(case when row_data->>'rate' ~ '^[0-9,.]+$' then replace(row_data->>'rate',',','')::numeric else null end) max_rate
 from filtered group by k having coalesce(trim(p_query),'')='' or bool_or(row_data->>'desc' ilike '%'||p_query||'%')
 ), page as(select * from groups order by description,k limit p_limit offset p_offset)
 select jsonb_build_object('owner',p_owner,'kind',p_kind,'year',p_year,'total',(select count(*) from groups),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('key',k,'description',description,'unit',unit,'usages',usages,'analyses',analyses,
 'sample',sample||jsonb_build_object('_evidence',e.link),'minRate',min_rate,'maxRate',max_rate,'choices',public.individual_cost_choices(sample||jsonb_build_object('_candidates',coalesce(e.link->'candidates','[]'))))) from page left join lateral(select l link from public.morth m cross join lateral jsonb_array_elements(m.component_links)l where p_owner='MORTH' and m.code=page.first_code and l->>'resource_key'=sample->>'resource_key' limit 1)e on true),'[]')) into result;
 return result;
end $f$;

create or replace function public.individual_cost_usages(p_owner text,p_year text,p_key jsonb) returns jsonb
language sql stable security invoker set search_path=pg_catalog set jit=off as $f$
 select coalesce(jsonb_agg(jsonb_build_object('code',source_code,'scope',scope,'section',kind,'index',line_index)order by source_code,scope,line_index),'[]')
 from public.individual_cost_source_rows(p_owner,p_year) where public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index)=p_key;
$f$;

create or replace function public.morth_picker_browse(p_path jsonb default '{}',p_query text default '',p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog set jit=off as $f$
declare result jsonb;lvl text;
begin
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid MoRTH page';end if;
 lvl:=case when coalesce(trim(p_query),'')<>'' or p_path ? 'heading' then 'item' when p_path ? 'part' then 'heading' else 'part' end;
 with rows as materialized(select * from public."MORTH_Recipie_View"v where (not p_path?'part' or part=p_path->>'part') and (not p_path?'heading' or heading=p_path->>'heading')
 and(coalesce(trim(p_query),'')='' or description ilike '%'||p_query||'%' or printed_item=p_query))
 select jsonb_build_object('level',lvl,'total',case when lvl='item' then (select count(*) from rows)else 0 end,'rows',
 case when lvl='item' then coalesce((select jsonb_agg(jsonb_build_object('code',code,'description',description,'unit',unit,'part',part,'heading',heading,'printedItem',printed_item,'variant',analysis_variant,'category',project_category,'sourceCodes',source_codes_by_category,'edition',source_edition))from(select * from rows order by chapter::integer,printed_item,code limit p_limit offset p_offset)p),'[]')
 else coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',key,'count',n)order by ch,key)from(select case when lvl='part' then part else heading end key,count(*)n,min(chapter::integer)ch from rows group by 1)g),'[]')end)into result;
 return result;
end $f$;

create or replace function public.morth_picker_detail(p_code text,p_category text default 'medium') returns jsonb
language sql stable security invoker set search_path=pg_catalog as $f$
 select jsonb_build_object('code',m.code,'recipe',m.recipe,'links',m.component_links,'context',m.source_context,'hash',m.content_hash,
 'candidates',coalesce((select jsonb_object_agg(l->>'resource_key',l) from jsonb_array_elements(m.component_links)l where l?'resource_key'),'{}'))
 from public.morth m where m.code=coalesce((select v.source_codes_by_category->>p_category from public."MORTH_Recipie_View"v where v.code=p_code),p_code);
$f$;
revoke all on function public.individual_cost_source_rows(text,text) from public;
grant execute on function public.individual_cost_source_rows(text,text) to anon,authenticated,service_role;
grant execute on function public.individual_cost_key(text,text,jsonb,text),public.individual_cost_choices(jsonb),public.individual_cost_catalogue(text,text,text,text,integer,integer),public.individual_cost_usages(text,text,jsonb),public.morth_picker_browse(jsonb,text,integer,integer),public.morth_picker_detail(text,text) to anon,authenticated,service_role;
