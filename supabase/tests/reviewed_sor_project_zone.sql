-- Run against the published reviewed release as the browser's anonymous role.
begin;
set local role anon;
do $$
declare z text; zone_number int; n int; paged int; table_id text; root jsonb; page jsonb; observation jsonb; resolved jsonb;
begin
  for zone_number in 1..3 loop
    z := 'zone_' || zone_number;
    select count(*),min(rate) into n,paged from public.search_sor_reviewed_items('2026-27','bar bender','RB_LABOUR',null,100,0,z);
    if n<>1 or paged<>(case zone_number when 1 then 925 when 2 then 885 else 845 end) then raise exception 'Wrong Bar bender count/rate for %',z; end if;
    select published_variants into n from public.list_sor_reviewed_catalogues('2026-27',z) where catalogue_code='RB_LABOUR';
    if n<>110 then raise exception 'Wrong labour catalogue count for %',z; end if;
    root:=public.browse_sor_reviewed_children('2026-27',null,100,0,null,z);
    select value->>'node_id' into table_id from jsonb_array_elements(root->'entries') where value->>'catalogue_code'='RB_LABOUR';
    if not exists(select 1 from jsonb_array_elements(root->'entries') where value->>'node_id'=table_id and (value->>'available_variant_count')::int=110) then raise exception 'Unscoped index counts'; end if;
    page:=public.browse_sor_reviewed_children('2026-27',table_id,20,0,null,z);
    if (page->>'total_count')::int<>47 or jsonb_array_length(page->'entries')<>20 or not (page->>'has_more')::boolean then raise exception 'Wrong browse pagination'; end if;
    if exists(select 1 from jsonb_array_elements(page->'entries') where value->>'node_type'='variant' and (value#>>'{observation,features,specifications,zone}')::int<>zone_number) then raise exception 'Wrong zone in browse'; end if;
    select count(*),count(distinct occurrence_id) into n,paged from generate_series(0,5) p cross join lateral public.search_sor_reviewed_items('2026-27','','RB_LABOUR',null,20,p*20,z);
    if n<>110 or paged<>110 then raise exception 'Search pagination filtered after limit'; end if;
    if exists(select 1 from public.search_sor_reviewed_items('2026-27','','RB_LABOUR',null,100,0,z) where (features#>>'{specifications,zone}')::int<>zone_number) then raise exception 'Wrong zone in search'; end if;
    resolved:=public.get_sor_reviewed_project_observation('RB_LABOUR_E0414445736B3E50','2026-27',z);
    if (resolved#>>'{features,specifications,zone}')::int<>zone_number or (resolved->>'rate')::numeric<>(case zone_number when 1 then 925 when 2 then 885 else 845 end) then raise exception 'Wrong zone counterpart'; end if;
    if public.get_sor_reviewed_project_observation('RB_LABOUR_E0414445736B3E50','2025-26',z) is not null then raise exception 'Missing year fell back'; end if;
    select to_jsonb(s) into observation from public.search_sor_reviewed_items('2026-27','ELEC-4.10.1.a','ELECTRICAL',null,100,0,z) s;
    if observation is null or (observation->>'rate')::numeric<>2058 then raise exception 'Universal tray rate changed'; end if;
    resolved:=public.get_sor_reviewed_project_observation(observation->>'item_id','2026-27',z);
    if resolved->>'occurrence_id'<>observation->>'occurrence_id' then raise exception 'Universal Recipe changed with zone'; end if;
    -- Anchor an observation beyond the first page without including other zones.
    page:=public.browse_sor_reviewed_children('2026-27',table_id,100,0,null,'zone_'||zone_number);
    select value#>>'{observation,occurrence_id}' into z from jsonb_array_elements(page->'entries') with ordinality e(value,ordinality) where value->>'node_type'='variant' and ordinality>40 order by ordinality limit 1;
    page:=public.browse_sor_reviewed_children('2026-27',table_id,20,0,z,'zone_'||zone_number);
    if (page->>'offset')::int<>40 then raise exception 'Zone-scoped anchor pagination failed'; end if;
  end loop;
  begin
    perform public.browse_sor_reviewed_children('2026-27',null,50,0,null,'zone_4');
    raise exception 'Invalid zone accepted';
  exception when raise_exception then
    if sqlerrm='Invalid zone accepted' then raise; end if;
  end;
  -- Legacy client signatures must remain callable.
  perform public.list_sor_reviewed_catalogues('2026-27');
  perform public.search_sor_reviewed_items('2026-27','bar bender','RB_LABOUR',null,100,0);
  perform public.browse_sor_reviewed_children('2026-27',table_id,50,0,null);
end $$;
rollback;
