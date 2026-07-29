-- Usely SaaS core tenancy
-- Apply via Supabase SQL editor or: supabase db push

create extension if not exists "pgcrypto";

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_discord_id text not null,
  discord_guild_id text unique,
  default_server_id uuid,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text not null default 'basic'
    check (plan in ('basic', 'pro', 'network')),
  plan_status text not null default 'inactive'
    check (plan_status in ('inactive', 'trialing', 'active', 'past_due', 'canceled')),
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  rcon_host text not null,
  rcon_port integer not null check (rcon_port > 0 and rcon_port < 65536),
  rcon_password_enc text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table public.orgs
  drop constraint if exists orgs_default_server_id_fkey;

alter table public.orgs
  add constraint orgs_default_server_id_fkey
  foreign key (default_server_id) references public.servers (id) on delete set null;

create table if not exists public.org_role_permissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  discord_role_id text not null,
  label text,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, discord_role_id)
);

create index if not exists servers_org_id_idx on public.servers (org_id);
create index if not exists org_role_permissions_org_id_idx on public.org_role_permissions (org_id);
create index if not exists orgs_owner_discord_id_idx on public.orgs (owner_discord_id);

alter table public.orgs enable row level security;
alter table public.servers enable row level security;
alter table public.org_role_permissions enable row level security;

-- Browser clients: no direct access. Control plane uses service role.
-- Owner self-read helper for future authenticated Supabase client usage.
drop policy if exists orgs_owner_select on public.orgs;
create policy orgs_owner_select on public.orgs
  for select
  to authenticated
  using (
    owner_discord_id = coalesce(
      auth.jwt() -> 'user_metadata' ->> 'provider_id',
      auth.jwt() -> 'user_metadata' ->> 'sub',
      ''
    )
  );

drop policy if exists servers_owner_select on public.servers;
create policy servers_owner_select on public.servers
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orgs o
      where o.id = servers.org_id
        and o.owner_discord_id = coalesce(
          auth.jwt() -> 'user_metadata' ->> 'provider_id',
          auth.jwt() -> 'user_metadata' ->> 'sub',
          ''
        )
    )
  );

drop policy if exists role_maps_owner_select on public.org_role_permissions;
create policy role_maps_owner_select on public.org_role_permissions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.orgs o
      where o.id = org_role_permissions.org_id
        and o.owner_discord_id = coalesce(
          auth.jwt() -> 'user_metadata' ->> 'provider_id',
          auth.jwt() -> 'user_metadata' ->> 'sub',
          ''
        )
    )
  );
