-- Owner password reset tokens (service-role only).
create table if not exists public.password_reset_tokens (
  token text primary key,
  account_id uuid not null references public.accounts (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_account_id_idx
  on public.password_reset_tokens (account_id);

alter table public.password_reset_tokens enable row level security;
