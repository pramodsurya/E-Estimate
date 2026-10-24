set local statement_timeout='120s';
create materialized view public.individual_cost_morth_registry as
with source as materialized(
 select *,public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index) k
 from public.individual_cost_source_rows('MORTH','')
 where coalesce(trim(row_data->>'desc'),'')<>'' and lower(trim(row_data->>'desc')) not in('nil','nill','none','total','subtotal')
), grouped as(
 select kind,k,min(row_data->>'desc') description,string_agg(distinct row_data->>'desc',' | ') aliases,min(coalesce(row_data->>'unit','')) unit,
 count(*) usages,count(distinct source_code) analyses,min(source_code) first_code,
 (array_agg(row_data order by source_code,scope,line_index))[1] sample
 from source group by kind,k
)
select g.kind,g.k,g.description,g.aliases,g.unit,g.usages,g.analyses,
 g.sample||jsonb_build_object('_evidence',e.link) sample,
 public.individual_cost_choices(g.sample||jsonb_build_object('_candidates',coalesce(e.link->'candidates','[]'))) choices
from grouped g left join public.morth m on m.code=g.first_code
left join lateral(select l link from jsonb_array_elements(m.component_links)l where l->>'resource_key'=g.sample->>'resource_key' limit 1)e on true;
create unique index individual_cost_morth_registry_key on public.individual_cost_morth_registry(kind,k);
grant select on public.individual_cost_morth_registry to anon,authenticated,service_role;
create function public.refresh_individual_cost_morth_registry() returns trigger
language plpgsql security definer set search_path=pg_catalog as $f$
begin
 refresh materialized view public.individual_cost_morth_registry;
 return null;
end $f$;
revoke all on function public.refresh_individual_cost_morth_registry() from public;
create trigger refresh_individual_costs_after_morth after insert or update or delete or truncate on public.morth
for each statement execute function public.refresh_individual_cost_morth_registry();
create or replace function public.individual_cost_catalogue(p_owner text,p_kind text,p_year text,p_query text default '',p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set plan_cache_mode=force_custom_plan as $f$
declare result jsonb;
begin
 if p_owner not in('MORTH','SSR') or p_kind not in('materials','machinery','labour') or p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid resource page';end if;
 if p_owner='MORTH' then
 select jsonb_build_object('owner',p_owner,'kind',p_kind,'year',p_year,'total',(select count(*) from public.individual_cost_morth_registry r where r.kind=p_kind and (coalesce(trim(p_query),'')='' or r.aliases ilike '%'||p_query||'%')),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('key',r.k,'description',r.description,'unit',r.unit,'usages',r.usages,'analyses',r.analyses,'sample',r.sample,'minRate',null,'maxRate',null,'choices',r.choices)) from (select * from public.individual_cost_morth_registry r where r.kind=p_kind and (coalesce(trim(p_query),'')='' or r.aliases ilike '%'||p_query||'%') order by r.description,r.k limit p_limit offset p_offset)r),'[]')) into result;
 return result;
 end if;
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
