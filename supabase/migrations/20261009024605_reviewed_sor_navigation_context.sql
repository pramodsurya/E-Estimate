-- Keep reviewed wording, matrix columns and full node contracts in browse/search location responses.
create or replace function public.browse_sor_reviewed_children(p_sor_year text,p_parent_node_id text default null,p_limit integer default 50,
  p_offset integer default 0,p_anchor_occurrence_id text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rel text; page_size int:=greatest(1,least(coalesce(p_limit,50),100)); page_offset int:=greatest(coalesce(p_offset,0),0); result jsonb;
begin
  select release_id into rel from public.sor_dataset_release where status='active';
  if not exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and sor_year=p_sor_year) then
    raise exception 'The book index for this edition is not published. Try another edition or retry after publication.';
  end if;
  if p_parent_node_id is not null and not exists(select 1 from public.sor_reviewed_navigation_node where release_id=rel and sor_year=p_sor_year and node_id=p_parent_node_id) then
    raise exception 'This section does not belong to the active edition. Return to the book index.';
  end if;
  with children as (
    select n.source_order,n.node_id as entry_id,to_jsonb(n)-'release_id' as entry
    from public.sor_reviewed_navigation_node n where n.release_id=rel and n.sor_year=p_sor_year and n.parent_node_id is not distinct from p_parent_node_id
    union all
    select v.source_order,v.occurrence_id,jsonb_build_object('node_type','variant','source_order',v.source_order,'parent_node_id',v.parent_node_id,
      'observation',(to_jsonb(o)-array['payload','search_vector','release_id']) || jsonb_build_object(
        'features',o.payload->'features','group_label',o.payload#>>'{source_context,variant_group}',
        'has_reviewed_correction',(o.payload#>'{source_context,specification_review}' is not null or o.payload#>'{source_context,unit_resolution}' is not null),
        'variant_label',case when o.payload#>'{source_context,specification_review}' is not null and coalesce(o.payload#>>'{source_context,parent_description}','')='' then o.effective_description else o.variant_label end))
    from public.sor_reviewed_navigation_variant v join public.sor_recipe_observation o using(release_id,occurrence_id)
    where v.release_id=rel and v.sor_year=p_sor_year and v.parent_node_id=p_parent_node_id
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

create or replace function public.get_sor_reviewed_locations(p_occurrence_ids text[]) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('occurrence_id',v.occurrence_id,'sor_year',v.sor_year,'path',
    (select jsonb_agg(to_jsonb(n)-'release_id' order by p.ordinal)
     from jsonb_array_elements(v.path) with ordinality p(value,ordinal)
     join public.sor_reviewed_navigation_node n on n.release_id=v.release_id and n.node_id=p.value->>'node_id'),
    'parent_node_id',v.parent_node_id,'source_order',v.source_order) order by v.source_order),'[]')
  from public.sor_reviewed_navigation_variant v where v.release_id=(select release_id from public.sor_dataset_release where status='active')
  and v.occurrence_id=any(p_occurrence_ids[1:100]);
$$;

