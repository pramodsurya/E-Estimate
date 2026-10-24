-- Run with the published dataset. Exercise repeated calls so PostgreSQL's
-- cached plans also stay under the browser's three-second query budget.
begin;
set local role anon;
set local statement_timeout='180s';

do $$
declare rel text; y text; z text; schedule record; section record; entry jsonb;
  page jsonb; next_page jsonb; expected jsonb; expected_nodes jsonb; expected_count bigint; expected_order bigint;
  started timestamptz; anchor text; elapsed interval;
begin
  select release_id into rel from public.sor_dataset_release where status='active';
  for y in select distinct sor_year from public.sor_reviewed_navigation_node where release_id=rel loop
    foreach z in array array['zone_1','zone_2','zone_3'] loop
      -- Independent oracle from the retained source paths, computed once per
      -- context rather than rescanning a whole edition for each displayed node.
      select jsonb_object_agg(id,jsonb_build_object('count',variants,'order',source_order)) into expected_nodes from (
        select p.value->>'node_id' as id,count(*) as variants,min(v.source_order) as source_order
        from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
        cross join lateral jsonb_array_elements(v.path) p(value)
        where v.release_id=rel and v.sor_year=y and (o.project_zone is null or o.project_zone=z)
        group by p.value->>'node_id'
      ) counts;
      started:=clock_timestamp();
      page:=public.browse_sor_reviewed_children(y,null,100,0,null,z);
      elapsed:=clock_timestamp()-started;
      if elapsed>=interval '3 seconds' then raise exception 'Root browse exceeded timeout: %, %, %',y,z,elapsed; end if;
      select count(distinct v.catalogue_code) into expected_count
        from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
        where v.release_id=rel and v.sor_year=y and (o.project_zone is null or o.project_zone=z);
      if (page->>'total_count')::bigint<>expected_count then raise exception 'Root schedule coverage changed'; end if;
      for entry in select value from jsonb_array_elements(page->'entries') loop
        expected_count:=(expected_nodes#>>array[entry->>'node_id','count'])::bigint;
        expected_order:=(expected_nodes#>>array[entry->>'node_id','order'])::bigint;
        if (entry->>'available_variant_count')::bigint<>expected_count or (entry->>'source_order')::bigint<>expected_order then
          raise exception 'Zone-scoped root count/order changed: %, %, %',y,z,entry->>'catalogue_code';
        end if;
      end loop;

      -- Include the reported PVC failure, large direct-item schedules, mixed
      -- nodes/items, and schedules with several levels of source headings.
      for schedule in select * from public.sor_reviewed_navigation_node
        where release_id=rel and sor_year=y and node_type='table'
          and (catalogue_code in ('ELECTRICAL','PLUMBING','RB_WORK','RB_LABOUR') or display_title ilike '%Leakage%PVC%6%') loop
        started:=clock_timestamp();
        page:=public.browse_sor_reviewed_children(y,schedule.node_id,20,0,null,z);
        elapsed:=clock_timestamp()-started;
        if elapsed>=interval '3 seconds' then raise exception 'Schedule browse exceeded timeout: %, %, %, %',y,z,schedule.catalogue_code,elapsed; end if;
        next_page:=public.browse_sor_reviewed_children(y,schedule.node_id,20,20,null,z);
        if exists(select 1 from jsonb_array_elements(page->'entries') a join jsonb_array_elements(next_page->'entries') b
          on coalesce(a->>'node_id',a#>>'{observation,occurrence_id}')=coalesce(b->>'node_id',b#>>'{observation,occurrence_id}')) then
          raise exception 'Overlapping browse pages';
        end if;
        if jsonb_array_length(next_page->'entries')>0 and
          (page->'entries'->-1->>'source_order')::bigint>=(next_page->'entries'->0->>'source_order')::bigint then
          raise exception 'Source order changed across pages';
        end if;
        for entry in select value from jsonb_array_elements(page->'entries') loop
          if entry->>'node_type'='variant' then
            -- Compare the compact DTO with the previous API's exact field set,
            -- including all costing flags, descriptions and reviewed wording.
            select (to_jsonb(o)-array['payload','search_vector','release_id','project_zone']) || jsonb_build_object(
              'features',o.payload->'features','group_label',o.payload#>>'{source_context,variant_group}',
              'has_reviewed_correction',(o.payload#>'{source_context,specification_review}' is not null or o.payload#>'{source_context,unit_resolution}' is not null),
              'variant_label',case when o.payload#>'{source_context,specification_review}' is not null and coalesce(o.payload#>>'{source_context,parent_description}','')='' then o.payload->>'effective_description' else o.variant_label end)
              into expected from public.sor_recipe_observation o
              where o.release_id=rel and o.occurrence_id=entry#>>'{observation,occurrence_id}'
                and (o.project_zone is null or o.project_zone=z);
            if expected is null or entry->'observation'<>expected then raise exception 'Observation contract or zone changed'; end if;
          else
            expected_count:=(expected_nodes#>>array[entry->>'node_id','count'])::bigint;
            expected_order:=(expected_nodes#>>array[entry->>'node_id','order'])::bigint;
            if (entry->>'available_variant_count')::bigint<>expected_count or (entry->>'source_order')::bigint<>expected_order then
              raise exception 'Descendant count/order changed';
            end if;
          end if;
        end loop;
        select v.occurrence_id into anchor from public.sor_reviewed_navigation_variant v
          join public.sor_recipe_observation o using(release_id,occurrence_id)
          where v.release_id=rel and v.sor_year=y and v.parent_node_id=schedule.node_id
            and (o.project_zone is null or o.project_zone=z) order by v.source_order desc limit 1;
        if anchor is not null then
          next_page:=public.browse_sor_reviewed_children(y,schedule.node_id,20,0,anchor,z);
          if not exists(select 1 from jsonb_array_elements(next_page->'entries') e where e#>>'{observation,occurrence_id}'=anchor) then
            raise exception 'Anchored item missing';
          end if;
        end if;
        next_page:=public.browse_sor_reviewed_children(y,schedule.node_id,20,100000,null,z);
        if next_page->'entries'<>'[]'::jsonb or (next_page->>'has_more')::boolean then raise exception 'Empty page changed'; end if;
      end loop;
    end loop;
  end loop;
  -- A nested parent exercises recursive counts below the schedule level.
  for section in select * from public.sor_reviewed_navigation_node
    where release_id=rel and sor_year='2026-27' and catalogue_code='PLUMBING' and node_type='section' limit 3 loop
    page:=public.browse_sor_reviewed_children(section.sor_year,section.node_id,100,0,null,'zone_1');
    for entry in select value from jsonb_array_elements(page->'entries') where value->>'node_type'<>'variant' loop
      select count(*) into expected_count from public.sor_reviewed_navigation_variant v
        join public.sor_recipe_observation o using(release_id,occurrence_id)
        where v.release_id=rel and v.sor_year=section.sor_year and v.catalogue_code=section.catalogue_code
          and v.path @> jsonb_build_array(jsonb_build_object('node_id',entry->>'node_id'))
          and (o.project_zone is null or o.project_zone='zone_1');
      if (entry->>'available_variant_count')::bigint<>expected_count then raise exception 'Nested count changed'; end if;
    end loop;
  end loop;
end $$;
rollback;
