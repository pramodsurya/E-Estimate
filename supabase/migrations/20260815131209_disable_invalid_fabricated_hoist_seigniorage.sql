-- Fabricated hoist DATA is priced by hoist capacity and carries a separate
-- fabricated-weight reference for rate/Lead only.  Earlier automatic policy
-- generation incorrectly treated Plummer blocks / hubs / couplings as
-- Building Stone.  These are fabricated mechanical parts, not an evidenced
-- minor-mineral input, so they must not generate an automatic Seigniorage row.
--
-- A separately verified mineral material can be added later with its own
-- published capacity-basis quantity and statutory charge unit.
begin;

update public.ssr_item as item
set seigniorage_applicability = jsonb_build_object(
  'schema_version', 3,
  'source', 'SSR_SEIGNIORAGE_AUDIT',
  'applicable', false,
  'rows', jsonb_build_array(),
  'materials', jsonb_build_array(),
  'reason', 'Fabricated hoist DATA has no evidenced minor-mineral material for automatic Seigniorage. Plummer blocks / hubs / couplings require a separately verified material policy.',
  'policy_basis', jsonb_build_object(
    'purpose', 'NON_SEIGNIORAGE_ITEM',
    'review_status', 'REVIEWED',
    'evidence', jsonb_build_array(
      'Seigniorage audit: previous Building Stone mapping was inferred from fabricated Plummer blocks / hubs / couplings.',
      'The adopted DATA basis is hoist capacity; the fabricated-weight basis is reference/Lead only.'
    )
  )
)
where item.code in (
  'IRR-GAW-1-3',
  'IRR-GAW-2-4',
  'IRR-GAW-2-7',
  'IRR-GAW-2-9',
  'IRR-GAW-2-11'
)
  and coalesce(item.seigniorage_applicability->>'applicable', 'false') = 'true'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(item.seigniorage_applicability->'rows', '[]'::jsonb)) as policy(row)
    where policy.row->>'seig_code' = 'SEIG_BUILDING_STONE'
      and lower(coalesce(policy.row->>'material_desc', '')) ~ '(plummer|coupling)'
  );

commit;
