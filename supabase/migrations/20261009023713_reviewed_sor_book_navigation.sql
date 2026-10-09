-- Edition-specific navigation, derived only from retained source evidence.
-- Pricing, reviewed observations, recipe identities and saved snapshots are untouched.
create table public.sor_reviewed_navigation_node (
  release_id text not null references public.sor_dataset_release(release_id),
  node_id text not null, parent_node_id text, sor_year text not null,
  catalogue_code text not null, table_name text not null, node_type text not null,
  printed_reference text not null, display_title text not null,
  source_order bigint not null, available_variant_count bigint not null,
  has_children boolean not null, source_evidence jsonb not null,
  primary key(release_id,node_id)
);
create table public.sor_reviewed_navigation_variant (
  release_id text not null, occurrence_id text not null, sor_year text not null,
  catalogue_code text not null, parent_node_id text not null,
  source_order bigint not null, path jsonb not null, search_vector tsvector not null,
  primary key(release_id,occurrence_id),
  foreign key(release_id,occurrence_id) references public.sor_recipe_observation(release_id,occurrence_id)
);
create index sor_reviewed_node_children on public.sor_reviewed_navigation_node(release_id,sor_year,parent_node_id,source_order);
create index sor_reviewed_variant_children on public.sor_reviewed_navigation_variant(release_id,sor_year,parent_node_id,source_order);
create index sor_reviewed_variant_search on public.sor_reviewed_navigation_variant using gin(search_vector);
alter table public.sor_reviewed_navigation_node enable row level security;
alter table public.sor_reviewed_navigation_variant enable row level security;
create policy reviewed_node_read on public.sor_reviewed_navigation_node for select to anon,authenticated
  using(release_id=(select release_id from public.sor_dataset_release where status='active'));
create policy reviewed_variant_read on public.sor_reviewed_navigation_variant for select to anon,authenticated
  using(release_id=(select release_id from public.sor_dataset_release where status='active'));
grant select on public.sor_reviewed_navigation_node,public.sor_reviewed_navigation_variant to anon,authenticated;

-- Numeric tokens sort naturally (6.2 before 6.10); physical location takes precedence.
create function public.sor_reviewed_natural_key(p_text text) returns text
language sql immutable strict set search_path='' as $$
  select string_agg(case when token[1] ~ '^[0-9]+$' then lpad(token[1],20,'0') else lower(token[1]) end,'' order by ordinal)
  from regexp_matches(p_text,'([0-9]+|[^0-9]+)','g') with ordinality as t(token,ordinal);
$$;

create function public.sor_reviewed_source_path(p_release text,p_year text,p_catalogue text,p_table text,p_levels jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb := '[]'; parent text := null; node text; level jsonb;
begin
  for level in select value from jsonb_array_elements(p_levels) loop
    if coalesce(trim(level->>'title'),'')='' then continue; end if;
    node := md5(jsonb_build_array(p_release,p_year,p_catalogue,parent,level->>'type',coalesce(level->>'identity',level->>'title'))::text);
    result := result || jsonb_build_array(jsonb_build_object('node_id',node,'parent_node_id',parent,
      'sor_year',p_year,'catalogue_code',p_catalogue,'table_name',p_table,'node_type',level->>'type',
      'display_title',level->>'title','printed_reference',coalesce(level->>'reference',''),
      'source_evidence',coalesce(level->'evidence','{}')));
    parent := node;
  end loop;
  return result;
end $$;
revoke all on function public.sor_reviewed_source_path(text,text,text,text,jsonb) from public,anon,authenticated;

-- Run in the reviewed-release publishing transaction before making the release active.
-- Legacy section metadata is used ONLY where it exactly matches this edition's
-- retained heading. No historical subsection is inferred from a code prefix.
create function public.rebuild_sor_reviewed_navigation(p_release_id text) returns bigint
language plpgsql set search_path='' as $$
declare result bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('reviewed_sor_navigation:'||p_release_id,0));
  delete from public.sor_reviewed_navigation_variant where release_id=p_release_id;
  delete from public.sor_reviewed_navigation_node where release_id=p_release_id;
  insert into public.sor_reviewed_navigation_variant
  with raw as (
    select o.*,o.payload->'source_context' as ctx,
      coalesce(o.payload#>>'{source_context,section_scope}',o.payload#>>'{source_context,section_name}',o.payload#>>'{source_context,header_rows,0,0}','') as heading,
      coalesce(c.section_name,p.section_name) as legacy_section,
      coalesce(c.subsection_name,p.subsection_name) as legacy_subsection,
      coalesce(c.section,p.section,'') as section_ref,coalesce(c.subsection,p.subsection,'') as subsection_ref,
      coalesce((o.payload#>>'{source_context,source_location,table_index}')::int,(o.payload#>>'{source_context,cell_sources,0,table_index}')::int,0) as table_position,
      coalesce((o.payload#>>'{source_context,source_location,row_index}')::int,(o.payload#>>'{source_context,cell_sources,0,owner_row}')::int) as row_position,
      coalesce((select min((cell->>'column')::int) from jsonb_array_elements(coalesce(o.payload#>'{source_context,cell_sources}','[]')) cell where cell->>'text'=coalesce(o.payload#>>'{assessment,rate_text}',o.rate::text)),0) as column_position
    from public.sor_recipe_observation o
    left join public.civil c on o.catalogue_code='CIVIL' and c.civil_code=o.payload#>>'{source_reference,imported_code}'
    left join public.plumbing p on o.catalogue_code='PLUMBING' and p.plumbing_code=o.payload#>>'{source_reference,imported_code}'
    where o.release_id=p_release_id and o.row_role='priced_item' and o.assessment_status not in('deleted','not_applicable')
  ), located as (
    select raw.*,row_number() over(partition by release_id,sor_year order by pdf_page nulls last,table_position,
      row_position nulls last,public.sor_reviewed_natural_key(coalesce(nullif(serial_number,''),nullif(ctx#>>'{original_row,0}',''),printed_code,'')),
      column_position,public.sor_reviewed_natural_key(coalesce(payload#>>'{source_reference,column_key}','')),occurrence_id) as book_order,
      case when heading=trim(concat_ws(' / ',legacy_section,nullif(legacy_subsection,''))) then legacy_section
        when heading=legacy_section then legacy_section else heading end as section_title,
      case when heading=trim(concat_ws(' / ',legacy_section,nullif(legacy_subsection,''))) then legacy_subsection
        else nullif(ctx->>'subsection_name','') end as subsection_title
    from raw
  ), paths as (
    select located.*,public.sor_reviewed_source_path(release_id,sor_year,catalogue_code,table_name,
      jsonb_build_array(jsonb_build_object('type','table','title',table_name)) ||
      case when coalesce(section_title,'')<>'' then jsonb_build_array(jsonb_build_object('type','section','title',section_title,
        'reference',case when section_title=legacy_section then section_ref else '' end,
        'evidence',jsonb_build_object('field',case when ctx ? 'section_scope' then 'section_scope' else 'header_rows' end,'pdf_page',pdf_page))) else '[]'::jsonb end ||
      case when coalesce(subsection_title,'')<>'' then jsonb_build_array(jsonb_build_object('type','subsection','title',subsection_title,
        'reference',subsection_ref,'evidence',jsonb_build_object('field','verified heading path','pdf_page',pdf_page))) else '[]'::jsonb end ||
      case when coalesce(ctx->>'parent_description','')<>'' then jsonb_build_array(jsonb_build_object('type','family','title',ctx->>'parent_description',
        'identity',jsonb_build_array(ctx->>'parent_page',ctx->'parent_raw_row'->>0,ctx->'parent_raw_row'->>1,ctx->>'parent_description')::text,
        'reference',coalesce(ctx->'parent_raw_row'->>1,''),'evidence',jsonb_build_object('field','parent_description','pdf_page',ctx->'parent_page'))) else '[]'::jsonb end ||
      case when coalesce(ctx->>'variant_group','')<>'' then jsonb_build_array(jsonb_build_object('type','specification_group','title',ctx->>'variant_group',
        'evidence',jsonb_build_object('field','variant_group','pdf_page',pdf_page))) else '[]'::jsonb end
    ) as node_path from located
  )
  select release_id,occurrence_id,sor_year,catalogue_code,node_path->-1->>'node_id',book_order,node_path,
    to_tsvector('simple'::regconfig,concat_ws(' ',description,effective_description,printed_code,serial_number,table_name,
      (select string_agg(n->>'display_title',' ') from jsonb_array_elements(node_path) n)))
  from paths;
  get diagnostics result=row_count;
  insert into public.sor_reviewed_navigation_node
  select v.release_id,n->>'node_id',min(n->>'parent_node_id'),min(v.sor_year),min(v.catalogue_code),min(n->>'table_name'),min(n->>'node_type'),
    max(n->>'printed_reference'),min(n->>'display_title'),min(v.source_order),count(*),true,
    (array_agg(n->'source_evidence' order by v.source_order))[1]
  from public.sor_reviewed_navigation_variant v cross join lateral jsonb_array_elements(v.path) n
  where v.release_id=p_release_id
  group by v.release_id,n->>'node_id';
  return result;
end $$;
revoke all on function public.rebuild_sor_reviewed_navigation(text) from public,anon,authenticated;
select public.rebuild_sor_reviewed_navigation(release_id) from public.sor_dataset_release where status='active';

create function public.browse_sor_reviewed_children(p_sor_year text,p_parent_node_id text default null,p_limit integer default 50,
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
      'observation',to_jsonb(o)-array['payload','search_vector','release_id'])
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

create function public.get_sor_reviewed_locations(p_occurrence_ids text[]) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('occurrence_id',v.occurrence_id,'sor_year',v.sor_year,'path',v.path,
    'parent_node_id',v.parent_node_id,'source_order',v.source_order) order by v.source_order),'[]')
  from public.sor_reviewed_navigation_variant v where v.release_id=(select release_id from public.sor_dataset_release where status='active')
  and v.occurrence_id=any(p_occurrence_ids[1:100]);
$$;

-- Preserve the existing RPC signature and result columns for existing consumers.
create or replace function public.search_sor_reviewed_items(p_sor_year text,p_query text default '',p_catalogue_code text default null,
  p_serial_number text default null,p_limit integer default 50,p_offset integer default 0)
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
    and (p_catalogue_code is null or o.catalogue_code=p_catalogue_code)
    and (p_serial_number is null or o.serial_number=p_serial_number)
    and (coalesce(trim(p_query),'')='' or v.search_vector @@ websearch_to_tsquery('simple'::regconfig,p_query) or o.printed_code ilike '%'||p_query||'%')
  order by v.source_order,o.occurrence_id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0);
$$;
grant execute on function public.browse_sor_reviewed_children(text,text,integer,integer,text),public.get_sor_reviewed_locations(text[]) to anon,authenticated;
