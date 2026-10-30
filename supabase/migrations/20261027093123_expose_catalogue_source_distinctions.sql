-- Descriptive catalogue metadata only. Source recipes, coefficients and prices are unchanged.
create function public.catalogue_choice_distinctions(
 p_source text,p_code text,p_description text,p_section text,p_recipe jsonb,p_guidance jsonb
) returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog as $fn$
declare
 d text:=trim(regexp_replace(coalesce(p_description,''),'\s+',' ','g'));
 g jsonb:=p_guidance; extra jsonb:='[]'; facts jsonb; v text; title text; t jsonb:=p_recipe->'transport';
begin
 if p_source='MORTH' then
  if p_code like 'MORTH-2019-1.04-%' and t->>'payload_tonnes' is not null then
   extra:=jsonb_build_array(
    jsonb_build_object('label','Payload','value',(t->>'payload_tonnes')||' tonne payload'),
    jsonb_build_object('label','Loaded speed','value',(t->>'loaded_speed_kmph')||' km/h loaded'),
    jsonb_build_object('label','Empty return speed','value',(t->>'empty_speed_kmph')||' km/h empty return'));
   g:=g||jsonb_build_object('descriptionDetail',p_recipe->>'description_detail',
    'purpose','Loading, unloading and stacking are excluded from this haulage analysis.');
   if exists(select 1 from jsonb_array_elements(coalesce(p_recipe->'machinery','[]')) x where x ? 'resource_interpretation') then
    g:=jsonb_set(g,'{scope}',coalesce(g->'scope','[]')||jsonb_build_array(jsonb_build_object(
     'label','Source interpretation','detail','The stored source caption has an equipment inconsistency. The recipe interprets this option as a 25-tonne tipper; review the source before adoption.')));
   end if;
  end if;
  if p_code in ('MORTH-2019-20.079','MORTH-2019-20.128') then
   extra:=extra||jsonb_build_array(jsonb_build_object('label','Rate basis','value',
    case when p_recipe->>'unit'='hour' then 'Hourly equipment operation' else 'Haulage per tonne-km' end));
   g:=g||jsonb_build_object('descriptionDetail',p_recipe->>'description_detail');
  end if;
 else
  -- Correct summaries which collapsed different published work into one title.
  if d ~* 'rockfill casing' then
   title:='Rockfill casing · '||case when d ~* 'dump' then 'Dump-yard stones' else 'Quarry stones' end;
  elsif d ~* '^Excavation for adit' then title:='Adit excavation · Rock';
  elsif d ~* '^Excavation for tunnel' then
   title:='Tunnel excavation · '||case when d ~* 'heading and benching' then 'Heading and benching, supports required'
    when d ~* 'not requiring supports' then 'Rock, no supports required' else 'Soil / rock requiring supports' end;
  elsif d ~* '^Excavation and removal of silt' then
   title:='Canal-bed desilting · '||case when d ~* 'slussy' then 'Slussy condition' else 'Dry condition' end;
  elsif d ~* 'chisel drafted and hammer dressed' then
   title:='Chisel-drafted and hammer-dressed face masonry · CM '||coalesce(substring(d from '(?i)cement mortar\s*([0-9]+\s*:\s*[0-9]+)'),'?');
  elsif d ~* 'semi-pervious / pervious casing hearting' then title:='Pervious / semi-pervious casing and hearting · Soil in heaps';
  end if;
  if g->>'family'='excavation' and d ~* 'line\s+drilling.*smooth blasting' then
   title:=regexp_replace(g->>'displayTitle','Hard rock, (controlled )?blasting','Rock profile trimming, line drilling / smooth blasting');
  end if;
  if d ~* 'breached\s*/\s*damaged' then title:='Breach repair · '||coalesce(title,g->>'displayTitle'); end if;
  if title is not null then g:=g||jsonb_build_object('displayTitle',title); end if;

  if g->>'family' in ('embankment','cns') and d !~* 'rockfill' then
   if g->>'family'='cns' then
    extra:=extra||jsonb_build_array(jsonb_build_object('label','Soil source','value',
     case when d ~* 'heaps' then 'Soil already in heaps' else 'Borrow-area soil' end));
   end if;
   if p_code='IRR-PMW-3-17' then
    extra:=extra||jsonb_build_array(jsonb_build_object('label','Work stage','value','Excavation, transport and spreading'));
   elsif p_code='IRR-PMW-3-18' then
    extra:=extra||jsonb_build_array(jsonb_build_object('label','Work stage','value','Watering and compaction'));
   elsif p_code='IRR-PMW-3-19' then
    extra:=extra||jsonb_build_array(jsonb_build_object('label','Work stage','value','Compaction with 2T roller'));
   end if;
   v:=substring(d from '(?i)density control of not less\s+(?:than\s+)?([0-9]+)\s*percent');
   if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Compaction','value',v||'% minimum density control')); end if;
   v:=substring(d from '(?i)layers?(?:\s+of)?(?:\s+thickness)?(?:\s+of)?(?:\s+not more than)?\s+([0-9.]+(?:\s*(?:to|-)\s*[0-9.]+)?\s*cm)');
   if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Layer thickness','value',v||' layers before compaction')); end if;
   if d ~* 'without watering' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Watering','value','Without watering'));
   elsif d ~* '\mwatering\M' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Watering','value','With watering')); end if;
  end if;

  if g->>'family'='excavation' then
   if d ~* 'field channels' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Application','value','Field channels')); end if;
   v:=substring(d from '(?i)boulders?\s+((?:above|upto)\s+[0-9.]+(?:\s*m)?(?:\s+upto\s+[0-9.]+)?\s*m)');
   if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Boulder size','value','Boulders '||v||' diameter')); end if;
   if d ~* 'including HDR' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Rock scope','value','Including HDR rock')); end if;
   v:=substring(d from '(?i)(carrying capacity of (?:less|more) than 15 cumecs or where the average depth of excavation in hard rock is (?:less|more) than 3 m)');
   if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Applicability','value',v)); end if;
   if d ~* 'backfilling with approved material' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Included work','value','Shoring, bracing and approved backfilling')); end if;
   v:=substring(d from '(?i)(Depth upto [0-9.]+\s*m)');
   if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Depth','value',v)); end if;
  end if;

  if d ~* 'pin headers|through stones' then
   extra:=extra||jsonb_build_array(jsonb_build_object('label','Stone bond','value',
    case when d ~* 'without pin headers' then 'Without pin headers'
     when d ~* 'through stones' then 'With through stones' else 'With pin headers' end));
  elsif p_code ~ '^IRR-CAW-(7-(46|48)|8-(3|6|8|10))$' then
   extra:=extra||jsonb_build_array(jsonb_build_object('label','Stone bond','value','Pin / through stones not specified in description'));
  end if;
  if p_code ~ '^IRR-CAW-7-(45|46|47|48)$' then
   extra:=extra||jsonb_build_array(jsonb_build_object('label','Stone source','value',case when d ~* 'canal excavation' then 'Stones from canal excavation' else 'Stones from approved quarry' end));
  end if;
  v:=substring(d from '(?i)([0-9]+\s*gsm)');
  if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Fabric weight','value',v||' filter fabric')); end if;
  if d ~* 'Primary and Secondary Holes' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Hole purpose','value','Primary and secondary holes'));
  elsif d ~* 'for Test Holes' then extra:=extra||jsonb_build_array(jsonb_build_object('label','Hole purpose','value','Test holes · core samples, logging and core box')); end if;

  -- Keep published transport scope literal: do not infer a missing unit or lead.
  v:=substring(d from '(?i)((?:initial\s+)?lead\s+upto(?:\s+upto)?\s+[0-9.]+\s*(?:km|m)\M(?:\s+for water)?)');
  if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Published lead','value',v)); end if;
  v:=substring(d from '(?i)((?:initial\s+)?lift\s+upto\s+[0-9.]+\s*m\M|all lifts)');
  if v is not null then extra:=extra||jsonb_build_array(jsonb_build_object('label','Published lift','value',v)); end if;
 end if;
 select coalesce(jsonb_agg(f order by first_pos),'[]') into facts from (
  select f,min(n) first_pos from jsonb_array_elements(extra||coalesce(g->'choiceFacts','[]')) with ordinality a(f,n)
  where nullif(f->>'value','') is not null group by f
 ) unique_facts;
 return g||jsonb_build_object('choiceFacts',facts,
  'searchTerms',coalesce(g->'searchTerms','[]')||coalesce((select jsonb_agg(f->'value') from jsonb_array_elements(extra) f),'[]'));
end $fn$;
revoke all on function public.catalogue_choice_distinctions(text,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.catalogue_choice_distinctions(text,text,text,text,jsonb,jsonb) to service_role;

create or replace function public.catalogue_choice_guidance(
 p_source text,p_code text,p_description text,p_section text,p_recipe jsonb default '{}'
) returns jsonb language plpgsql immutable security invoker set search_path=pg_catalog as $fn$
declare
 d text:=trim(regexp_replace(coalesce(p_description,''),'\s+',' ','g'));
 g jsonb; title text; purpose text; family text; mortar text; thick text;
 facts jsonb:='[]'; head text; grade text; sort text; context text; r jsonb;
begin
 if p_source='MORTH' and p_code ~ '^MORTH-2019-1[.]01-[A-D]$' then
  select coalesce(jsonb_agg(jsonb_build_object('label','Equipment','value',x->>'desc') order by n),'[]'::jsonb)
   into facts from jsonb_array_elements(coalesce(p_recipe->'machinery','[]'::jsonb)) with ordinality equipment(x,n)
   where coalesce(x->>'desc','')<>'';
  return jsonb_build_object(
   'version',1,'family','material_handling','displayTitle',d,'shortSummary',d,
   'grades','[]'::jsonb,'application','Loading and unloading bulk road materials',
   'choiceFacts',facts,
   'purpose','Loading by front end loader; unloading by tipping. Haulage and return travel are excluded.',
   'descriptionDetail',p_recipe->>'description_detail',
   'scope',jsonb_build_array(jsonb_build_object('label','Work covered',
    'detail',coalesce(p_recipe->>'description_detail',''))),
   'searchTerms',(select coalesce(jsonb_agg(f->'value'),'[]'::jsonb) from jsonb_array_elements(facts) f)||jsonb_build_array('tipper','front end loader','loading','unloading','tipping'),
   'source',jsonb_build_object('kind','published_description_and_recipe','code',p_code,
    'descriptionHash',md5(coalesce(p_description,''))));
 end if;
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
 head:=regexp_replace(head,'(?i)\s+including(?:\s+cost)?\M.*$','');
 head:=upper(left(head,1))||substr(head,2);
 title:=case when p_source='MORTH' then coalesce(g->>'shortSummary',d) else head end;
 family:='source';
 if d ~* '\m(?:CM|cement mortar)\s*[0-9]+\s*:' then
  mortar:=regexp_replace(substring(d from '(?i)(?:\mCM|cement mortar)\s*([0-9]+\s*:\s*[0-9]+)'),'\s','','g');
 end if;
 thick:=substring(d from '(?i)([0-9.]+\s*(?:mm|cm)\s*thick)');
 if thick is not null then thick:=regexp_replace(thick,'\s*thick$','','i'); end if;
 if p_source='SSR' and d ~* '^Removing and (resetting|refixing)|^Re-constructing|^Repairing' then
  family:='maintenance';title:=head;purpose:='Repair or reinstatement of existing work; compare the material, dimensions and restoration operations in the item.';
 elsif d ~* '^Providing\s+[0-9.]+\s*mm\s*thick\s+plastering|^[0-9.]+\s*mm\s+(cement\s+)?plaster' then
  family:='plaster'; title:=concat_ws(' · ',concat_ws(' ',thick,'cement plaster'),case when mortar is not null then 'CM '||mortar end);
  purpose:='Surface finishing coat';
  if mortar is not null then purpose:=purpose||'. Mortar '||mortar||' means '||split_part(mortar,':',1)||' cement : '||split_part(mortar,':',2)||' sand by volume'; end if;
  purpose:=purpose||'.';
 elsif d ~* '\mpointing\M' and d ~* '^Providing cement mortar pointing' then
  family:='pointing'; title:=concat_ws(' · ','Stone masonry joint pointing',case when mortar is not null then 'CM '||mortar end);
  purpose:='Finishes the mortar joints between face stones.';
 elsif d ~* '(un-coursed|uncoursed|coursed rubble|face stone masonry)' and d !~* '\mM\s*-?\s*[0-9]+\M' then
  family:='masonry'; sort:=case when d ~* 'first sort' then 'First sort' when d ~* 'second sort' then 'Second sort' end;
  context:=case when d ~* 'sub-structure portions' then 'Substructure' when d ~* 'super-structure portions' then 'Superstructure' when d ~* 'canal side lining' then 'Canal side lining' end;
  title:=concat_ws(' · ',case when d ~* 'un-coursed|uncoursed' then 'Uncoursed rubble stone masonry' else 'Coursed rubble stone masonry' end,sort,context,case when mortar is not null then 'CM '||mortar end);
  purpose:=case when sort='First sort' then 'Stonework in regular courses with more closely dressed stones.'
   when sort='Second sort' then 'Coursed stonework with less stringent stone dressing than first sort.'
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
 elsif d ~* 'LDPE sheet' then
  family:='membrane'; context:=substring(d from '(?i)([0-9]+)\s*micron');
  title:=concat_ws(' · ','LDPE canal lining sheet',context||' micron');
  purpose:='Sheet lining for the canal bed and sides; choose the specified sheet thickness.';
  if context is not null then facts:=facts||jsonb_build_array(jsonb_build_object('label','Sheet thickness','value',context||' micron')); end if;
 elsif d ~* 'pressure relief pipes' then
  family:='pressure_relief'; title:=concat_ws(' · ','Pressure-relief pipe',substring(d from '(?i)([0-9.]+\s*cm)\s*long'));
  purpose:='Pressure-relief fitting in canal lining; compare pipe diameter, length and material.';
 elsif d ~* 'sand blanket' then
  family:='blanket';title:=concat_ws(' · ','Sand blanket below embankment',thick);
  purpose:='Sand layer below the embankment; compare the specified thickness and laying scope.';
 elsif d ~* 'vertical lift gates|radial gate|hoist' then
  family:='gate'; title:=head; purpose:='Gate or hoisting equipment; match the gate type, vent dimensions and included supply / erection scope.';
 end if;
 if grade is null and jsonb_array_length(g->'grades')>0 then
  select string_agg(value,' / ') into grade from jsonb_array_elements_text(g->'grades');
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
 g:=g||jsonb_strip_nulls(jsonb_build_object('displayTitle',title,'purpose',purpose,'family',family,'choiceFacts',facts,
  'searchTerms',(g->'searchTerms')||jsonb_build_array(title,coalesce(purpose,''),facts::text)));
 return public.catalogue_choice_distinctions(p_source,p_code,p_description,p_section,p_recipe,g);
end $fn$;

insert into public.catalogue_item_guidance(source,code,guidance)
 select 'SSR',s.code,public.catalogue_choice_guidance('SSR',s.code,s.description,s.section_heading,to_jsonb(s))
 from public.ssr_item s join public.catalogue_item_guidance g on g.source='SSR' and g.code=s.code
 union all
 select 'MORTH',m.code,public.catalogue_choice_guidance('MORTH',m.code,m.description,m.section_heading,m.recipe)
 from public.morth m where exists(select 1 from public.catalogue_item_guidance g where g.source='MORTH' and g.code=m.code)
 or m.code like 'MORTH-2019-1.04-%' or m.code in ('MORTH-2019-20.079','MORTH-2019-20.128')
 on conflict(source,code) do update set guidance=excluded.guidance;
