-- Build material-wise seigniorage applicability inside ssr_item.seigniorage_applicability.
--
-- This intentionally stores the reviewed policy in ssr_item JSONB, not in a
-- separate table. The frontend expands the materials array into the
-- Seigniorage dashboard.
--
-- Calculation contract:
--   seigniorage_material_qty = DATA quantity * quantity_ratio * conversion_factor
--   seigniorage_charge       = seigniorage_material_qty * selected seigniorage rate
--
-- Run after SSR recipe import or when material mapping rules are revised.

ALTER TABLE public.ssr_item
  ADD COLUMN IF NOT EXISTS seigniorage_applicability jsonb;

COMMENT ON COLUMN public.ssr_item.seigniorage_applicability IS
  'Reviewed material-wise seigniorage policy JSON. Each materials[] row links an SSR recipe material to seigniorage_charge.';

WITH source_materials AS (
  SELECT
    s.code AS ssr_code,
    s.unit AS item_output_unit,
    s.quantity::numeric AS item_output_qty,
    m.ordinality::integer AS material_index,
    trim(COALESCE(m.value->>'desc', m.value->>'description', '')) AS recipe_material_desc,
    trim(COALESCE(m.value->>'unit', '')) AS recipe_material_unit,
    CASE
      WHEN regexp_replace(COALESCE(m.value->>'quantity', ''), '[^0-9.\-]', '', 'g') ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN regexp_replace(COALESCE(m.value->>'quantity', ''), '[^0-9.\-]', '', 'g')::numeric
      ELSE NULL
    END AS recipe_material_qty
  FROM public.ssr_item s
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.materials, '[]'::jsonb))
    WITH ORDINALITY AS m(value, ordinality)
),
classified AS (
  SELECT
    sm.*,
    lower(regexp_replace(sm.recipe_material_desc, '\s+', ' ', 'g')) AS material_desc_norm,
    CASE
      WHEN lower(sm.recipe_material_desc) ~ 'sand\s+bag' THEN NULL
      WHEN lower(sm.recipe_material_desc) ~ '(fine aggregate|sand\s*\((un-)?screened|sand for filling|(^|[^a-z])sand($|[^a-z]))'
        THEN 'SAND_FINE_AGGREGATE'
      WHEN lower(sm.recipe_material_desc) ~ '(murrum|murum|moorum|morram|ordinary earth|borrow earth|(^|[^a-z])earth($|[^a-z])|(^|[^a-z])soil($|[^a-z]))'
        THEN 'SOIL_MORRAM_EARTH'
      WHEN lower(sm.recipe_material_desc) ~ '(coarse aggregate|stone chips?|rubble|rough stones?|uncoursed rubble|coursed rubble|road metal|ballast|boulders?|plums?|khandki|header stones?|through stones?|pin headers?|stone slab|filter\s*\(\s*available|[0-9]+[ -]*mm down filter)'
        THEN 'STONE_AGGREGATE'
      WHEN lower(sm.recipe_material_desc) ~ 'laterite'
        THEN 'LATERITE'
      WHEN lower(sm.recipe_material_desc) ~ 'lime\s*stone slab|limestone slab'
        THEN 'LIMESTONE_SLAB'
      ELSE NULL
    END AS material_key
  FROM source_materials sm
  WHERE
    sm.recipe_material_qty IS NOT NULL
    AND sm.recipe_material_qty > 0
    AND sm.item_output_qty IS NOT NULL
    AND sm.item_output_qty > 0
),
policy_rows AS (
  SELECT
    c.ssr_code,
    c.material_index,
    c.material_key,
    CASE c.material_key
      WHEN 'SAND_FINE_AGGREGATE' THEN 'Sand'
      WHEN 'SOIL_MORRAM_EARTH' THEN 'Soil / murrum'
      WHEN 'STONE_AGGREGATE' THEN 'Stone / aggregate'
      WHEN 'LATERITE' THEN 'Laterite'
      WHEN 'LIMESTONE_SLAB' THEN 'Limestone slab'
      ELSE 'Review required'
    END AS material_label,
    c.recipe_material_desc,
    c.recipe_material_unit,
    c.recipe_material_qty,
    c.item_output_unit,
    c.item_output_qty,
    round(c.recipe_material_qty / NULLIF(c.item_output_qty, 0), 8) AS quantity_ratio,
    CASE c.material_key
      WHEN 'SAND_FINE_AGGREGATE' THEN 'SEIG_SAND_OTHERS'
      WHEN 'SOIL_MORRAM_EARTH' THEN 'SEIG_MORRAM_GRAVEL_EARTH'
      WHEN 'STONE_AGGREGATE' THEN 'SEIG_BUILDING_STONE'
      WHEN 'LATERITE' THEN 'SEIG_LATERITE'
      WHEN 'LIMESTONE_SLAB' THEN 'SEIG_LIMESTONE_SLABS'
      ELSE NULL
    END AS seig_code,
    CASE
      WHEN lower(c.recipe_material_unit) IN ('cum', 'cu.m', 'm3', 'm³') THEN 'CUM'
      WHEN lower(c.recipe_material_unit) IN ('mt', 'tonne', 'ton') THEN 'MT'
      WHEN lower(c.recipe_material_unit) = 'kg' THEN 'MT'
      ELSE upper(NULLIF(c.recipe_material_unit, ''))
    END AS quantity_unit,
    CASE
      WHEN lower(c.recipe_material_unit) = 'kg' THEN 0.001
      ELSE 1
    END::numeric AS conversion_factor,
    'AUTO_MAPPED' AS status,
    CASE c.material_key
      WHEN 'SAND_FINE_AGGREGATE' THEN 'Fine aggregate / sand recipe material mapped to Sand (Others).'
      WHEN 'SOIL_MORRAM_EARTH' THEN 'Earth / soil / murrum recipe material mapped to Morram / Gravel & Ordinary Earth.'
      WHEN 'STONE_AGGREGATE' THEN 'Coarse aggregate / stone / rubble recipe material mapped to Building Stone.'
      WHEN 'LATERITE' THEN 'Laterite recipe material mapped to Laterite.'
      WHEN 'LIMESTONE_SLAB' THEN 'Limestone slab recipe material mapped to Limestone Slabs.'
      ELSE 'Review material mapping before charging seigniorage.'
    END AS notes
  FROM classified c
  WHERE c.material_key IS NOT NULL
),
policies AS (
  SELECT
    s.code AS ssr_code,
    jsonb_build_object(
      'schema_version', 2,
      'source', 'SSR_RECIPE_MATERIALS',
      'generated_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'applicable', COUNT(pr.material_key) > 0,
      'materials', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'material_key', pr.material_key,
            'material_label', pr.material_label,
            'recipe_material_desc', pr.recipe_material_desc,
            'recipe_material_unit', pr.recipe_material_unit,
            'recipe_material_qty', pr.recipe_material_qty,
            'item_output_unit', pr.item_output_unit,
            'item_output_qty', pr.item_output_qty,
            'quantity_ratio', pr.quantity_ratio,
            'seig_code', pr.seig_code,
            'quantity_unit', pr.quantity_unit,
            'conversion_factor', pr.conversion_factor,
            'status', pr.status,
            'notes', pr.notes
          )
          ORDER BY pr.material_index
        ) FILTER (WHERE pr.material_key IS NOT NULL),
        '[]'::jsonb
      )
    ) AS policy
  FROM public.ssr_item s
  LEFT JOIN policy_rows pr ON pr.ssr_code = s.code
  GROUP BY s.code
)
UPDATE public.ssr_item s
SET seigniorage_applicability = policies.policy
FROM policies
WHERE policies.ssr_code = s.code;

-- Quick verification helpers:
-- SELECT code, jsonb_pretty(seigniorage_applicability)
-- FROM public.ssr_item
-- WHERE code IN ('IRR-CAW-7-11', 'IRR-CAW-2-1', 'IRR-CAW-1-7')
-- ORDER BY code;
--
-- SELECT
--   seigniorage_applicability->>'applicable' AS applicable,
--   COUNT(*) AS items
-- FROM public.ssr_item
-- GROUP BY 1
-- ORDER BY 1;
