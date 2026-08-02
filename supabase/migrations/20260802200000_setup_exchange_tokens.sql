-- One-time hop tokens after setup finish (survive restarts / multi-instance).
create table if not exists public.setup_exchange_tokens (
  token text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists setup_exchange_tokens_account_id_idx
  on public.setup_exchange_tokens (account_id);

alter table public.setup_exchange_tokens enable row level security;
