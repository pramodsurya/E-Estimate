-- Supabase default privileges may grant DML at table creation. Only public reads
-- are needed; RLS also restricts them to the active reviewed release.
revoke all on public.sor_reviewed_navigation_node,public.sor_reviewed_navigation_variant from public,anon,authenticated;
grant select on public.sor_reviewed_navigation_node,public.sor_reviewed_navigation_variant to anon,authenticated;
