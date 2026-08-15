-- Discovery and staging for the PRED monthly steel/cement circulars.
-- Source index: https://www.pred.telangana.gov.in/steel_cement_rates.php
--
-- Two tables, and the split between them is the point:
--
--   material_rate_document  — which circulars exist, and whether we have read
--                             one. Written by the scheduled sync.
--   material_rate_staging   — rates extracted from a circular, awaiting a
--                             human. Nothing here prices anything.
--
-- The live table (public.material_rate_monthly) is only ever written by an
-- approval, never by the sync. A mis-read cement rate does not fail loudly: it
-- silently re-prices every concrete item in every estimate that resolves
-- through that circular, and the app deliberately ranks a monthly circular
-- *above* the published yearly SOR rate — so a bad extraction outranks the
-- schedule itself. That is why extraction and publication are separated.

create table if not exists public.material_rate_document (
  id uuid primary key default gen_random_uuid(),
  -- The document's own address on the PRED site. Newer links carry a timestamp
  -- and a UUID, so this is not reconstructible and is the discovery key.
  source_url text not null unique,
  -- As printed in the index, e.g. '5-May-2026' or '10_October_2014.PDF'.
  source_label text not null,
  -- First of the month the circular governs; matches material_rate_monthly.
  effective_from date not null,
  -- sha256 of the PDF bytes. An unchanged hash means a re-run has nothing to
  -- do; a *changed* hash on a URL we have seen means the department reissued
  -- the circular, which must be looked at rather than silently re-imported.
  content_sha256 text,
  content_bytes integer,
  -- Where the downloaded PDF was put, so a reviewer can open the source.
  storage_path text,
  status text not null default 'discovered'
    check (status in ('discovered', 'downloaded', 'extracted', 'approved', 'ignored', 'failed')),
  status_note text,
  discovered_at timestamptz not null default now(),
  downloaded_at timestamptz,
  extracted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text
);

comment on table public.material_rate_document is
  'One row per monthly steel/cement circular published by PRED. Written by the scheduled discovery job; never prices anything by itself.';

create index if not exists material_rate_document_effective_idx
  on public.material_rate_document (effective_from desc);
create index if not exists material_rate_document_status_idx
  on public.material_rate_document (status);

create table if not exists public.material_rate_staging (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.material_rate_document (id) on delete cascade,
  -- Resolved through ssr_material_alias where possible; null when the extractor
  -- could not name the material, which is a row for a human to decide.
  material_code text,
  -- Always kept: it is the evidence for the mapping above.
  source_description text not null,
  source_unit text,
  rate numeric,
  effective_from date not null,
  -- What the live table holds for this material at this date, captured when the
  -- row was staged so a reviewer sees the movement without a second query.
  previous_rate numeric,
  extraction_note text,
  created_at timestamptz not null default now()
);

comment on table public.material_rate_staging is
  'Rates read out of a circular, awaiting review. Approving a row is what writes public.material_rate_monthly.';

create index if not exists material_rate_staging_document_idx
  on public.material_rate_staging (document_id);
create index if not exists material_rate_staging_material_idx
  on public.material_rate_staging (material_code, effective_from desc);

-- The desktop app reads published rates only. Discovery and staging are for the
-- sync job and the review screen, both of which use the service role.
alter table public.material_rate_document enable row level security;
alter table public.material_rate_staging enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'material_rate_document'
      and policyname = 'material_rate_document_read'
  ) then
    create policy material_rate_document_read
      on public.material_rate_document for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'material_rate_staging'
      and policyname = 'material_rate_staging_read'
  ) then
    create policy material_rate_staging_read
      on public.material_rate_staging for select
      using (true);
  end if;
end $$;
