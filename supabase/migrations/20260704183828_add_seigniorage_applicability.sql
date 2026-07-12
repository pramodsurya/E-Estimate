-- Add seigniorage_applicability JSONB column to ssr_item table.
-- This mirrors the lead_applicability / lead_policy pattern:
-- each SSR item can declare which seigniorage charge applies to it.
--
-- Structure (JSONB):
-- {
--   "applicable": true,            -- whether seigniorage applies to this item
--   "seig_code": "SEIG_...",       -- FK-like reference to seigniorage_charge.seig_code
--   "rate_override": null,         -- optional manual rate override (Rs per unit)
--   "notes": null                  -- optional admin notes
-- }

ALTER TABLE ssr_item
  ADD COLUMN IF NOT EXISTS seigniorage_applicability jsonb;

COMMENT ON COLUMN ssr_item.seigniorage_applicability IS
  'Seigniorage policy for this SSR item. Links to seigniorage_charge.seig_code.';
