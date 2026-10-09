-- Read-only live regression checks. Run against the published reviewed release.
begin;
set local role anon;
do $$
declare rel text; expected bigint; actual bigint; node text; family text; page jsonb; next_page jsonb; labels text[];
  priced text; ladder text; rule text; calculation jsonb; invalid_rejected boolean := false;
begin
  select release_id into rel from public.sor_dataset_release where status='active';
  select count(*) into expected from public.sor_recipe_observation where release_id=rel and row_role='priced_item' and assessment_status not in('deleted','not_applicable');
  select count(*) into actual from public.sor_reviewed_navigation_variant where release_id=rel;
  if expected<>actual then raise exception 'Index coverage mismatch: % vs %',expected,actual; end if;
  if exists(select 1 from public.sor_recipe_observation o left join public.sor_reviewed_navigation_variant v using(release_id,occurrence_id)
    where o.release_id=rel and o.row_role='priced_item' and o.assessment_status not in('deleted','not_applicable') and v.occurrence_id is null) then
    raise exception 'Published observation missing from index'; end if;
  if exists(select 1 from public.sor_recipe_observation o join public.sor_reviewed_navigation_variant v using(release_id,occurrence_id)
    where o.release_id=rel and o.assessment_status in('deleted','not_applicable')) then raise exception 'Hidden observation indexed'; end if;
  if exists(with counts as (
    select p.value->>'node_id' as id,count(*) as variants from public.sor_reviewed_navigation_variant v
    cross join lateral jsonb_array_elements(v.path) p(value) where release_id=rel group by p.value->>'node_id'
  ) select 1 from counts c join public.sor_reviewed_navigation_node n on n.release_id=rel and n.node_id=c.id
    where n.available_variant_count<>c.variants) then raise exception 'Incorrect descendant variant count'; end if;
  if public.sor_reviewed_natural_key('6.2.a')>=public.sor_reviewed_natural_key('6.10.a') or
    public.sor_reviewed_natural_key('6.2.a')>=public.sor_reviewed_natural_key('6.2.b') then raise exception 'Incorrect natural reference order'; end if;
  select node_id into node from public.sor_reviewed_navigation_node where release_id=rel and sor_year='2026-27' and catalogue_code='ELECTRICAL' and node_type='table';
  page:=public.browse_sor_reviewed_children('2026-27',node,50,0,null);
  next_page:=public.browse_sor_reviewed_children('2026-27',node,50,50,null);
  if jsonb_array_length(page->'entries')<>50 or not (page->>'has_more')::boolean then raise exception 'Electrical pagination missing'; end if;
  if exists(select 1 from jsonb_array_elements(page->'entries') a join jsonb_array_elements(next_page->'entries') b on a->>'node_id'=b->>'node_id') then raise exception 'Overlapping browse pages'; end if;
  if (page->'entries'->-1->>'source_order')::bigint >= (next_page->'entries'->0->>'source_order')::bigint then raise exception 'Unstable book order across pages'; end if;
  begin perform public.browse_sor_reviewed_children('2025-26',node,50,0,null); exception when others then invalid_rejected:=true; end;
  if not invalid_rejected then raise exception 'Edition-specific node accepted in another year'; end if;
  select v.parent_node_id into family from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and o.sor_year='2026-27' and o.printed_code='ELEC-6.9.1.a';
  page:=public.browse_sor_reviewed_children('2026-27',family,50,0,null);
  select array_agg(e.value#>>'{observation,variant_label}' order by e.ordinal) into labels from jsonb_array_elements(page->'entries') with ordinality e(value,ordinal);
  if labels[1:3]<>array['6 HP','8 HP','10 HP'] then raise exception 'VRF capacity order/context lost: %',labels; end if;
  if (select count(*) from public.sor_reviewed_navigation_node where release_id=rel and sor_year='2026-27' and catalogue_code='ELECTRICAL' and node_type='specification_group' and display_title ilike '%Static ductable%')<>3 then
    raise exception 'Low/mid/high static-pressure groups lost'; end if;
  if exists(select 1 from public.sor_recipe_observation o left join public.sor_reviewed_navigation_variant v using(release_id,occurrence_id)
    where o.release_id=rel and o.assessment_status='conflicting_source_rates' and (o.cost_ready or v.occurrence_id is null)) then
    raise exception 'Conflict observation missing or costing-ready'; end if;
  if (select count(distinct v.parent_node_id) from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and o.sor_year='2026-27' and o.catalogue_code='ELECTRICAL' and o.variant_label='1.5 Sqmm')<2 then raise exception 'Repeated cable size families merged'; end if;
  if not exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and sor_year='2026-27' and catalogue_code='PLUMBING' and node_type='subsection') then raise exception 'Verified Plumbing subsections omitted'; end if;
  if exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and catalogue_code not in('CIVIL','PLUMBING') and source_evidence->>'field'='header_rows') then
    raise exception 'Matrix column header mistaken for a section'; end if;
  select node_id into node from public.sor_reviewed_navigation_node where release_id=rel and sor_year='2026-27' and catalogue_code='RB_WORK' and node_type='table';
  select occurrence_id into priced from public.sor_reviewed_navigation_variant where release_id=rel and parent_node_id=node order by source_order desc limit 1;
  page:=public.browse_sor_reviewed_children('2026-27',node,50,0,priced);
  if not exists(select 1 from jsonb_array_elements(page->'entries') e where e#>>'{observation,occurrence_id}'=priced) or (page->>'offset')::int=0 then
    raise exception 'Search anchor did not open the matching page'; end if;

  if has_table_privilege('anon','public.sor_reviewed_navigation_node','INSERT') or has_function_privilege('anon','public.rebuild_sor_reviewed_navigation(text)','EXECUTE') then raise exception 'Public index write access'; end if;
  select occurrence_id into priced from public.sor_recipe_observation where release_id=rel and sor_year='2026-27' and printed_code='ELEC-4.10.1.a';
  select rule_id into rule from public.sor_adjustment_rule where release_id=rel and sor_year='2026-27' and calculation_ready and payload->'applies_to_occurrences' ? priced;
  calculation:=public.calculate_sor_reviewed_selection(priced,1,array[rule]);
  if (calculation->>'published_rate')::numeric<>2058 or (calculation->>'adjusted_rate_per_basis')::numeric<>2675.4 then raise exception 'Reviewed tray calculation changed'; end if;
  select occurrence_id into ladder from public.sor_recipe_observation where release_id=rel and sor_year='2026-27' and printed_code='ELEC-4.10.2.a';
  invalid_rejected:=false;
  begin perform public.calculate_sor_reviewed_selection(ladder,1,array[rule]); exception when others then invalid_rejected:=true; end;
  if not invalid_rejected then raise exception 'Cover accepted on ladder tray'; end if;
end $$;
rollback;
