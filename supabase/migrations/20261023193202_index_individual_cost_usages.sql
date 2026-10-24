set local statement_timeout='120s';
create materialized view public.individual_cost_morth_usages as
select public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index) k,
s.kind,s.source_code,s.scope,s.line_index,m.description,m.printed_item
from public.individual_cost_source_rows('MORTH','')s join public.morth m on m.code=s.source_code;
create index individual_cost_morth_usages_key on public.individual_cost_morth_usages(k);
grant select on public.individual_cost_morth_usages to anon,authenticated,service_role;
create or replace function public.refresh_individual_cost_morth_registry() returns trigger
language plpgsql security definer set search_path=pg_catalog as $f$
begin
 refresh materialized view public.individual_cost_morth_registry;
 refresh materialized view public.morth_picker_index;
 refresh materialized view public.individual_cost_morth_usages;
 return null;
end $f$;
create or replace function public.individual_cost_usages(p_owner text,p_year text,p_key jsonb) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog set jit=off as $f$
declare result jsonb;
begin
 if p_owner='MORTH' then
 select coalesce(jsonb_agg(jsonb_build_object('code',s.source_code,'description',s.description,'printedItem',s.printed_item,'scope',s.scope,'section',s.kind,'index',s.line_index)),'[]') into result
 from (select * from public.individual_cost_morth_usages where k=p_key order by source_code,scope,line_index limit 100)s;
 else
 select coalesce(jsonb_agg(jsonb_build_object('code',s.source_code,'description',r.description,'scope',s.scope,'section',s.kind,'index',s.line_index)),'[]') into result
 from (select * from public.individual_cost_source_rows(p_owner,p_year) where kind=p_key->>1 and public.individual_cost_key(owner,kind,row_data,source_code||':'||scope||':'||line_index)=p_key order by source_code,scope,line_index limit 100)s
 left join public.ssr_item r on r.code=s.source_code;
 end if;
 return result;
end $f$;
