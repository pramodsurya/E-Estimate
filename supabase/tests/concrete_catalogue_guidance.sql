-- Run as the migration owner. All refresh-hook checks roll back.
begin;
do $test$
declare g jsonb;
begin
 assert (select count(*)=359 from public.catalogue_item_guidance where source='SSR');
 assert (select count(*)=923 from public.catalogue_item_guidance where source='MORTH');
 assert (select guidance->'grades'='[]'::jsonb from public.catalogue_item_guidance where code='IRR-GAW-2-2');
 assert not exists(select 1 from public.ssr_catalogue_items where selection_guidance is not null and
   selection_guidance->'source'->>'descriptionHash'<>md5(description));
 assert not exists(select 1 from public.catalogue_item_guidance g join public.morth m on g.source='MORTH' and g.code=m.code
   where g.guidance->'source'->>'descriptionHash'<>md5(m.description));
 assert not has_table_privilege('anon','public.catalogue_item_guidance','insert');
 assert not has_table_privilege('authenticated','public.catalogue_item_guidance','update');
 assert has_table_privilege('anon','public.ssr_catalogue_items','select');
 assert not public.catalogue_search_matches('M50 concrete','M5');
 assert public.catalogue_search_matches('M25 solid slab pump','M-25 slab pump');
 assert public.concrete_selection_guidance('SSR','TEST','Gate 0.50 M 16 Elements',null) is null;
 g:=public.concrete_selection_guidance('SSR','TEST','M5 concrete for future special work',null);
 assert g->'grades'='["M5"]'::jsonb;
 assert g->>'application'='M5 concrete for future special work';
 -- The trigger refreshes metadata; technical values remain untouched.
 delete from public.catalogue_item_guidance where source='MORTH' and code='MORTH-2019-14.01-B-i-p-medium';
 update public.morth set recipe=recipe where code='MORTH-2019-14.01-B-i-p-medium';
 assert exists(select 1 from public.catalogue_item_guidance where source='MORTH' and code='MORTH-2019-14.01-B-i-p-medium'
   and guidance->'scope'->0->>'detail' like '20% source allowance%');
end $test$;
rollback;
