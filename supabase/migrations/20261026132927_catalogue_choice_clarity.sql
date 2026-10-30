-- Human-readable item choices, with the distinctions visible before opening details.
-- Existing technical recipes and prices remain unchanged.
create function public.catalogue_choice_guidance(
 p_source text,p_code text,p_description text,p_section text,p_recipe jsonb default '{}'
) returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog as $fn$
declare
 d text:=trim(regexp_replace(coalesce(p_description,''),'\s+',' ','g'));
 g jsonb; title text; purpose text; family text; mortar text; thick text;
 facts jsonb:='[]'; head text; grade text; sort text; context text; r jsonb;
begin
 g:=public.concrete_selection_guidance(p_source,p_code,
  regexp_replace(p_description,'\mM\s*[-]?\s*([0-9]{1,2})\M','M\1','gi'),p_section,p_recipe);
 if g is null then
  g:=jsonb_build_object('version',1,'shortSummary',d,'grades','[]'::jsonb,'application',d,
   'scope','[]'::jsonb,'searchTerms','[]'::jsonb,'source',jsonb_build_object(
    'kind','published_description_and_recipe','code',p_code,'descriptionHash',md5(coalesce(p_description,''))));
 end if;
 g:=jsonb_set(g,'{source,descriptionHash}',to_jsonb(md5(coalesce(p_description,''))));
 if p_source='SSR' and d ~* 'for wearing coat' then g:=jsonb_set(g,'{application}','"wearing coat"'); end if;
 head:=regexp_replace(d,'(?i)^(providing\s*[, &]+(?:and\s+)?|providing and |providing )','');
 head:=regexp_replace(head,'(?i)^(constructing|laying|fixing)\s+','');
 head:=split_part(regexp_replace(head,'(?i)\s+including(?:\s+cost)?\M.*$',''),' (',1);
 head:=upper(left(head,1))||substr(head,2);
 title:=case when p_source='MORTH' then coalesce(g->>'shortSummary',d) else head end;
 family:='source';
 if d ~* '\m(?:CM|cement mortar)\s*[0-9]+\s*:' then
  mortar:=regexp_replace(substring(d from '(?i)(?:\mCM|cement mortar)\s*([0-9]+\s*:\s*[0-9]+)'),'\s','','g');
 end if;
 thick:=substring(d from '(?i)([0-9.]+\s*(?:mm|cm)\s*thick)');
 if thick is not null then thick:=regexp_replace(thick,'\s*thick$','','i'); end if;
 if d ~* '^Providing\s+[0-9.]+\s*mm\s*thick\s+plastering|^[0-9.]+\s*mm\s+(cement\s+)?plaster' then
  family:='plaster'; title:=concat_ws(' · ',concat_ws(' ',thick,'cement plaster'),case when mortar is not null then 'CM '||mortar end);
  purpose:='Surface finishing coat';
  if mortar is not null then purpose:=purpose||'. Mortar '||mortar||' means '||split_part(mortar,':',1)||' cement : '||split_part(mortar,':',2)||' sand by volume'; end if;
  purpose:=purpose||'.';
 elsif d ~* '\mpointing\M' and d ~* '^Providing cement mortar pointing' then
  family:='pointing'; title:=concat_ws(' · ','Stone masonry joint pointing',case when mortar is not null then 'CM '||mortar end);
  purpose:='Finishes the joints between face stones; the work is joint pointing rather than a plaster coat.';
 elsif d ~* '(un-coursed|uncoursed|coursed rubble|face stone masonry)' and d !~* '\mM\s*-?\s*[0-9]+\M' then
  family:='masonry'; sort:=case when d ~* 'first sort' then 'First sort' when d ~* 'second sort' then 'Second sort' end;
  context:=case when d ~* 'sub-structure portions' then 'Substructure' when d ~* 'super-structure portions' then 'Superstructure' when d ~* 'canal side lining' then 'Canal side lining' end;
  title:=concat_ws(' · ',case when d ~* 'un-coursed|uncoursed' then 'Uncoursed rubble stone masonry' else 'Coursed rubble stone masonry' end,sort,context,case when mortar is not null then 'CM '||mortar end);
  purpose:=case when sort='First sort' then 'Stonework in regular courses with more closely dressed stones. Choose for a first-sort masonry specification.'
   when sort='Second sort' then 'Stonework in courses with less stringent stone dressing than first sort. Choose for a second-sort masonry specification.'
   when d ~* 'un-coursed|uncoursed' then 'Stone masonry without regular horizontal courses.'
   else 'Face stone masonry laid in courses.' end;
  if sort is not null then g:=g||jsonb_build_object('terminologyReference',jsonb_build_object(
   'title','CPWD masonry terminology: first and second sort (project specification governs)',
   'url','https://cpwd.gov.in/Publication/speci_vol1.pdf')); end if;
 elsif jsonb_array_length(g->'grades')>0 then
  family:='concrete'; select string_agg(value,' / ') into grade from jsonb_array_elements_text(g->'grades');
  if p_source='SSR' then
   title:=grade||' · '||upper(left(g->>'application',1))||substr(g->>'application',2);
   purpose:=case
    when g->>'application'='coping slab' then 'Concrete for the coping slab, including its formwork.'
    when g->>'application'='dam plain mass concrete' then 'Plain concrete work in dams; select the grade and aggregate size specified for the pour.'
    when g->>'application'='foundation filling' then 'Concrete filling for foundations; compare grade and aggregate size.'
    when g->>'application'='canal bed and side lining' then 'Concrete lining for the canal bed and sides; compare thickness and laying method.'
    when g->>'application' like 'precast PCC%' then 'Manufacture of precast concrete slabs; compare slab size and lining versus lug type.'
    else 'Concrete for '||(g->>'application')||'; compare the grade, aggregate and work scope.' end;
  else
   purpose:=case when p_code like 'MORTH-2019-21.%' then 'Concrete production at the plant. Placement and other parent work are priced in the parent analysis.'
    when d ~* 'solid slab' then 'Concrete for a solid bridge slab; compare grade, height and placing method.'
    when d ~* 'open.foundation' then 'Concrete for an open foundation; compare plain or reinforced concrete and placement method.'
    when d ~* 'pile' then 'Pile or pile-cap work; compare the pile type, dimensions and reinforcement scope.'
    else null end;
  end if;
 elsif d ~* '^Excavation|^Earth work in excavation' then
  family:='excavation'; context:=case when p_code like 'IRR-TAW-%' then 'Tunnel' when p_code like 'IRR-DAW-%' then 'Dam foundation' when p_code like 'IRR-CCDW-%' then 'Structure foundation' else 'Canal / channel' end;
  title:=context||' excavation · '||case when d ~* 'blasting prohibited|without blasting' and d ~* 'hard rock' then 'Hard rock, blasting prohibited'
   when d ~* 'controlled blasting' then 'Hard rock, controlled blasting' when d ~* 'line drilling|smooth blasting' then 'Rock profile trimming'
   when d ~* 'hard rock' then 'Hard rock, blasting' when d ~* 'ordinary rock|ordnary rock' then 'Ordinary rock, no blasting'
   when d ~* 'silt removal' then 'Tank-bed silt removal' else 'Soil' end;
  purpose:='Excavation work; choose the material class, permitted excavation method and disposal conditions stated in the specification.';
 elsif d ~* '\membankment\M' and d ~* 'hearting|casing|homogeneous' then
  family:='embankment'; title:=case when d ~* 'homogeneous' then 'Homogeneous soil embankment' when d ~* 'hearting' then 'Impervious hearting embankment' else 'Pervious / semi-pervious casing embankment' end;
  context:=case when d ~* 'borrow' then 'Borrow soil' when d ~* 'dump' then 'Dump material' when d ~* 'heaps' then 'Soil already in heaps' end;
  title:=concat_ws(' · ',title,context);
  purpose:='Forms the specified zone of an embankment; compare soil source, layer thickness and compaction requirements.';
 elsif d ~* 'reinforcement steel bars' then
  family:='reinforcement'; title:='Reinforcement steel · fabrication and placing'; purpose:='Reinforcing bars for RCC work, including the cutting, bending and fixing operations listed in the item.';
 elsif d ~* 'hume pipes' then
  family:='pipes'; context:=substring(d from '(?i)([0-9]+\s*mm)\s*dia'); title:=concat_ws(' · ',context||' Hume pipe','laying and jointing');
  purpose:='Installation and jointing of the pipe; check the pipe class and whether supply is included.';
 elsif d ~* 'stone slabs for coping' then
  family:='coping_stone'; title:=concat_ws(' · ',thick||' stone coping',case when d ~* 'two line dressed' then 'Two-line dressed' when d ~* 'one line dressed' then 'One-line dressed' else 'Rough dressed' end);
  purpose:='Stone slabs used for coping; compare the specified stone dressing and joint mortar.';
 elsif d ~* 'stone pitching' then
  family:='pitching'; title:=concat_ws(' · ',thick||' stone pitching',case when d ~* 'dry' then 'Dry, no mortar' else 'Mortared' end,case when d ~* 'khandki' then 'Khandki stone' end);
  purpose:='Stone protection to the specified surface or slope; compare thickness, stone type and dry versus mortared construction.';
 elsif d ~* 'sand filling|rubble and sand filling|rubble / boulder and sand filling' then
  family:='filling'; title:=case when d ~* 'rubble|boulder' then 'Rubble / boulder and sand filling' else 'Sand filling' end;
  purpose:='Filling work with the specified material and compaction; check the location and source included in the item.';
 elsif d ~* 'CNS.*soil lining|cohesive non-swelling' then
  family:='cns'; title:='CNS soil lining · canal'; purpose:='Cohesive non-swelling soil lining; compare soil source, layer thickness and compaction.';
 elsif d ~* 'vertical lift gates|radial gate|hoist' then
  family:='gate'; title:=head; purpose:='Gate or hoisting equipment; match the gate type, vent dimensions and included supply / erection scope.';
 end if;
 if thick is not null and family in ('plaster','pitching','cns','coping_stone') then facts:=facts||jsonb_build_array(jsonb_build_object('label','Thickness','value',thick)); end if;
 if mortar is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Mortar','value',mortar)); end if;
 if sort is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Stone sort','value',sort)); end if;
 if grade is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Grade','value',grade)); end if;
 if g->>'aggregate' is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Aggregate','value',g->>'aggregate')); end if;
 if g->>'dimensions' is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Dimensions','value',g->>'dimensions')); end if;
 if g->>'height' is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Height','value',g->>'height')); end if;
 if g->>'method' is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Method','value',g->>'method')); end if;
 if d ~* 'excluding pipes and collars|excluding cost of pipes' then
  g:=jsonb_set(g,'{scope}',(g->'scope')||jsonb_build_array(jsonb_build_object('label','Pipe supply','detail','Excluded; this item is laying and jointing.')));
 end if;
 return g||jsonb_strip_nulls(jsonb_build_object('displayTitle',title,'purpose',purpose,'family',family,'choiceFacts',facts,
  'searchTerms',(g->'searchTerms')||jsonb_build_array(title,coalesce(purpose,''),facts::text)));
end $fn$;

create or replace function public.set_concrete_selection_guidance() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $fn$
declare s text; c text; g jsonb;
begin
 if tg_table_name='SSR_Recipe' then s:='SSR';c:=new.recipe_code;
  g:=public.catalogue_choice_guidance(s,c,new.description,new.section_heading,to_jsonb(new));
 else s:='MORTH';c:=new.code;
  g:=public.catalogue_choice_guidance(s,c,new.description,new.section_heading,new.recipe);
 end if;
 insert into public.catalogue_item_guidance(source,code,guidance) values(s,c,g)
  on conflict(source,code) do update set guidance=excluded.guidance;
 return new;
end $fn$;

insert into public.catalogue_item_guidance(source,code,guidance)
 select 'SSR',code,public.catalogue_choice_guidance('SSR',code,description,section_heading,to_jsonb(s))
 from public.ssr_item s where subject like 'IRR-%'
 union all
 select 'MORTH',m.code,public.catalogue_choice_guidance('MORTH',m.code,m.description,m.section_heading,m.recipe)
 from public.morth m join public.catalogue_item_guidance g on g.source='MORTH' and g.code=m.code
 on conflict(source,code) do update set guidance=excluded.guidance;
revoke all on function public.catalogue_choice_guidance(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.catalogue_choice_guidance(text,text,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
