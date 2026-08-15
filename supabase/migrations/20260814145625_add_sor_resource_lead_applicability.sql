-- Lead belongs to the SOR resource itself.  An SSR recipe may later reference
-- that resource, but it must not infer Lead merely from a matching description.
alter table public.material
  add column if not exists lead_applicability jsonb not null default
    '{"applicable": false, "source": "SOR_RESOURCE", "review_status": "NOT_CLASSIFIED"}'::jsonb;

alter table public.machinery
  add column if not exists lead_applicability jsonb not null default
    '{"applicable": false, "source": "SOR_RESOURCE", "review_status": "NOT_CLASSIFIED"}'::jsonb;

-- The imported material master already carries the approved conveyance class.
-- Turn that into an explicit, auditable Lead decision without changing the
-- legacy SSR item-level policies.
update public.material
set lead_applicability = case
  when nullif(btrim(conveyance_class), '') is not null then jsonb_build_object(
    'applicable', true,
    'conveyance_class', upper(btrim(conveyance_class)),
    'material_name', name,
    'source', 'SOR_CONVEYANCE_CLASS',
    'review_status', 'SEEDED_FROM_MASTER'
  )
  else jsonb_build_object(
    'applicable', false,
    'source', 'SOR_RESOURCE',
    'review_status', 'NOT_CLASSIFIED'
  )
end;

-- Machinery has no imported conveyance-class field.  It is deliberately kept
-- off until an administrator explicitly classifies that machine resource.
update public.machinery
set lead_applicability = jsonb_build_object(
  'applicable', false,
  'source', 'SOR_RESOURCE',
  'review_status', 'NOT_CLASSIFIED'
)
where lead_applicability is null
   or lead_applicability = '{"applicable": false, "source": "SOR_RESOURCE", "review_status": "NOT_CLASSIFIED"}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'material_lead_applicability_is_object'
      and conrelid = 'public.material'::regclass
  ) then
    alter table public.material
      add constraint material_lead_applicability_is_object
      check (
        jsonb_typeof(lead_applicability) = 'object'
        and jsonb_typeof(lead_applicability -> 'applicable') = 'boolean'
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'machinery_lead_applicability_is_object'
      and conrelid = 'public.machinery'::regclass
  ) then
    alter table public.machinery
      add constraint machinery_lead_applicability_is_object
      check (
        jsonb_typeof(lead_applicability) = 'object'
        and jsonb_typeof(lead_applicability -> 'applicable') = 'boolean'
      );
  end if;
end $$;
