-- Navigation must not read the wide recipe/search heap on the first request.
-- Keep only the tree fields in a small, transactionally maintained projection.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
lock table public.sor_picker_index in share row exclusive mode;

create table public.sor_picker_navigation_entry (
  year_row_code text primary key,
  year text not null,
  part_no smallint,
  heading text,
  section text,
  subsection text,
  pdf_page integer,
  recipe_code text not null
);
create index sor_picker_navigation_entry_year on public.sor_picker_navigation_entry(year);
alter table public.sor_picker_navigation_entry enable row level security;
create policy sor_picker_navigation_entry_read on public.sor_picker_navigation_entry
  for select to anon, authenticated using (true);
revoke all on public.sor_picker_navigation_entry from public, anon, authenticated;
grant select on public.sor_picker_navigation_entry to anon, authenticated;
grant all on public.sor_picker_navigation_entry to service_role;

insert into public.sor_picker_navigation_entry
  (year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code)
select year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code
from public.sor_picker_index;

create function public.sor_picker_sync_navigation_entry()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $fn$
begin
  if tg_op = 'TRUNCATE' then
    truncate table public.sor_picker_navigation_entry;
    return null;
  end if;
  if tg_op = 'DELETE' then
    delete from public.sor_picker_navigation_entry where year_row_code = old.year_row_code;
    return null;
  end if;
  if tg_op = 'UPDATE' and old.year_row_code is distinct from new.year_row_code then
    delete from public.sor_picker_navigation_entry where year_row_code = old.year_row_code;
  end if;
  insert into public.sor_picker_navigation_entry as entry
    (year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code)
  values (new.year_row_code, new.year, new.part_no, new.heading, new.section,
    new.subsection, new.pdf_page, new.recipe_code)
  on conflict (year_row_code) do update set
    year = excluded.year, part_no = excluded.part_no, heading = excluded.heading,
    section = excluded.section, subsection = excluded.subsection,
    pdf_page = excluded.pdf_page, recipe_code = excluded.recipe_code
  where (entry.year, entry.part_no, entry.heading, entry.section, entry.subsection, entry.pdf_page, entry.recipe_code)
    is distinct from
    (excluded.year, excluded.part_no, excluded.heading, excluded.section, excluded.subsection, excluded.pdf_page, excluded.recipe_code);
  return null;
end $fn$;
revoke all on function public.sor_picker_sync_navigation_entry() from public, anon, authenticated;
grant execute on function public.sor_picker_sync_navigation_entry() to service_role;
create trigger sor_picker_navigation_entry_sync
  after insert or update or delete on public.sor_picker_index
  for each row execute function public.sor_picker_sync_navigation_entry();
create trigger sor_picker_navigation_entry_truncate
  after truncate on public.sor_picker_index
  for each statement execute function public.sor_picker_sync_navigation_entry();

create or replace function public.sor_picker_navigation(p_year text)
returns jsonb language sql stable security invoker set search_path = pg_catalog set jit = off as $fn$
  select jsonb_build_object('year', p_year, 'paths', coalesce(jsonb_agg(to_jsonb(paths)), '[]'::jsonb))
  from (
    select part_no::text part, heading, section, subsection, count(*)::integer count,
      min(pdf_page) page, min(recipe_code) first_code
    from public.sor_picker_navigation_entry where year = p_year
    group by part_no, heading, section, subsection
    order by min(pdf_page) nulls last, min(recipe_code)
  ) paths
$fn$;
revoke all on function public.sor_picker_navigation(text) from public;
grant execute on function public.sor_picker_navigation(text) to anon, authenticated;
analyze public.sor_picker_navigation_entry;
