create index sor_picker_index_navigation on public.sor_picker_index
 (year,part_no,heading,section,subsection) include (pdf_page,recipe_code);
analyze public.sor_picker_index;
