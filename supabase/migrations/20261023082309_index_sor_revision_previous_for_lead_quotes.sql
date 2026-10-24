-- Match the exact predecessor expression used by sor_resolve_recipe_revision.
-- Quotes otherwise repeatedly scan all permanent definitions, which can exceed
-- the public role's statement timeout while loading the Lead tariff chart.
-- No pricing functions, source rows, grants or RLS policies are changed.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
create index if not exists sor_recipe_revision_previous_lookup
  on public."SOR_Recipie" using gin (public.sor_revision_previous(recipe_revision));
analyze public."SOR_Recipie";
