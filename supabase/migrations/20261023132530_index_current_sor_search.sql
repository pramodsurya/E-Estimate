set local lock_timeout='3s';
set local statement_timeout='30s';
alter table public.sor_picker_index add column search_vector tsvector generated always as
 (to_tsvector('simple'::regconfig,coalesce(recipe_code,'')||' '||coalesce(item_code,'')||' '||
  coalesce(description,'')||' '||coalesce(family_label,'')||' '||coalesce(section,'')||' '||coalesce(subsection,''))) stored;
create index sor_picker_index_search on public.sor_picker_index using gin(search_vector);
create index sor_picker_index_year_item on public.sor_picker_index(year,item_code);
create or replace view public.sor_picker_rows with (security_invoker=true) as select recipe_code,year_row_code,year,part_no,heading,section,subsection,table_code,structure,description,unit,lead_applicability,item_code,rate_status,cost_ready,pdf_page,variants,family_key,family_label,matrix,search_vector from public.sor_picker_index;
create or replace function public.sor_picker_refresh_source() returns trigger language plpgsql security invoker set search_path=pg_catalog as $fn$
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
  insert into public.sor_picker_index(recipe_code,year_row_code,year,part_no,heading,section,subsection,table_code,structure,description,unit,lead_applicability,item_code,rate_status,cost_ready,pdf_page,variants,family_key,family_label,matrix) select recipe_code,year_row_code,year,part_no,heading,section,subsection,table_code,structure,description,unit,lead_applicability,item_code,rate_status,cost_ready,pdf_page,variants,family_key,family_label,matrix from public.sor_picker_source_rows where recipe_code=code;
 end loop;
 return null;
end $fn$;
-- Keep navigation narrow: do not construct every matrix payload to count Parts.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create or replace function public.sor_picker_browse(
 p_year text, p_level text default 'part', p_path jsonb default '{}'::jsonb,
 p_query text default '', p_offset integer default 0, p_limit integer default 100
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off set plan_cache_mode=force_custom_plan as $fn$
declare result jsonb;
begin
 if p_level not in ('part','heading','section','subsection','family','item') then raise exception 'Invalid selector level'; end if;
 if p_offset<0 or p_limit<1 or p_limit>500 then raise exception 'Invalid selector page'; end if;
 if length(coalesce(p_query,''))>300 then raise exception 'Search is too long'; end if;
 if p_level='item' then
  with filtered as not materialized (
   select v.* from public.sor_picker_rows v where year=p_year
    and (not p_path ? 'part' or part_no=(p_path->>'part')::smallint)
    and (not p_path ? 'heading' or heading=p_path->>'heading')
    and (not p_path ? 'section' or section=p_path->>'section')
    and (not p_path ? 'subsection' or subsection=p_path->>'subsection')
    and (not p_path ? 'family' or family_key=p_path->>'family')
    and (coalesce(trim(p_query),'')='' or
      (p_query ~* '^SOR-' and recipe_code ilike '%'||p_query||'%') or
      (p_query !~* '^SOR-' and search_vector @@ websearch_to_tsquery('simple',p_query)) or item_code=p_query)
  ), page as (
   select * from filtered order by pdf_page nulls last,recipe_code limit p_limit offset p_offset
  )
  select jsonb_build_object('year',p_year,'level',p_level,'total',(select count(*) from filtered),
   'rows',coalesce((select jsonb_agg((to_jsonb(page.*)-'search_vector')) from page),'[]'::jsonb)) into result;
 else
  with nodes as materialized (
   select case p_level when 'part' then part_no::text when 'heading' then heading
     when 'section' then section when 'subsection' then subsection else family_key end key,
    min(case p_level when 'part' then part_no::text when 'heading' then heading
     when 'section' then section when 'subsection' then subsection else family_label end) label,
    count(*) count,min(pdf_page) page,min(recipe_code) first_code
   from public.sor_picker_rows where year=p_year
    and (not p_path ? 'part' or part_no=(p_path->>'part')::smallint)
    and (not p_path ? 'heading' or heading=p_path->>'heading')
    and (not p_path ? 'section' or section=p_path->>'section')
    and (not p_path ? 'subsection' or subsection=p_path->>'subsection')
    and (not p_path ? 'family' or family_key=p_path->>'family')
    and (coalesce(trim(p_query),'')='' or
      (p_query ~* '^SOR-' and recipe_code ilike '%'||p_query||'%') or
      (p_query !~* '^SOR-' and search_vector @@ websearch_to_tsquery('simple',p_query)) or item_code=p_query)
   group by 1
  ), page as (
   select * from nodes order by page nulls last,first_code,key limit p_limit offset p_offset
  )
  select jsonb_build_object('year',p_year,'level',p_level,'total',(select count(*) from nodes),
   'rows',coalesce((select jsonb_agg((to_jsonb(page.*)-'search_vector')) from page),'[]'::jsonb)) into result;
 end if;
 return result;
end $fn$;


analyze public.sor_picker_index;
