-- Current SOR selector. No archived catalogue or estimate compatibility paths.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace view public.sor_picker_rows with (security_invoker = true) as
select r.recipe_code, y.year_row_code, y.year, r.part_no,
 coalesce(y.heading,r.heading,'') heading, coalesce(y.section,r.section,'') section,
 coalesce(y.sub_section,r.sub_section,'') subsection, r.table_code, r.structure,
 coalesce(y.description,r.description) description, r.unit, r.lead_applicability,
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

create or replace function public.sor_picker_browse(
 p_year text, p_level text default 'part', p_path jsonb default '{}'::jsonb,
 p_query text default '', p_offset integer default 0, p_limit integer default 100
) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $fn$
declare result jsonb;
begin
 if p_level not in ('part','heading','section','subsection','family','item') then raise exception 'Invalid selector level'; end if;
 if p_offset<0 or p_limit<1 or p_limit>500 then raise exception 'Invalid selector page'; end if;
 if length(coalesce(p_query,''))>300 then raise exception 'Search is too long'; end if;
 with filtered as materialized (
  select v.* from public.sor_picker_rows v where year=p_year
   and (not p_path ? 'part' or part_no=(p_path->>'part')::smallint)
   and (not p_path ? 'heading' or heading=p_path->>'heading')
   and (not p_path ? 'section' or section=p_path->>'section')
   and (not p_path ? 'subsection' or subsection=p_path->>'subsection')
   and (not p_path ? 'family' or family_key=p_path->>'family')
   and (coalesce(trim(p_query),'')='' or
     to_tsvector('simple',concat_ws(' ',recipe_code,item_code,description,family_label,section,subsection))
       @@ websearch_to_tsquery('simple',p_query) or recipe_code ilike '%'||p_query||'%' or item_code=p_query)
 ), nodes as (
  select case p_level when 'part' then part_no::text when 'heading' then heading
    when 'section' then section when 'subsection' then subsection else family_key end key,
   min(case p_level when 'part' then part_no::text when 'heading' then heading
    when 'section' then section when 'subsection' then subsection else family_label end) label,
   count(*) count,min(pdf_page) page,min(recipe_code) first_code
  from filtered group by 1
 ), page as (
  select * from filtered order by pdf_page nulls last,recipe_code
  limit p_limit offset p_offset
 ), node_page as (
  select * from nodes order by page nulls last,first_code,key limit p_limit offset p_offset
 )
 select jsonb_build_object('year',p_year,'level',p_level,
  'total',case when p_level='item' then (select count(*) from filtered) else (select count(*) from nodes) end,
  'rows',case when p_level='item' then coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)
   else coalesce((select jsonb_agg(to_jsonb(node_page)) from node_page),'[]'::jsonb) end) into result;
 return result;
end $fn$;

create or replace function public.sor_picker_detail(p_code text,p_year text,p_zone text default 'zone_3')
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $fn$
declare resolution jsonb; r public."SOR_Recipie"; y public."SOR_Year"; lead jsonb;
begin
 if p_zone not in ('zone_1','zone_2','zone_3') then raise exception 'Invalid project zone'; end if;
 resolution:=public.sor_resolve_recipe_year(p_code,p_year);
 if coalesce((resolution->>'requires_review')::boolean,false) or resolution->>'recipe_code' is null then
  return jsonb_build_object('resolution',resolution,'quote',jsonb_build_object('status',resolution->>'status','rate',null));
 end if;
 select * into r from public."SOR_Recipie" where recipe_code=resolution->>'recipe_code';
 if coalesce(r.metadata->>'item_type','') in ('conveyance_matrix','conveyance_matrix_cell') then
  raise exception 'Conveyance tariffs are managed in Lead'; end if;
 select * into y from public."SOR_Year" where recipe_code=r.recipe_code and year=p_year;
 select to_jsonb(l) into lead from public."SOR_Lead_Rule" l where l.rule_code=y.metadata->>'lead_rule_code' and l.year=p_year;
 return jsonb_build_object('resolution',resolution,'recipe',to_jsonb(r),
  'annual',jsonb_build_object('year',y.year,'year_row_code',y.year_row_code,'recipe_code',y.recipe_code,
    'description',y.description,'unit',y.unit,'heading',y.heading,'section',y.section,'sub_section',y.sub_section,
    'item_code',y.item_code,'to_be_printed',y.to_be_printed,'rate_detailed',y.rate_detailed,
    'metadata',jsonb_build_object('rate_status',y.metadata->'rate_status','cost_ready',y.metadata->'cost_ready',
      'pdf_page',coalesce(y.metadata->'pdf_page',y.metadata->'source_row'->'page'),
      'rate_component',y.metadata->'rate_component','annual_baselines',y.metadata->'annual_baselines',
      'lead_rule_code',y.metadata->'lead_rule_code','source_notes',y.metadata->'source_notes',
      'source_pdf_sha256',y.metadata->'source_pdf_sha256','source_rate_context',y.metadata->'source_rate_context',
      'recipe_addon_review',y.metadata->'recipe_addon_review')),
  'quote',public.sor_resource_quote(p_code,p_year,p_zone,'rate',null),'lead_rule',lead);
end $fn$;

revoke all on public.sor_picker_rows from public;
grant select on public.sor_picker_rows to anon,authenticated;
revoke all on function public.sor_picker_browse(text,text,jsonb,text,integer,integer) from public;
revoke all on function public.sor_picker_detail(text,text,text) from public;
grant execute on function public.sor_picker_browse(text,text,jsonb,text,integer,integer) to anon,authenticated;
grant execute on function public.sor_picker_detail(text,text,text) to anon,authenticated;
