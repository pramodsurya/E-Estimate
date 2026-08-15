-- Permanent audit trail for the unattended PRED steel/cement circular sync.
-- The rate table remains the application-facing source of truth; this table
-- makes every automatic import reproducible from its original PDF.

create extension if not exists pgcrypto;

create table if not exists public.material_rate_document (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  source_label text not null,
  effective_from date not null,
  effective_to date not null,
  sor_year text,
  pdf_sha256 text,
  storage_path text,
  ocr_text text,
  extracted_rates jsonb not null default '{}'::jsonb,
  status text not null default 'FAILED'
    check (status in ('IMPORTED', 'FAILED', 'QUARANTINED')),
  failure_reason text,
  first_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  imported_at timestamptz,
  check (source_url ~ '^https://www\.pred\.telangana\.gov\.in/'),
  check (effective_to >= effective_from),
  check (pdf_sha256 is null or pdf_sha256 ~ '^[a-f0-9]{64}$')
);

create index if not exists material_rate_document_effective_from_idx
  on public.material_rate_document (effective_from desc);

create index if not exists material_rate_document_pdf_sha256_idx
  on public.material_rate_document (pdf_sha256)
  where pdf_sha256 is not null;

comment on table public.material_rate_document is
  'Immutable source-document audit trail for PRED monthly steel and cement rate imports.';

-- This table is not application data. It is written only with the service-role
-- secret from the scheduled job and should never be exposed through the Data API.
alter table public.material_rate_document enable row level security;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'material-rate-circulars',
  'material-rate-circulars',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
