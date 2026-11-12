-- Preserve invoker access checks when the MoRTH projection is replaced.
ALTER VIEW public."MORTH_Recipie_Variant_View" SET (security_invoker = true);

-- Read the existing narrow covering index instead of scanning the wide browse heap.
CREATE OR REPLACE FUNCTION public.sor_picker_navigation(p_year text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog SET jit = off
SET enable_seqscan = off SET enable_bitmapscan = off SET enable_hashagg = off
AS $fn$
  SELECT jsonb_build_object('year', p_year, 'paths', coalesce(jsonb_agg(to_jsonb(paths)), '[]'::jsonb))
  FROM (
    SELECT part_no::text part, heading, section, subsection, count(*)::integer count,
      min(pdf_page) page, min(recipe_code) first_code
    FROM public.sor_picker_index WHERE year = p_year
    GROUP BY part_no, heading, section, subsection
    ORDER BY min(pdf_page) NULLS LAST, min(recipe_code)
  ) paths
$fn$;
