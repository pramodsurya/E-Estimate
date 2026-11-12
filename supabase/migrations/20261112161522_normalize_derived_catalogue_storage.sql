-- Store the MoRTH recipe once; expose resource arrays through the existing view.
-- Remove the duplicated navigation table; its projection is now an ordinary view.
SET lock_timeout = '5s';
SET statement_timeout = '180s';

CREATE OR REPLACE VIEW public."MORTH_Recipie_Variant_View" AS
 SELECT part,
    heading,
    description,
    (recipe -> 'materials') AS materials,
    (recipe -> 'machinery') AS machinery,
    (recipe -> 'labour') AS labour,
    (coalesce(recipe -> 'percentage_allowances','[]'::jsonb)) AS others,
    unit,
    quantity,
    (recipe -> 'calculation') AS rate_structure,
    code,
    part AS subject,
    chapter,
    section_heading,
    printed_item,
    description_detail,
    project_category,
    recipe ->> 'analysis_variant'::text AS analysis_variant,
    rate_divisor,
    COALESCE(recipe -> 'addon_table'::text, '[]'::jsonb) AS addon_table,
    source_pages,
    source_edition,
    review_flags,
    sor_mapping_status,
    cost_ready,
    COALESCE(recipe -> 'required_project_parameters'::text, '[]'::jsonb) AS required_project_parameters,
    COALESCE(recipe -> 'notes'::text, '[]'::jsonb) AS notes,
    COALESCE(recipe -> 'source_issues'::text, '[]'::jsonb) AS source_issues,
    recipe -> 'ref_to_m'::text AS specification_reference,
    component_links,
    source_context,
    content_hash,
    created_at,
    updated_at
   FROM public.morth;

CREATE OR REPLACE FUNCTION public.individual_cost_source_rows(p_owner text, p_year text)
 RETURNS TABLE(owner text, kind text, source_code text, scope text, line_index integer, row_data jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
 SET jit TO 'off'
AS $function$
 select 'MORTH',s.kind,m.code,'base',(x.n-1)::integer,x.row
 from public.morth m cross join lateral(values('materials',(m.recipe -> 'materials')),('machinery',(m.recipe -> 'machinery')),('labour',(m.recipe -> 'labour')))s(kind,rows)
 cross join lateral jsonb_array_elements(s.rows)with ordinality x(row,n) where p_owner='MORTH'
 union all
 select 'MORTH',coalesce(c.row->>'section',s.kind),m.code,'option:'||(r.row->>'resource_key')||':'||o.key,(c.n-1)::integer,
 c.row||jsonb_build_object('unit',coalesce(c.row->>'unit',r.row->>'unit',''),'resource_key',coalesce(c.row->>'resource_key','morth:option:'||(c.row->>'desc')))
 from public.morth m cross join lateral(values('materials',(m.recipe -> 'materials')),('machinery',(m.recipe -> 'machinery')),('labour',(m.recipe -> 'labour')))s(kind,rows)
 cross join lateral jsonb_array_elements(s.rows)r(row)
 cross join lateral jsonb_each(coalesce(r.row->'costing_options'->'options','{}'))o(key,value)
 cross join lateral jsonb_array_elements(coalesce(o.value->'components','[]'))with ordinality c(row,n)
 where p_owner='MORTH' and o.key<>'source'
 union all
 select 'MORTH',s.kind,m.code,'pricing_addition',(c.n-1)::integer,c.row
 from public.morth m cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(coalesce(m.recipe->'pricing_additions'->s.kind,'[]'))with ordinality c(row,n)
 where p_owner='MORTH'
 union all
 select 'SSR',s.kind,y.recipe_code,'base',(x.n-1)::integer,x.row
 from public."SSR_Year" y cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(public.ssr_resource_line_array(y.rates->s.kind))with ordinality x(row,n)
 where p_owner='SSR' and y.year=p_year
 union all
 select 'SSR',s.kind,y.recipe_code,'addon:'||(a.row->>'id'),(x.n-1)::integer,x.row
 from public."SSR_Year" y cross join lateral jsonb_array_elements(public.ssr_resource_line_array(y.addon_rates))a(row)
 cross join lateral(values('materials'),('machinery'),('labour'))s(kind)
 cross join lateral jsonb_array_elements(public.ssr_resource_line_array(a.row->'rates'->s.kind))with ordinality x(row,n)
 where p_owner='SSR' and y.year=p_year;
$function$
;

ALTER TABLE public.morth
  DROP CONSTRAINT morth_calculation_is_object,
  DROP CONSTRAINT morth_materials_is_array,
  DROP CONSTRAINT morth_machinery_is_array,
  DROP CONSTRAINT morth_labour_is_array,
  DROP CONSTRAINT morth_current_resource_links,
  ADD CONSTRAINT morth_calculation_is_object CHECK (jsonb_typeof(recipe -> 'calculation') = 'object'),
  ADD CONSTRAINT morth_materials_is_array CHECK (jsonb_typeof(recipe -> 'materials') = 'array'),
  ADD CONSTRAINT morth_machinery_is_array CHECK (jsonb_typeof(recipe -> 'machinery') = 'array'),
  ADD CONSTRAINT morth_labour_is_array CHECK (jsonb_typeof(recipe -> 'labour') = 'array'),
  ADD CONSTRAINT morth_current_resource_links CHECK (
    public.sor_resource_links_valid(recipe) AND
    public.sor_resource_links_valid(component_links) AND
    public.sor_resource_links_valid(source_context));

ALTER TABLE public.morth
  DROP COLUMN materials RESTRICT,
  DROP COLUMN machinery RESTRICT,
  DROP COLUMN labour RESTRICT,
  DROP COLUMN calculation RESTRICT,
  DROP COLUMN rate_structure RESTRICT,
  DROP COLUMN others RESTRICT;

CREATE OR REPLACE FUNCTION public.sor_picker_navigation(p_year text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog SET jit = off
SET enable_indexscan = off SET enable_bitmapscan = off
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

DROP TRIGGER sor_picker_navigation_entry_sync ON public.sor_picker_index;
DROP TRIGGER sor_picker_navigation_entry_truncate ON public.sor_picker_index;
DROP FUNCTION public.sor_picker_sync_navigation_entry() RESTRICT;
DROP TABLE public.sor_picker_navigation_entry RESTRICT;
CREATE VIEW public.sor_picker_navigation_entry WITH (security_invoker = true) AS
  SELECT year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code
  FROM public.sor_picker_index;
REVOKE ALL ON public.sor_picker_navigation_entry FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sor_picker_navigation_entry TO anon, authenticated, service_role;

-- Reclaim the physical space occupied by the removed stored JSON columns.
CLUSTER public.morth USING morth_pkey;
ANALYZE public.morth;

-- Retired resolver overload: no application or database function calls it.
DROP FUNCTION public.sor_resolve_recipe_revision_v1(text,text) RESTRICT;

REFRESH MATERIALIZED VIEW public.individual_cost_morth_registry;
REFRESH MATERIALIZED VIEW public.individual_cost_morth_usages;
REFRESH MATERIALIZED VIEW public.morth_picker_index;
