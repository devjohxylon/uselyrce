-- Session revocation + Stripe webhook idempotency + lock down SECURITY DEFINER RPCs

alter table public.accounts
  add column if not exists session_version integer not null default 0;

create table if not exists public.stripe_webhook_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- Deny PostgREST access to privileged RPCs (service role still works as table owner)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjust_points'
  ) then
    revoke execute on function public.adjust_points(text, integer, text, text, text) from public, anon, authenticated;
  end if;
exception when undefined_function then
  null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'season_points_leaderboard'
  ) then
    revoke execute on function public.season_points_leaderboard(timestamp with time zone, integer) from public, anon, authenticated;
  end if;
exception when undefined_function then
  null;
end $$;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'season_points_leaderboard_between'
  ) then
    revoke execute on function public.season_points_leaderboard_between(timestamp with time zone, timestamp with time zone, integer) from public, anon, authenticated;
  end if;
exception when undefined_function then
  null;
end $$;
