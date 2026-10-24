create or replace function public.morth_picker_browse(p_path jsonb default '{}',p_query text default '',p_offset integer default 0,p_limit integer default 100) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog set jit=off as $f$
declare result jsonb;lvl text;
begin
 if p_offset<0 or p_limit<1 or p_limit>100 then raise exception 'Invalid MoRTH page';end if;
 lvl:=case when coalesce(trim(p_query),'')<>'' or p_path ? 'heading' then 'item' when p_path ? 'part' then 'heading' else 'part' end;
 with rows as materialized(select * from public."MORTH_Recipie_View"v where (not p_path?'part' or part=p_path->>'part') and (not p_path?'heading' or heading=p_path->>'heading')
 and(not p_path?'category' or project_category is null or project_category='not_applicable' or source_codes_by_category ? (p_path->>'category'))
 and(coalesce(trim(p_query),'')='' or description ilike '%'||p_query||'%' or printed_item=p_query))
 select jsonb_build_object('level',lvl,'total',case when lvl='item' then (select count(*) from rows)else 0 end,'rows',
 case when lvl='item' then coalesce((select jsonb_agg(jsonb_build_object('code',code,'description',description,'unit',unit,'part',part,'heading',heading,'printedItem',printed_item,'variant',analysis_variant,'category',project_category,'sourceCodes',source_codes_by_category,'edition',source_edition))from(select * from rows order by chapter::integer,printed_item,code limit p_limit offset p_offset)p),'[]')
 else coalesce((select jsonb_agg(jsonb_build_object('key',key,'label',key,'count',n)order by ch,key)from(select case when lvl='part' then part else heading end key,count(*)n,min(chapter::integer)ch from rows group by 1)g),'[]')end)into result;
 return result;
end $f$;
