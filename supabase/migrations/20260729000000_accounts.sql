-- Usely email accounts + buy-first onboarding
-- Owners get email/password accounts; staff keep Discord login.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  created_at timestamptz not null default now()
);

alter table public.orgs alter column owner_discord_id drop not null;

alter table public.orgs
  add column if not exists owner_account_id uuid
    references public.accounts (id) on delete set null;

create index if not exists orgs_owner_account_id_idx on public.orgs (owner_account_id);

create table if not exists public.setup_tokens (
  token text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Service-role only (no policies): browser clients never touch these tables.
alter table public.accounts enable row level security;
alter table public.setup_tokens enable row level security;
