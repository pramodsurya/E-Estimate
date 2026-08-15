drop index if exists public.sor_catalogue_item_search_vector_idx;

alter table public.sor_catalogue_item
  drop column if exists search_vector;

alter table public.sor_catalogue_item
  add column search_vector tsvector
  generated always as (
    to_tsvector(
      'simple',
      coalesce(name, '') || ' ' ||
      replace(coalesce(source_context->>'title', ''), '.', '') || ' ' ||
      dimensions::text
    )
  ) stored;

create index sor_catalogue_item_search_vector_idx
  on public.sor_catalogue_item using gin (search_vector);
