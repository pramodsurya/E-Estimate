-- Current-source browse index; source tables remain authoritative.
set local lock_timeout='3s';
set local statement_timeout='30s';
create or replace view public.sor_picker_source_rows with (security_invoker = true) as
select r.recipe_code, y.year_row_code, y.year, r.part_no,
 coalesce(y.heading,r.heading,'') heading, coalesce(y.section,r.section,'') section,
 coalesce(y.sub_section,r.sub_section,'') subsection, r.table_code, r.structure,
 coalesce(y.to_be_printed->>'description',y.description,r.description) description, r.unit, r.lead_applicability,
 y.item_code, y.metadata->>'rate_status' rate_status,
 y.metadata->>'cost_ready' cost_ready,
 coalesce((y.metadata->>'pdf_page')::integer,
   (y.metadata->'source_row'->>'page')::integer) pdf_page,
 r.variants,
 case when r.variants->>'main_recipe_code' is not null then 'variant:'|| (r.variants->>'main_recipe_code')
 when r.metadata ? 'centering_cell' then 'centering:'||r.table_code||':'||(r.metadata->>'system_id')
 when r.metadata ? 'public_health_cell' then 'matrix:'||r.table_code||':'||coalesce(r.metadata->'public_health_cell'->>'group','')
 else 'item:'||r.recipe_code end family_key,
 case when r.variants->>'main_recipe_code' is not null then coalesce(anchor.description,r.description)
 when r.metadata ? 'centering_cell' then 'System '||(r.metadata->>'system_id')||' · '||coalesce(y.section,r.section)
 when r.metadata ? 'public_health_cell' then r.metadata->'public_health_cell'->>'group'
 else r.description end family_label,
 case when r.metadata ? 'centering_cell' then jsonb_build_object(
   'row',r.metadata->'centering_cell'->'floor','column',r.metadata->'centering_cell'->'member',
   'rowLabel','Floor','columnLabel','Member')
 when r.metadata ? 'public_health_cell' then jsonb_build_object(
   'row',r.metadata->'public_health_cell'->'row','column',r.metadata->'public_health_cell'->'column',
   'rowLabel',replace(r.metadata->'public_health_cell'->>'row_axis','_',' '),
   'columnLabel',replace(r.metadata->'public_health_cell'->>'column_axis','_',' '))
 else null end matrix
from public."SOR_Recipie" r
join public."SOR_Year" y using(recipe_code)
left join public."SOR_Recipie" anchor on anchor.recipe_code=r.variants->>'main_recipe_code'
where coalesce(r.metadata->>'item_type','') not in ('conveyance_matrix','conveyance_matrix_cell');


create table public.sor_picker_index as select * from public.sor_picker_source_rows;
alter table public.sor_picker_index add primary key(year_row_code);
create index sor_picker_index_year_part on public.sor_picker_index(year,part_no);
create index sor_picker_index_recipe_year on public.sor_picker_index(recipe_code,year);
create index sor_picker_index_year_family on public.sor_picker_index(year,family_key);
alter table public.sor_picker_index enable row level security;
create policy sor_picker_index_read on public.sor_picker_index for select to anon,authenticated using(true);
revoke all on public.sor_picker_index from anon,authenticated;
grant select on public.sor_picker_index to anon,authenticated;
grant all on public.sor_picker_index to service_role;
create or replace view public.sor_picker_rows with (security_invoker=true) as
 select recipe_code,year_row_code,year,part_no,heading,section,subsection,table_code,structure,description,unit,lead_applicability,item_code,rate_status,cost_ready,pdf_page,variants,family_key,family_label,matrix from public.sor_picker_index;

create function public.sor_picker_refresh_source() returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
declare affected text[]:='{}'; code text;
begin
 if TG_OP<>'INSERT' then affected:=array_append(affected,OLD.recipe_code); end if;
 if TG_OP<>'DELETE' then affected:=array_append(affected,NEW.recipe_code); end if;
 if TG_TABLE_NAME='SOR_Recipie' then
  affected:=affected||array(select recipe_code from public."SOR_Recipie" where variants->>'main_recipe_code'=any(affected));
 end if;
 for code in select distinct unnest(affected) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('sor-picker:'||code,0));
  delete from public.sor_picker_index where recipe_code=code;
  insert into public.sor_picker_index select * from public.sor_picker_source_rows where recipe_code=code;
 end loop;
 return null;
end $fn$;
revoke all on function public.sor_picker_refresh_source() from public,anon,authenticated;
create trigger sor_picker_recipe_refresh after insert or update or delete on public."SOR_Recipie"
 for each row execute function public.sor_picker_refresh_source();
create trigger sor_picker_annual_refresh after insert or update or delete on public."SOR_Year"
 for each row execute function public.sor_picker_refresh_source();
revoke all on public.sor_picker_source_rows from public,anon,authenticated;
grant select on public.sor_picker_source_rows to service_role;
analyze public.sor_picker_index;
