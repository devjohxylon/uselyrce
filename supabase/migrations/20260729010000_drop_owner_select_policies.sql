-- Remove the owner self-read policies from saas_core.
--
-- They matched on `auth.jwt() -> 'user_metadata'`, which end users can edit on
-- their own Supabase Auth account — so anyone holding the public anon key could
-- mint an authenticated JWT, claim an org, and read `servers` rows (host, port,
-- encrypted RCON password). Nothing in the app relies on them: every SaaS read
-- goes through the service role, which bypasses RLS.
--
-- RLS stays enabled with zero policies, so anon and authenticated are denied.

drop policy if exists orgs_owner_select on public.orgs;
drop policy if exists servers_owner_select on public.servers;
drop policy if exists role_maps_owner_select on public.org_role_permissions;
