-- Selection guidance is descriptive metadata. It never changes quantities, rates,
-- published wording, recipe identities or the calculator's inclusion rules.
create or replace function public.concrete_selection_guidance(
 p_source text, p_code text, p_description text, p_section text,
 p_recipe jsonb default '{}'::jsonb
) returns jsonb language plpgsql immutable security invoker
set search_path = pg_catalog as $fn$
declare
 d text := trim(regexp_replace(coalesce(p_description,''),'\s+',' ','g'));
 grades text[]; app text; method text; agg text; dimensions text; height text;
 summary text; scope jsonb := '[]'; allowance jsonb; cement text; transport text;
 production boolean := p_source='MORTH' and p_code like 'MORTH-2019-21.%';
begin
 -- A dimension such as "0.50 M 16 Elements" is not concrete grade M16.
 if p_source='SSR' and d !~* '(concrete|\mRCC\M|\mPCC\M)' then return null; end if;
 select array_agg(g order by n) into grades from (
  select 'M'||(m)[1] g,min(n) n
  from regexp_matches(d,'\mM[ -]?([0-9]{1,2})\M','gi') with ordinality a(m,n)
  group by (m)[1]
 ) s;
 if coalesce(cardinality(grades),0)=0 then return null; end if;

 if p_source='SSR' then
  app := case
   when d ~* 'coping slab' then 'coping slab'
   when d ~* 'pre-cast RCC template' then 'precast RCC canal template walls'
   when d ~* 'PCC lug slabs' then 'precast PCC lug slabs'
   when d ~* 'PCC lining slabs' then 'precast PCC lining slabs'
   when d ~* 'canal.*lining|lining of canal' then 'canal bed and side lining'
   when d ~* 'foundation filling' then 'foundation filling'
   when d ~* 'well bottom plug' then 'well bottom plug'
   when d ~* 'well top plug' then 'well top plug'
   when d ~* 'well kerb' then 'well kerb'
   when d ~* 'well steining' then 'well steining'
   when d ~* 'well cap' then 'well cap'
   when d ~* 'gravity type retaining' then 'gravity retaining walls, piers and abutments'
   when d ~* 'cantiliver|cantilever|counterfort' then 'cantilever / counterfort retaining walls'
   when d ~* 'for piers and abutments' then 'piers and abutments'
   when d ~* 'sub-structure / super- structure' then 'substructure / superstructure concrete'
   when d ~* 'cast in-situ pipes' then 'cast-in-situ concrete pipes'
   when d ~* 'deck slab & kerb' then 'deck slab and kerb'
   when d ~* 'slabs for small culverts' then 'small culvert slabs'
   when d ~* 'columns and beams' then 'columns and beams'
   when d ~* 'for troughs' then 'concrete troughs'
   when d ~* 'ornamental parapet' then 'RCC ornamental parapet'
   when d ~* 'solid parapet' then 'RCC solid parapet'
   when d ~* 'protective railing' then 'protective railing with concrete posts'
   when d ~* 'hectometre stone' then 'hectometre stone with concrete bedding'
   when d ~* 'kilometre stone' then 'kilometre stone with concrete bedding'
   when d ~* 'porous concrete body drain' then 'porous concrete body drain'
   when d ~* 'RCC manhole' then 'RCC manhole and cover'
   when d ~* 'spillway bridge' then 'dam spillway bridge and reinforced concrete block-outs'
   when d ~* 'RCC works of gallery' then 'dam galleries, sluices and spillway RCC'
   when d ~* 'gravity type structures' and p_code like 'IRR-DAW-%' then 'dam gravity structures'
   when d ~* 'plain concrete works' and p_code like 'IRR-DAW-%' then 'dam plain mass concrete'
   when d ~* 'filling and levelling over-cuts' then 'tunnel bed overcut filling'
   when d ~* 'kerb and bed lining' then 'tunnel kerb and bed lining'
   when d ~* 'sides and arch lining' then 'tunnel sides and arch lining'
   else null end;
  -- Unrecognised future work stays source text, never an invented application.
  app := coalesce(app, d);
  agg := substring(d from '(?i)([0-9]+)\s*mm\s*(?:and\s*)?down');
  if agg is not null then agg := agg||' mm aggregate'; end if;
  dimensions := substring(d from '(?i)([0-9.]+\s*x\s*[0-9.]+\s*x\s*[0-9.]+\s*mm)');
  if dimensions is null and app='canal bed and side lining' then
   dimensions := substring(d from '(?i)([0-9]+\s*mm\s*thick)');
  end if;
  if d ~* 'small culverts' then dimensions := substring(d from '(?i)(span upto [0-9-]+ mts)'); end if;
  method := case
   when d ~* 'mechanical paver' then 'mechanical paver'
   when d ~* 'tremie or skip' then 'tremie / skip box'
   when d ~* 'manual lining' then 'manual lining'
   when d ~* 'manufacturing|manucturing|pre-cast' then 'precast manufacture'
   when d ~* 'insitu|in-situ|in situ' then 'cast in situ'
   else null end;
  summary := concat_ws(' · ',array_to_string(grades,' / ')||' '||app,dimensions,agg,
    case when method in ('mechanical paver','tremie / skip box','manual lining') then method end);
  if d ~* 'including[^.;]*(formwork|shuttering)' and d !~* 'excluding[^.;]*(formwork|shuttering)' then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Formwork','detail','Included in this published item.'));
   if app='coping slab' then summary := summary||' · includes formwork'; end if;
  elsif d ~* 'excluding[^.;]*(formwork|shuttering)' then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Formwork','detail','Excluded by the published description.'));
  end if;
  cement := substring(d from '(?i)cement content\s*:?\s*([0-9.]+)\s*kg\s*/\s*cum');
  if cement is not null then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Source cement content','detail',cement||' kg/cum; recipe allowances remain as published.'));
  end if;
  transport := substring(d from '(?i)((?:initial )?lead (?:up\s*to\s*)?[0-9.]+\s*(?:km|m)\M[^.()]*)');
  if transport is not null then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Published carriage / lift','detail',trim(transport,'. ')));
  end if;
 else
  -- MoRTH already has concise, scope-specific source descriptions. Preserve
  -- diameter, height, manual/pump placement and mixed-grade distinctions.
  app := d;
  summary := d;
  height := nullif(p_recipe->>'source_height_band','');
  method := case when d ~* 'batching plant.*pump|batching plant.*boom pump' then 'batching plant / transit mixer / pump'
   when d ~* 'batching plant.*manual' then 'batching plant / transit mixer / manual placing'
   when d ~* 'pump placing|, pump\M' then 'pump placing'
   when d ~* 'manual placing' then 'manual placing'
   when production then 'concrete production sub-analysis'
   else null end;
  if production then summary := d||' · production appendix'; end if;
  for allowance in select value from jsonb_array_elements(coalesce(p_recipe->'calculation'->'percentage_allowances','[]'))
   where value->>'source_note' ~* '(formwork|staging|shuttering)'
  loop
   scope := scope||jsonb_build_array(jsonb_build_object('label','Formwork / staging',
    'detail',concat(allowance->>'percent','% source allowance',
      case when allowance->>'require_explicit_project_selection'='true' then '; requires project selection' else '' end,
      '. ',allowance->>'source_note'),
    'printedPage',allowance->'printed_page'));
  end loop;
  if d ~* 'reinforcement excluded' then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Reinforcement','detail','Excluded; price reinforcement separately.'));
  elsif d ~* 'including reinforcement|with reinforcement' then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Reinforcement','detail','Included as described by this item.'));
  end if;
  if production then
   scope := scope||jsonb_build_array(jsonb_build_object('label','Rate scope','detail','Production sub-analysis; parent placement, formwork and other work are separate.'));
  end if;
 end if;
 return jsonb_strip_nulls(jsonb_build_object(
  'version',1,'shortSummary',summary,'grades',to_jsonb(grades),'application',app,
  'method',method,'aggregate',agg,'dimensions',dimensions,'height',height,
  'scope',scope,'searchTerms',to_jsonb(array_remove(array[
   app,method,agg,dimensions,p_section,
   case when p_source='SSR' and p_code like 'IRR-DAW-%' then 'dam works' end,
   case when d ~* 'formwork|shuttering' or scope::text ~* 'formwork' then 'formwork shuttering centering' end,
   case when app ~* 'coping' then 'coping slab' end,
   case when production then 'appendix concrete production batching' end,
   case when d ~* 'reinforced|\mRCC\M' then 'reinforced concrete' end,
   case when d ~* '\mPCC\M|plain concrete' then 'plain concrete' end
  ],null)),
  'source',jsonb_build_object('kind','published_description_and_recipe','code',p_code,
    'descriptionHash',md5(coalesce(p_description,'')),'pages',p_recipe->'source_pages')
 ));
end $fn$;

-- SSR technical recipes are immutable. Keep catalogue annotations in a separate
-- read-only-to-clients table, leaving the existing ssr_item view untouched.
create table public.catalogue_item_guidance (
 source text not null check (source in ('SSR','MORTH')),
 code text not null,
 guidance jsonb not null check(jsonb_typeof(guidance)='object'),
 primary key(source,code)
);
alter table public.catalogue_item_guidance enable row level security;
revoke all on public.catalogue_item_guidance from anon,authenticated;
grant select on public.catalogue_item_guidance to anon,authenticated;
grant all on public.catalogue_item_guidance to service_role;
create policy catalogue_guidance_read on public.catalogue_item_guidance
 for select to anon,authenticated using(true);
comment on table public.catalogue_item_guidance is 'Source-derived concrete selection summaries. No pricing data or changes to technical recipes.';

create view public.ssr_catalogue_items with (security_invoker=true) as
 select s.code,s.subject,s.description,s.section_heading,s.unit,
  case when g.guidance->'source'->>'descriptionHash'=md5(s.description) then g.guidance end selection_guidance
 from public.ssr_item s left join public.catalogue_item_guidance g on g.source='SSR' and g.code=s.code;
grant select on public.ssr_catalogue_items to anon,authenticated,service_role;

create function public.set_concrete_selection_guidance() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $fn$
declare s text; c text; g jsonb;
begin
 if tg_table_name='SSR_Recipe' then
  s:='SSR'; c:=new.recipe_code;
  g:=public.concrete_selection_guidance(s,c,new.description,new.section_heading);
 else
  s:='MORTH'; c:=new.code;
  g:=public.concrete_selection_guidance(s,c,new.description,new.section_heading,new.recipe);
 end if;
 if g is not null then
  insert into public.catalogue_item_guidance(source,code,guidance) values(s,c,g)
   on conflict(source,code) do update set guidance=excluded.guidance;
 else
  delete from public.catalogue_item_guidance where source=s and code=c;
 end if;
 return new;
end $fn$;
create trigger ssr_concrete_selection_guidance after insert or update of description,section_heading
 on public."SSR_Recipe" for each row execute function public.set_concrete_selection_guidance();
create trigger morth_concrete_selection_guidance after insert or update of description,section_heading,recipe
 on public.morth for each row execute function public.set_concrete_selection_guidance();

insert into public.catalogue_item_guidance(source,code,guidance)
 select source,code,g from (
  select 'SSR' source,code,public.concrete_selection_guidance('SSR',code,description,section_heading) g
   from public.ssr_item where description ~* '\mM[ -]?[0-9]{1,2}\M'
  union all
  select 'MORTH',code,public.concrete_selection_guidance('MORTH',code,description,section_heading,recipe)
   from public.morth where description ~* '\mM[ -]?[0-9]{1,2}\M'
 ) s where g is not null;

-- All words are matched independently. Grade and dimensions use whole tokens:
-- M5 cannot match M50, and punctuation does not defeat "M-25 slab pump".
create function public.catalogue_search_normalize(p_text text) returns text
language sql immutable security invoker set search_path=pg_catalog as $fn$
 select trim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_text,'')),
  '\m(m|np)\s*[-–—]?\s*([0-9]{1,3})\M','\1\2','g'),
  '([0-9])\s+(mm|cm|kg|sqm|cum|rm|nos)\M','\1\2','g'),'[^a-z0-9.]+',' ','g'));
$fn$;
create function public.catalogue_search_matches(p_text text,p_query text) returns boolean
language sql immutable security invoker set search_path=pg_catalog as $fn$
 select not exists(select 1 from regexp_split_to_table(public.catalogue_search_normalize(p_query),'\s+') token
  where token<>'' and token not in ('a','an','and','for','of','the','with','grade') and
   case when token ~ '^(m[0-9]+|np[0-9]+|[0-9]+(mm|cm|kg|sqm|cum|rm|nos))$'
    then not(token=any(string_to_array(public.catalogue_search_normalize(p_text),' ')))
    else strpos(public.catalogue_search_normalize(p_text),token)=0 end);
$fn$;

create or replace function public.morth_picker_browse(p_path jsonb default '{}',p_query text default '',p_offset integer default 0,p_limit integer default 100)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog set jit=off as $fn$
declare result jsonb;lvl text;
begin
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid MoRTH page';end if;
 lvl:=case when coalesce(trim(p_query),'')<>'' or p_path ? 'heading' then 'item' when p_path ? 'part' then 'heading' else 'part' end;
 with rows as materialized(
  select v.*,g.guidance selection_guidance from public.morth_picker_index v
  left join public.catalogue_item_guidance g on g.source='MORTH'
   and g.code=coalesce(v.source_codes_by_category->>(p_path->>'category'),v.code)
  where (not p_path?'part' or v.part=p_path->>'part') and (not p_path?'heading' or v.heading=p_path->>'heading')
  and(not p_path?'category' or v.project_category is null or v.project_category='not_applicable' or v.source_codes_by_category ? (p_path->>'category'))
  and(coalesce(trim(p_query),'')='' or public.catalogue_search_matches(
    concat_ws(' ',v.code,v.printed_item,v.description,g.guidance->>'shortSummary',
       g.guidance->>'searchTerms'),p_query))
 )
 select jsonb_build_object('level',lvl,'total',case when lvl='item' then (select count(*) from rows)else 0 end,'rows',
 case when lvl='item' then coalesce((select jsonb_agg(jsonb_build_object('code',code,'description',description,'unit',unit,'part',part,'heading',heading,'printedItem',printed_item,'variant',analysis_variant,'category',project_category,'sourceCodes',source_codes_by_category,'edition',source_edition,'guidance',selection_guidance))from(select * from rows order by chapter::integer,printed_item,code limit p_limit offset p_offset)p),'[]')
 else coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',key,'count',n)order by ch,key)from(select case when lvl='part' then part else heading end key,count(*)n,min(chapter::integer)ch from rows group by 1)g),'[]')end)into result;
 return result;
end $fn$;

revoke all on function public.set_concrete_selection_guidance() from public,anon,authenticated;
revoke all on function public.concrete_selection_guidance(text,text,text,text,jsonb) from public,anon,authenticated;
-- Pure normalizers are used by the invoker picker; they expose no extra data.
revoke all on function public.catalogue_search_normalize(text) from public;
revoke all on function public.catalogue_search_matches(text,text) from public;
grant execute on function public.catalogue_search_normalize(text),public.catalogue_search_matches(text,text)
 to anon,authenticated,service_role;
grant execute on function public.concrete_selection_guidance(text,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
