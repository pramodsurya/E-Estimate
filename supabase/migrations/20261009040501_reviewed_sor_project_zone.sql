-- Zones are project context, not selectable specification variants.
-- Keep legacy RPC signatures; zone-aware overloads require every argument,
-- so PostgREST can resolve old and new clients without default ambiguity.
alter table public.sor_recipe_observation add column project_zone text generated always as (
  case when payload#>>'{features,specifications,zone}' is null then null
    when payload#>>'{features,specifications,zone}' in('1','2','3') then 'zone_' || (payload#>>'{features,specifications,zone}')
    else 'unresolved' end
) stored;
create index sor_reviewed_project_zone on public.sor_recipe_observation(release_id,sor_year,project_zone);

create function public.sor_reviewed_validate_project_zone(p_zone text) returns text
language plpgsql immutable security invoker set search_path='' as $$
begin
  if p_zone is null or p_zone not in('zone_1','zone_2','zone_3') then raise exception 'A valid project SOR zone is required'; end if;
  return p_zone;
end $$;

create function public.list_sor_reviewed_catalogues(p_sor_year text,p_sor_zone text)
returns table(catalogue_code text,table_name text,published_variants bigint,cost_ready_variants bigint)
language sql stable security invoker set search_path='' as $$
  select o.catalogue_code,min(o.table_name),count(*),count(*) filter(where o.cost_ready)
  from public.sor_recipe_observation o
  where o.release_id=(select release_id from public.sor_dataset_release where status='active')
    and o.sor_year=p_sor_year and o.row_role='priced_item' and o.assessment_status not in('deleted','not_applicable')
    and (o.project_zone is null or o.project_zone=public.sor_reviewed_validate_project_zone(p_sor_zone))
  group by o.catalogue_code order by min(o.pdf_page),o.catalogue_code;
$$;

create function public.search_sor_reviewed_items(p_sor_year text,p_query text,p_catalogue_code text,
  p_serial_number text,p_limit integer,p_offset integer,p_sor_zone text)
returns table(occurrence_id text,item_id text,sor_year text,catalogue_code text,table_name text,printed_code text,serial_number text,pdf_page integer,
  description text,effective_description text,family_label text,variant_label text,rate numeric,unit text,basis_quantity numeric,
  assessment_status text,cost_ready boolean,has_reviewed_correction boolean,group_label text,features jsonb)
language sql stable security invoker set search_path='' as $$
  select o.occurrence_id,o.item_id,o.sor_year,o.catalogue_code,o.table_name,o.printed_code,o.serial_number,o.pdf_page,
    o.description,o.effective_description,o.family_label,
    case when o.payload#>'{source_context,specification_review}' is not null and coalesce(o.payload#>>'{source_context,parent_description}','')='' then o.effective_description else o.variant_label end,
    o.rate,o.unit,o.basis_quantity,o.assessment_status,o.cost_ready,
    (o.payload#>'{source_context,specification_review}' is not null or o.payload#>'{source_context,unit_resolution}' is not null),
    o.payload#>>'{source_context,variant_group}',o.payload->'features'
  from public.sor_recipe_observation o join public.sor_reviewed_navigation_variant v using(release_id,occurrence_id)
  where o.release_id=(select release_id from public.sor_dataset_release where status='active') and o.sor_year=p_sor_year
    and (o.project_zone is null or o.project_zone=public.sor_reviewed_validate_project_zone(p_sor_zone))
    and (p_catalogue_code is null or o.catalogue_code=p_catalogue_code)
    and (p_serial_number is null or o.serial_number=p_serial_number)
    and (coalesce(trim(p_query),'')='' or v.search_vector @@ websearch_to_tsquery('simple'::regconfig,p_query) or o.printed_code ilike '%'||p_query||'%')
  order by v.source_order,o.occurrence_id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
$$;

create function public.browse_sor_reviewed_children(p_sor_year text,p_parent_node_id text,p_limit integer,
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
    select v.*,o.payload,o.assessment_status,o.cost_ready,o.project_zone,
      to_jsonb(o)-array['payload','search_vector','release_id','project_zone'] as observation
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
      'observation',v.observation || jsonb_build_object('features',v.payload->'features','group_label',v.payload#>>'{source_context,variant_group}',
        'has_reviewed_correction',(v.payload#>'{source_context,specification_review}' is not null or v.payload#>'{source_context,unit_resolution}' is not null),
        'variant_label',case when v.payload#>'{source_context,specification_review}' is not null and coalesce(v.payload#>>'{source_context,parent_description}','')='' then v.payload->>'effective_description' else v.observation->>'variant_label' end))
    from eligible v where v.parent_node_id=p_parent_node_id
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

-- Resolve the stable Recipe, changing its zone counterpart only through an exact
-- retained row key within one annual table. Never use a serial as a global identity.
create function public.get_sor_reviewed_project_observation(p_item_id text,p_sor_year text,p_sor_zone text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare rel text; zone text:=public.sor_reviewed_validate_project_zone(p_sor_zone);
  original public.sor_recipe_observation; partner_id text; candidates bigint; result jsonb;
begin
  select release_id into rel from public.sor_dataset_release where status='active';
  select o.* into original from public.sor_recipe_observation o where o.release_id=rel and o.item_id=p_item_id
    order by (o.sor_year=p_sor_year) desc,o.sor_year desc limit 1;
  if not found then return null; end if;
  partner_id:=original.item_id;
  if original.project_zone is not null and original.project_zone<>zone then
    if nullif(original.payload#>>'{source_reference,row_key}','') is null then return null; end if;
    select count(*),min(o.item_id) into candidates,partner_id from public.sor_recipe_observation o
      where o.release_id=rel and o.sor_year=original.sor_year and o.catalogue_code=original.catalogue_code and o.project_zone=zone
      and o.row_role='priced_item' and o.assessment_status not in('deleted','not_applicable')
      and o.unit=original.unit and o.basis_quantity=original.basis_quantity
      and o.payload#>>'{source_reference,row_key}'=original.payload#>>'{source_reference,row_key}';
    if candidates<>1 then return null; end if;
  end if;
  select count(*),jsonb_agg((to_jsonb(o)-array['payload','search_vector','release_id','project_zone']) || jsonb_build_object(
    'features',o.payload->'features','group_label',o.payload#>>'{source_context,variant_group}')) into candidates,result
    from public.sor_recipe_observation o where o.release_id=rel and o.item_id=partner_id and o.sor_year=p_sor_year
    and o.row_role='priced_item' and o.assessment_status not in('deleted','not_applicable') and (o.project_zone is null or o.project_zone=zone);
  if candidates<>1 then return null; end if;
  return result->0;
end $$;
grant execute on function public.list_sor_reviewed_catalogues(text,text),public.search_sor_reviewed_items(text,text,text,text,integer,integer,text),
  public.browse_sor_reviewed_children(text,text,integer,integer,text,text),public.get_sor_reviewed_project_observation(text,text,text) to anon,authenticated;
