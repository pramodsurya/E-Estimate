-- Remove the retired catalogue after a verified local full-schema/data backup.
-- The renderer moved to current SOR/SSR contracts on 2026-10-23.
-- Deliberately use RESTRICT throughout so an unexpected dependency aborts cleanup.
SET lock_timeout = '5s';
SET statement_timeout = '120s';

DO $cleanup$
DECLARE
  actual_tables text[];
  expected_tables constant text[] := ARRAY[
    'civil',
    'civil_rate',
    'conveyance_charge',
    'conveyance_rate',
    'electrical',
    'electrical_item_version',
    'electrical_rate',
    'labour',
    'labour_rate',
    'lead_charge',
    'lead_detail_item',
    'lead_detail_year',
    'lead_note',
    'lead_rate',
    'machinery',
    'machinery_rate',
    'manifest',
    'material',
    'material_rate',
    'material_rate_document',
    'material_rate_monthly',
    'pipe_lead_item',
    'pipe_lead_rate',
    'plumbing',
    'plumbing_rate',
    'reviewed_links',
    'snapshot',
    'sor_adjustment_rule',
    'sor_catalogue',
    'sor_catalogue_item',
    'sor_catalogue_rate',
    'sor_dataset_release',
    'sor_recipe_alias',
    'sor_recipe_definition',
    'sor_recipe_observation',
    'sor_reviewed_navigation_node',
    'sor_reviewed_navigation_variant',
    'ssr_item_history',
    'ssr_material_alias',
    'ssr_year_history'
  ];
BEGIN
  IF to_regnamespace('legacy_sor_archive') IS NULL THEN
    RETURN;
  END IF;
  SELECT array_agg(c.relname::text ORDER BY c.relname::text COLLATE "C")
    INTO actual_tables
    FROM pg_class c
    WHERE c.relnamespace = 'legacy_sor_archive'::regnamespace
      AND c.relkind IN ('r','p','v','m','f');
  IF actual_tables IS DISTINCT FROM expected_tables THEN
    RAISE EXCEPTION 'Archive inventory changed; cleanup aborted. Found: %', actual_tables;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname <> 'legacy_sor_archive' AND p.prokind IN ('f','p')
      AND (p.prosrc ILIKE '%legacy_sor_archive%' OR p.prosrc ILIKE '%relink_json%'
        OR array_to_string(p.proconfig, ',') ILIKE '%legacy_sor_archive%')
  ) THEN
    RAISE EXCEPTION 'A function outside the archive references it; cleanup aborted';
  END IF;
END
$cleanup$;

DROP FUNCTION IF EXISTS legacy_sor_archive.relink_json(jsonb) RESTRICT;
DROP TABLE IF EXISTS
  legacy_sor_archive."civil",
  legacy_sor_archive."civil_rate",
  legacy_sor_archive."conveyance_charge",
  legacy_sor_archive."conveyance_rate",
  legacy_sor_archive."electrical",
  legacy_sor_archive."electrical_item_version",
  legacy_sor_archive."electrical_rate",
  legacy_sor_archive."labour",
  legacy_sor_archive."labour_rate",
  legacy_sor_archive."lead_charge",
  legacy_sor_archive."lead_detail_item",
  legacy_sor_archive."lead_detail_year",
  legacy_sor_archive."lead_note",
  legacy_sor_archive."lead_rate",
  legacy_sor_archive."machinery",
  legacy_sor_archive."machinery_rate",
  legacy_sor_archive."manifest",
  legacy_sor_archive."material",
  legacy_sor_archive."material_rate",
  legacy_sor_archive."material_rate_document",
  legacy_sor_archive."material_rate_monthly",
  legacy_sor_archive."pipe_lead_item",
  legacy_sor_archive."pipe_lead_rate",
  legacy_sor_archive."plumbing",
  legacy_sor_archive."plumbing_rate",
  legacy_sor_archive."reviewed_links",
  legacy_sor_archive."snapshot",
  legacy_sor_archive."sor_adjustment_rule",
  legacy_sor_archive."sor_catalogue",
  legacy_sor_archive."sor_catalogue_item",
  legacy_sor_archive."sor_catalogue_rate",
  legacy_sor_archive."sor_dataset_release",
  legacy_sor_archive."sor_recipe_alias",
  legacy_sor_archive."sor_recipe_definition",
  legacy_sor_archive."sor_recipe_observation",
  legacy_sor_archive."sor_reviewed_navigation_node",
  legacy_sor_archive."sor_reviewed_navigation_variant",
  legacy_sor_archive."ssr_item_history",
  legacy_sor_archive."ssr_material_alias",
  legacy_sor_archive."ssr_year_history"
RESTRICT;
DROP SCHEMA IF EXISTS legacy_sor_archive RESTRICT;
