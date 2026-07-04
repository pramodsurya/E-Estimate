-- Lead policy rules for Telangana I&CAD Standard Data 2025-26.
-- The application table is public.ssr_item (singular).
-- Runtime estimation should resolve by item code from this reviewed policy, not by AI/keyword search.

alter table public.ssr_item
  add column if not exists lead_policy jsonb;

comment on column public.ssr_item.lead_policy is
  'Reviewed lead/disposal policy JSON. Used by E-Estimate to decide material lead, disposal lead, included lead/lift, scrutiny, and blocked loading/unloading.';

create index if not exists ssr_item_lead_policy_gin
  on public.ssr_item using gin (lead_policy);

alter table public.ssr_item
  drop constraint if exists ssr_item_lead_policy_shape;

alter table public.ssr_item
  add constraint ssr_item_lead_policy_shape
  check (
    lead_policy is null
    or (
      jsonb_typeof(lead_policy) = 'object'
      and lead_policy ? 'purpose'
      and lead_policy->>'purpose' in (
        'EXCAVATED_DISPOSAL',
        'MATERIAL_SUPPLY',
        'REUSE_FROM_DUMP',
        'REUSE_FROM_HEAP',
        'NO_EXTRA_LEAD',
        'REVIEW_REQUIRED'
      )
    )
  );

with policies(pattern, policy) as (
  values
    (
      '^IRR-DAW-1-([1-3]|[5-7])$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 1000,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', false,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-DAW-1-4$',
      jsonb_build_object(
        'purpose', 'REVIEW_REQUIRED',
        'included_lead_m', 1000,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'note', 'Item text says initial lead up to 1 km and all leads; verify against corrigendum.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-DAW-1-(8|9)$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 50,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'MANUAL_LOOSE_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-TAW-1-1$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 50,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', false,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-TAW-1-[2-6]$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 1000,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', false,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-1-(1|4|6|7|8|9|10|11|12)$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 1000,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', false,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-1-(2|3|5)$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 10,
        'included_lift_m', 3,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'default_conveyance_class', 'EARTH',
        'note', 'Special manual-item disposal rule; common lead chart starts from 50 m.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CCDW-1-(1|3|4|5|6|7)$',
      jsonb_build_object(
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
    ),
    (
      '^IRR-CCDW-3-1$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 50,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'DERIVED_LOOSE_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-PMW-2-[12]$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 10,
        'included_lift_m', 3,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'default_conveyance_class', 'EARTH',
        'note', 'Special manual-item disposal rule; common lead chart starts from 50 m.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-PMW-3-(15|16)$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 50,
        'included_lift_m', 0,
        'includes_all_lifts', true,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', false,
        'default_conveyance_class', 'EARTH',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^COM-MWRK-[1-4]$',
      jsonb_build_object(
        'purpose', 'EXCAVATED_DISPOSAL',
        'included_lead_m', 10,
        'included_lift_m', 1.5,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'default_conveyance_class', 'EARTH',
        'note', 'Manual/non-contractor item; enable only under manual-item policy scrutiny.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-2-',
      jsonb_build_object(
        'purpose', 'MATERIAL_SUPPLY',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Soil from approved borrow area; supply lead, not disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-DAW-5-',
      jsonb_build_object(
        'purpose', 'MATERIAL_SUPPLY',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Borrow/source material supply lead, not disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-3-',
      jsonb_build_object(
        'purpose', 'REUSE_FROM_DUMP',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Soil taken from dump and used in embankment; not excavated-disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-PMW-3-(10|11)$',
      jsonb_build_object(
        'purpose', 'REUSE_FROM_DUMP',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Soil taken from dump and reused; not excavated-disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-4-',
      jsonb_build_object(
        'purpose', 'REUSE_FROM_HEAP',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Soil already collected in heaps along canal for embankment; not excavated-disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-CAW-7-3$',
      jsonb_build_object(
        'purpose', 'REUSE_FROM_HEAP',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'PARENT_CUM',
        'allow_loading', true,
        'allow_unloading', true,
        'scrutiny_required', false,
        'note', 'Reuse from heap; not excavated-disposal lead.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    ),
    (
      '^IRR-PMW-1-',
      jsonb_build_object(
        'purpose', 'REVIEW_REQUIRED',
        'included_lead_m', 0,
        'included_lift_m', 0,
        'includes_all_lifts', false,
        'quantity_basis', 'MANUAL_LOOSE_CUM',
        'allow_loading', false,
        'allow_unloading', false,
        'scrutiny_required', true,
        'note', 'Tree cutting/bush/weed removal; no automatic disposal lead because parent unit is not loose cum.',
        'policy_version', 'ts_sor_2025_26_lead_policy_v1'
      )
    )
)
update public.ssr_item item
set lead_policy = policy
from policies
where item.code ~ policies.pattern;

-- Specific reviewed override: IRR-CAW-1-7 is hard-rock disposal.
update public.ssr_item
set lead_policy = lead_policy || jsonb_build_object(
  'default_conveyance_class', 'STONE',
  'note', 'Hard-rock excavated material disposal to approved dump area; initial 1 km and all lifts included.'
)
where code = 'IRR-CAW-1-7'
  and lead_policy is not null;
