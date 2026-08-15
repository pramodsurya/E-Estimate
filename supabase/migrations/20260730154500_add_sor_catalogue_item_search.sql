create or replace function public.search_sor_catalogue_items(
  p_sor_year text,
  p_query text,
  p_limit integer default 40
)
returns table(
  item_code text,
  item_name text,
  unit text,
  dimensions jsonb,
  rate numeric,
  rate_text text,
  effective_from date,
  source text,
  source_page integer,
  source_context jsonb,
  catalogue_code text,
  catalogue_name text,
  part text,
  section text
)
language sql
stable
set search_path = public
as $function$
  with search_input as (
    select
      trim(coalesce(p_query, '')) as phrase,
      plainto_tsquery('simple', trim(coalesce(p_query, ''))) as terms,
      greatest(1, least(coalesce(p_limit, 40), 80)) as row_limit
  ),
  candidates as (
    select
      item.item_code,
      item.name as item_name,
      item.unit,
      item.dimensions,
      rate.rate,
      rate.rate_text,
      rate.effective_from,
      rate.source,
      rate.source_page,
      item.source_context ||
      case
        when pipe.pipe_lead_item_code is null then '{}'::jsonb
        else jsonb_build_object(
          'pipe_lead',
          jsonb_build_object(
            'auto_apply', true,
            'pipe_lead_item_code', pipe.pipe_lead_item_code,
            'pipe_lead_catalogue_code', pipe.pipe_lead_catalogue_code,
            'pipe_class_group', pipe.pipe_class_group,
            'diameter_mm', pipe.diameter_mm,
            'distance_input_required', true,
            'distance_unit', 'km',
            'quote_rpc', 'get_pipe_lead_quote_for_material',
            'handling_included', pipe.handling_included
          )
        )
      end as source_context,
      catalogue.catalogue_code,
      catalogue.name as catalogue_name,
      catalogue.part,
      catalogue.section,
      item.sort_order,
      input.phrase,
      input.row_limit,
      concat_ws(
        ' ',
        item.name,
        catalogue.name,
        catalogue.part,
        catalogue.section,
        item.source_context->>'title',
        item.dimensions::text
      ) as search_document,
      input.terms
    from public.sor_catalogue_item as item
    join public.sor_catalogue_rate as rate
      on rate.item_code = item.item_code
    join public.sor_catalogue as catalogue
      on catalogue.catalogue_code = item.catalogue_code
    left join public.pipe_lead_item as pipe
      on pipe.pipe_lead_item_code = item.pipe_lead_item_code
    cross join search_input as input
    where rate.sor_year = p_sor_year
      and length(input.phrase) >= 2
      and coalesce(item.source_context->>'extraction_status', '')
          <> 'excluded_non_price_artifact'
  )
  select
    candidate.item_code,
    candidate.item_name,
    candidate.unit,
    candidate.dimensions,
    candidate.rate,
    candidate.rate_text,
    candidate.effective_from,
    candidate.source,
    candidate.source_page,
    candidate.source_context,
    candidate.catalogue_code,
    candidate.catalogue_name,
    candidate.part,
    candidate.section
  from candidates as candidate
  where to_tsvector('simple', candidate.search_document) @@ candidate.terms
     or candidate.search_document ilike '%' || candidate.phrase || '%'
  order by
    case
      when candidate.item_name ilike candidate.phrase || '%' then 0
      when candidate.catalogue_name ilike candidate.phrase || '%' then 1
      when candidate.item_name ilike '%' || candidate.phrase || '%' then 2
      else 3
    end,
    ts_rank_cd(
      to_tsvector('simple', candidate.search_document),
      candidate.terms
    ) desc,
    candidate.catalogue_name,
    candidate.sort_order,
    candidate.item_code
  limit (select row_limit from search_input);
$function$;

grant execute on function public.search_sor_catalogue_items(text, text, integer)
  to anon, authenticated;
