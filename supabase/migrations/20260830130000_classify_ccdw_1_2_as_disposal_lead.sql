-- IRR-CCDW-1-2 is an excavation DATA item. Its transported earth is excavated
-- spoil going from the work location to a dump area, so expose Disposal Lead
-- (using the EARTH conveyance rate) instead of the legacy Earth Lead fallback.
update public.ssr_item
set lead_policy = jsonb_build_object(
  'purpose', 'EXCAVATED_DISPOSAL',
  'included_lead_m', 50,
  'included_lift_m', 3,
  'includes_all_lifts', false,
  'quantity_basis', 'PARENT_CUM',
  'allow_loading', false,
  'allow_unloading', false,
  'scrutiny_required', false,
  'default_conveyance_class', 'EARTH',
  'policy_version', 'ts_sor_2025_26_lead_policy_v1'
)
where code = 'IRR-CCDW-1-2';
