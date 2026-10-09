-- Matrix header_rows contain column headings, not book section headings.
-- Use the documented Civil/Plumbing heading-path format only in those schedules.
create or replace function public.rebuild_sor_reviewed_navigation(p_release_id text) returns bigint
language plpgsql set search_path='' as $$
declare result bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('reviewed_sor_navigation:'||p_release_id,0));
  delete from public.sor_reviewed_navigation_variant where release_id=p_release_id;
  delete from public.sor_reviewed_navigation_node where release_id=p_release_id;
  insert into public.sor_reviewed_navigation_variant
  with raw as (
    select o.*,o.payload->'source_context' as ctx,
      coalesce(nullif(o.payload#>>'{source_context,section_scope}',''),nullif(o.payload#>>'{source_context,section_name}',''),case when o.catalogue_code in('CIVIL','PLUMBING') then o.payload#>>'{source_context,header_rows,0,0}' end,'') as heading,
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
        'evidence',jsonb_build_object('field',case when nullif(ctx->>'section_scope','') is not null then 'section_scope' when nullif(ctx->>'section_name','') is not null then 'section_name' else 'header_rows' end,'pdf_page',pdf_page))) else '[]'::jsonb end ||
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

