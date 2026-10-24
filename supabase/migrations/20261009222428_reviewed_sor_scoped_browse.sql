-- Walk only the requested parent's hierarchy using indexed parent IDs. Do not
-- expand every variant's JSON path or serialize off-page observation payloads.
-- Keep invoker permissions, zone filtering, source order and anchor paging.
create or replace function public.browse_sor_reviewed_children(p_sor_year text,p_parent_node_id text,p_limit integer,
  p_offset integer,p_anchor_occurrence_id text,p_sor_zone text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rel text; zone text:=public.sor_reviewed_validate_project_zone(p_sor_zone);
  page_size int:=greatest(1,least(coalesce(p_limit,50),100)); page_offset int:=greatest(coalesce(p_offset,0),0); result jsonb;
begin
  select release_id into rel from public.sor_dataset_release where status='active';
  if not exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and sor_year=p_sor_year) then
    raise exception 'The book index for this edition is not published. Try another edition or retry after publication.';
  end if;
  if p_parent_node_id is not null and not exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and sor_year=p_sor_year and node_id=p_parent_node_id) then
    raise exception 'This section does not belong to the active edition. Return to the book index.';
  end if;
  with recursive child_nodes as materialized (
    select n.* from public.sor_reviewed_navigation_node n
    where n.release_id=rel and n.sor_year=p_sor_year
      and (n.parent_node_id=p_parent_node_id or (p_parent_node_id is null and n.parent_node_id is null))
  ), descendants(child_id,node_id) as (
    select node_id,node_id from child_nodes
    union all
    select d.child_id,n.node_id from descendants d join public.sor_reviewed_navigation_node n on n.parent_node_id=d.node_id
      where n.release_id=rel and n.sor_year=p_sor_year
  ), counts as (
    select d.child_id,count(*) as variants,min(v.source_order) as source_order
    from descendants d join public.sor_reviewed_navigation_variant v on v.parent_node_id=d.node_id
    join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and v.sor_year=p_sor_year and o.sor_year=p_sor_year
      and (o.project_zone is null or o.project_zone=zone)
    group by d.child_id
  ), children as (
    select c.source_order,n.node_id as entry_id,false as is_variant,c.variants
    from child_nodes n join counts c on c.child_id=n.node_id
    union all
    select v.source_order,v.occurrence_id,true,null::bigint
    from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and v.sor_year=p_sor_year and v.parent_node_id=p_parent_node_id
      and o.sor_year=p_sor_year and (o.project_zone is null or o.project_zone=zone)
  ), ranked as materialized (
    select *,row_number() over(order by source_order,entry_id)-1 as position from children
  ), paging as (
    select coalesce((select (position/page_size)*page_size from ranked where entry_id=p_anchor_occurrence_id),page_offset)::int as start
  ), selected as materialized (
    select r.* from ranked r,paging where position>=start and position<start+page_size
  ), entries as (
    select s.position,(to_jsonb(n)-'release_id') || jsonb_build_object(
      'available_variant_count',s.variants,'source_order',s.source_order) as entry
    from selected s join child_nodes n on n.node_id=s.entry_id where not s.is_variant
    union all
    select s.position,jsonb_build_object('node_type','variant','source_order',s.source_order,'parent_node_id',p_parent_node_id,
      'observation',jsonb_build_object(
        'occurrence_id',o.occurrence_id,'item_id',o.item_id,'sor_year',o.sor_year,'catalogue_code',o.catalogue_code,
        'table_name',o.table_name,'printed_code',o.printed_code,'serial_number',o.serial_number,'pdf_page',o.pdf_page,
        'description',o.description,'effective_description',o.effective_description,'family_label',o.family_label,
        'rate',o.rate,'unit',o.unit,'basis_quantity',o.basis_quantity,'assessment_status',o.assessment_status,
        'cost_ready',o.cost_ready,'row_role',o.row_role,'features',o.payload->'features',
        'group_label',o.payload#>>'{source_context,variant_group}',
        'has_reviewed_correction',(o.payload#>'{source_context,specification_review}' is not null or o.payload#>'{source_context,unit_resolution}' is not null),
        'variant_label',case when o.payload#>'{source_context,specification_review}' is not null and coalesce(o.payload#>>'{source_context,parent_description}','')='' then o.payload->>'effective_description' else o.variant_label end))
    from selected s join public.sor_recipe_observation o on o.release_id=rel and o.occurrence_id=s.entry_id where s.is_variant
  )
  select jsonb_build_object('release_id',rel,'entries',coalesce((select jsonb_agg(entry order by position) from entries),'[]'),
    'offset',(select start from paging),'total_count',(select count(*) from ranked),
    'has_more',(select start+page_size from paging)<(select count(*) from ranked)) into result;
  return result;
end $$;
