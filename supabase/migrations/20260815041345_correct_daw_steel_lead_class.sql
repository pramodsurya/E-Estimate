-- A small group of imported reinforcement-steel rows was labelled CEMENT in the
-- Lead metadata. That split one physical material into two Lead groups. Correct
-- only CEMENT-valued material entries whose description is unambiguously steel;
-- normal cement material entries and any later editorial correction stay untouched.
update public.ssr_item as item
set lead_applicability = jsonb_set(
  item.lead_applicability,
  '{materials}',
  (
    select jsonb_object_agg(
      entry.key,
      case
        when entry.value = '"CEMENT"'::jsonb
          and entry.key ~* '(steel|reinforcement|tmt|hysd|wire fabric|g\\.?i\\.? sheet)'
          then '"STEEL"'::jsonb
        else entry.value
      end
    )
    from jsonb_each(item.lead_applicability -> 'materials') as entry(key, value)
  ),
  true
)
where jsonb_typeof(item.lead_applicability -> 'materials') = 'object'
  and exists (
    select 1
    from jsonb_each(item.lead_applicability -> 'materials') as entry(key, value)
    where entry.value = '"CEMENT"'::jsonb
      and entry.key ~* '(steel|reinforcement|tmt|hysd|wire fabric|g\\.?i\\.? sheet)'
  );
