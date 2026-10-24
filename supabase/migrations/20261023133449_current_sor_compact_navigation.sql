create or replace function public.sor_picker_navigation(p_year text)
returns jsonb language sql stable security invoker set search_path=pg_catalog set jit=off as $fn$
 select jsonb_build_object('year',p_year,'paths',coalesce(jsonb_agg(to_jsonb(paths)),'[]'::jsonb))
 from (
  select part_no::text part,heading,section,subsection,count(*)::integer count,
   min(pdf_page) page,min(recipe_code) first_code
  from public.sor_picker_index where year=p_year
  group by part_no,heading,section,subsection
  order by min(pdf_page) nulls last,min(recipe_code)
 ) paths
$fn$;
revoke all on function public.sor_picker_navigation(text) from public;
grant execute on function public.sor_picker_navigation(text) to anon,authenticated;
