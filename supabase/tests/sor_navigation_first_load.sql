-- Run as the migration owner. Synthetic projection changes are rolled back.
begin;
do $test$
declare edition text; expected jsonb;
begin
  assert not exists (
    (select year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code from public.sor_picker_index
     except all select * from public.sor_picker_navigation_entry)
    union all
    (select * from public.sor_picker_navigation_entry except all
     select year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code from public.sor_picker_index)
  ), 'Navigation projection must exactly match the catalogue';
  for edition in select distinct year from public.sor_picker_index loop
    select jsonb_build_object('year', edition, 'paths', coalesce(jsonb_agg(to_jsonb(paths)), '[]'::jsonb)) into expected
    from (
      select part_no::text part, heading, section, subsection, count(*)::integer count,
        min(pdf_page) page, min(recipe_code) first_code
      from public.sor_picker_index where year = edition
      group by part_no, heading, section, subsection
      order by min(pdf_page) nulls last, min(recipe_code)
    ) paths;
    assert public.sor_picker_navigation(edition) = expected, 'Tree counts, labels and ordering must stay identical';
  end loop;
  assert public.sor_picker_navigation('missing-edition')->'paths' = '[]'::jsonb;
  assert has_table_privilege('anon', 'public.sor_picker_navigation_entry', 'select');
  assert not has_table_privilege('anon', 'public.sor_picker_navigation_entry', 'insert');
  assert not has_table_privilege('authenticated', 'public.sor_picker_navigation_entry', 'update');

  insert into public.sor_picker_index(year_row_code, year, part_no, heading, section, subsection, pdf_page, recipe_code)
    values ('NAVIGATION-QA-ROW', 'NAVIGATION-QA', 1, 'Test heading', 'Test section', '', 123, 'NAVIGATION-QA-ITEM');
  assert public.sor_picker_navigation('NAVIGATION-QA')->'paths'->0->>'count' = '1';
  update public.sor_picker_index set year_row_code = 'NAVIGATION-QA-ROW-MOVED', year = 'NAVIGATION-QA-NEXT',
    heading = 'Moved heading', pdf_page = 456 where year_row_code = 'NAVIGATION-QA-ROW';
  assert public.sor_picker_navigation('NAVIGATION-QA')->'paths' = '[]'::jsonb;
  assert public.sor_picker_navigation('NAVIGATION-QA-NEXT')->'paths'->0->>'heading' = 'Moved heading';
  assert public.sor_picker_navigation('NAVIGATION-QA-NEXT')->'paths'->0->>'page' = '456';
  delete from public.sor_picker_index where year_row_code = 'NAVIGATION-QA-ROW-MOVED';
  assert public.sor_picker_navigation('NAVIGATION-QA-NEXT')->'paths' = '[]'::jsonb;
end $test$;
rollback;
