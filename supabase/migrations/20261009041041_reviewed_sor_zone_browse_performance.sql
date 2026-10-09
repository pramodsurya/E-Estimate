-- Build observation DTOs only for the requested section, not every item in the edition.
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
  with eligible as materialized (
    select v.*
    from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and v.sor_year=p_sor_year and (o.project_zone is null or o.project_zone=zone)
  ), counts as (
    select p.value->>'node_id' as node_id,count(*) as variants,min(v.source_order) as source_order
    from eligible v cross join lateral jsonb_array_elements(v.path) p(value) group by p.value->>'node_id'
  ), children as (
    select c.source_order,n.node_id as entry_id,
      (to_jsonb(n)-'release_id') || jsonb_build_object('available_variant_count',c.variants,'source_order',c.source_order) as entry
    from public.sor_reviewed_navigation_node n join counts c using(node_id)
    where n.release_id=rel and n.sor_year=p_sor_year and n.parent_node_id is not distinct from p_parent_node_id
    union all
    select v.source_order,v.occurrence_id,jsonb_build_object('node_type','variant','source_order',v.source_order,'parent_node_id',v.parent_node_id,
      'observation',(to_jsonb(o)-array['payload','search_vector','release_id','project_zone']) || jsonb_build_object('features',o.payload->'features','group_label',o.payload#>>'{source_context,variant_group}',
        'has_reviewed_correction',(o.payload#>'{source_context,specification_review}' is not null or o.payload#>'{source_context,unit_resolution}' is not null),
        'variant_label',case when o.payload#>'{source_context,specification_review}' is not null and coalesce(o.payload#>>'{source_context,parent_description}','')='' then o.payload->>'effective_description' else o.variant_label end))
    from eligible v join public.sor_recipe_observation o using(release_id,occurrence_id) where v.parent_node_id=p_parent_node_id
  ), ranked as (
    select *,row_number() over(order by source_order,entry_id)-1 as position from children
  ), paging as (
    select coalesce((select (position/page_size)*page_size from ranked where entry_id=p_anchor_occurrence_id),page_offset)::int as start
  )
  select jsonb_build_object('release_id',rel,'entries',coalesce((select jsonb_agg(entry order by position) from ranked,paging where position>=start and position<start+page_size),'[]'),
    'offset',(select start from paging),'total_count',(select count(*) from ranked),
    'has_more',(select start+page_size from paging)<(select count(*) from ranked)) into result;
  return result;
end $$;
