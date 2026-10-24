-- Keep tree groups separate from items; terminal families carry one compact item.
-- Source configuration is checked only for the visible page, never per entire Part.
set local lock_timeout='3s';
set local statement_timeout='30s';
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
   'rows',coalesce((select jsonb_agg((to_jsonb(p.*)-'search_vector') || jsonb_build_object('requires_configuration',(r.recipe_code is null or coalesce(r.variants-'schema_version','{}'::jsonb)<>'{}'::jsonb or coalesce(r.addons-'schema_version','{}'::jsonb)<>'{}'::jsonb) ) order by p.pdf_page nulls last,p.recipe_code) from page p left join public."SOR_Recipie" r using(recipe_code)),'[]'::jsonb)) into result;
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
   'rows',coalesce((select jsonb_agg(to_jsonb(p.*) || jsonb_build_object('item',
    case when p_level='family' and p.count=1 then
     (to_jsonb(v.*)-'search_vector') || jsonb_build_object('requires_configuration',(r.recipe_code is null or coalesce(r.variants-'schema_version','{}'::jsonb)<>'{}'::jsonb or coalesce(r.addons-'schema_version','{}'::jsonb)<>'{}'::jsonb))
    else null end) order by p.page nulls last,p.first_code,p.key)
    from page p
    left join public.sor_picker_rows v on p_level='family' and p.count=1 and v.year=p_year and v.recipe_code=p.first_code
    left join public."SOR_Recipie" r on r.recipe_code=v.recipe_code),'[]'::jsonb)) into result;
 end if;
 return result;
end $fn$;
