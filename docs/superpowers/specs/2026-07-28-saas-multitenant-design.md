# Usely SaaS — Multi-tenant Rust Console Admin Design

**Date:** 2026-07-28  
**Status:** Approved (Approach A)

## Goal

Evolve Astral Bot into a shared SaaS so any Rust Console community can sign up with Discord, link their guild, add one or more Nitrado WebRCON servers, map Discord roles to panel permissions, use the Discord bot, and pay via Stripe.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Delivery | True multi-tenant shared app (evolve this repo) |
| Auth | Discord OAuth only (Supabase Auth) |
| Staff access | Discord role → permission sets (union of roles) |
| Scope | Core + Stripe |
| Pricing | Basic $20/mo (1 server), Pro $49/mo (5), Network $99/mo (15) |
| Stack | Keep Express + discord.js + rce.js on Railway; add Supabase + Stripe |
| Panel rewrite | Not in v1 (keep `panel.html`) |

## Architecture

One long-running Node process hosts:

- Express admin panel + API
- Shared Discord bot (many guilds)
- Multi-server `rce.js` connection pool
- Socket.IO rooms keyed by `server:{serverId}`

Supabase holds tenants, encrypted RCON secrets, role maps, and Stripe customer/subscription state.

```
Staff browser → Discord OAuth (Supabase) → Express API
Discord guilds → shared bot → org lookup by guild_id
Express / bot → RCON pool → Nitrado WebRCON (per server)
Stripe webhooks → Supabase subscription rows → server-limit enforcement
```

### Compatibility mode

- `SAAS_MODE=false` (default during rollout): current single-server env (`RCON_*`, `GUILD_ID`, access-key login) unchanged for Astral.
- `SAAS_MODE=true`: multi-tenant paths required; env RCON used only as optional bootstrap for the first org.

## Tenancy model

| Entity | Meaning |
|--------|---------|
| User | Discord account via Supabase Auth (`discord_id` unique) |
| Org | Paying community; owns Stripe subscription |
| Guild link | Exactly one Discord guild per org |
| Server | One Rust Console instance; many per org up to plan limit |
| Role map | Discord `role_id` → permission boolean set |
| Membership | Cached/derived from Discord guild roles (not a static staff table) |

- Org **owner** = Discord user who created the org; always full permissions.
- Effective staff permissions = union of all mapped roles the member currently has.
- Re-validate Discord roles on sensitive API calls (cache ≤60s).

## Auth flow

1. “Log in with Discord” → Supabase Auth Discord provider.
2. Session established (Supabase JWT in httpOnly cookie, or exchange into existing HMAC session enriched with `userId` / `orgId`).
3. List orgs where user is owner or has ≥1 mapped staff role in the linked guild.
4. User selects org (+ active server). Cookie/context stores `active_org_id`, `active_server_id`.
5. Create-org flow: name → Stripe checkout (or free trial if configured) → bot invite → bind `guild_id` → add first server → map roles.

Bot invite URL: `bot` + `applications.commands`. On link: one guild ↔ one org. If bot kicked, panel/commands fail closed until re-invited.

### Permissions

Reuse keys from `STAFF_PERMISSIONS` / `OWNER_PERMISSIONS` in `src/modules/admin/access-keys.js`:

`overview`, `players`, `kick`, `ban`, `teleport`, `broadcast`, `rcon`, `stats`, `statsReset`, `warps`, `links`, `automessages`, `schedule`, `kits`, `serverCommands`, `reports`, plus owner-only `keys` (manage role maps), `logs`, and new `servers` (add/edit/remove RCON), `billing`.

Access-key password login is disabled when `SAAS_MODE=true`.

## Data model (Supabase)

```sql
-- Core tables (simplified)

orgs (
  id uuid pk,
  name text not null,
  slug text unique not null,
  owner_discord_id text not null,
  discord_guild_id text unique,
  default_server_id uuid null,
  stripe_customer_id text unique,
  stripe_subscription_id text,
  plan text not null default 'basic', -- basic|pro|network
  plan_status text not null default 'inactive', -- inactive|trialing|active|past_due|canceled
  created_at timestamptz default now()
)

servers (
  id uuid pk,
  org_id uuid not null references orgs on delete cascade,
  name text not null,
  identifier text not null, -- rce.js identifier (= id::text)
  rcon_host text not null,
  rcon_port int not null,
  rcon_password_enc text not null, -- AES-256-GCM ciphertext
  enabled boolean default true,
  created_at timestamptz default now(),
  unique (org_id, name)
)

org_role_permissions (
  id uuid pk,
  org_id uuid not null references orgs on delete cascade,
  discord_role_id text not null,
  permissions jsonb not null, -- { kick: true, ban: false, ... }
  unique (org_id, discord_role_id)
)

-- Optional audit of Discord logins
panel_sessions / use Supabase auth.users

-- Per-server game data stays file-backed in v1, namespaced:
-- DATA_DIR/orgs/{orgId}/servers/{serverId}/*.json
```

### Secrets

- Encrypt RCON passwords with `RCON_ENCRYPTION_KEY` (32-byte key, AES-256-GCM).
- Service role key only on the Railway control plane; never in the browser.
- RLS: authenticated users can read orgs they belong to; mutations for servers/role maps go through Express with service role after permission checks (Discord role validation cannot be done in RLS alone).

## Multi-server RCON & panel UX

- Refactor `src/modules/rcon/client.js` into a pool: `addServer(record)`, `removeServer(id)`, `sendGameCommand(serverId, cmd)`, `getOnlinePlayers(serverId)`.
- On boot (SaaS mode): load all `enabled` servers with `plan_status in (active, trialing)` and attach.
- Panel: org switcher + server switcher in header; all existing API routes take active server from session/header `X-Server-Id`.
- Socket.IO: join room `server:{id}`; emit only that server’s events.
- Discord commands: resolve org by `interaction.guildId`; use `orgs.default_server_id` or a `/server` select command to set a channel/user preference stored in settings JSON under org namespace.

## Stripe

| Plan | Price | Max servers |
|------|-------|-------------|
| Basic | $20/mo | 1 |
| Pro | $49/mo | 5 |
| Network | $99/mo | 15 |

- Checkout Session on org create / upgrade; Customer Portal for cancel/change.
- Webhooks: `checkout.session.completed`, `customer.subscription.updated|deleted` → update `plan`, `plan_status`, `stripe_*`.
- Enforce: refuse `POST /servers` when `count >= plan.max_servers`.
- Past due: keep existing RCON connections for grace window (3 days), block adding servers; after grace, disconnect and read-only panel.

## Discord bot (shared)

- Single `DISCORD_TOKEN` application invited to many guilds.
- Slash commands registered globally (or per-guild on link).
- Permission for Discord slash commands: existing Discord permission checks **plus** org role-map for game-affecting commands when SaaS mode is on.
- Guild-specific channel config moves from global env toward per-org settings (v1: keep env for Astral legacy; SaaS orgs configure channels in panel “Commands” tab scoped to org).

## Astral migration

1. Create org “Astral” with owner = Penumbra Discord id; link current `GUILD_ID`.
2. Insert one server from current `RCON_*` (encrypt password).
3. Map current `ROLE_STAFF_IDS` (and Admin) to full staff permission sets.
4. Copy `.data/*.json` → `.data/orgs/{orgId}/servers/{serverId}/`.
5. Flip `SAAS_MODE=true` after smoke test; retire access-key login.

## Out of v1

- Economy/shop panel, deep website ingest multi-tenant, tickets/giveaways SaaS polish
- Next.js panel rewrite
- White-label themes beyond org display name
- Free forever plan

## Success criteria

- Second community can Discord-login, create org, pay Basic, invite bot, add RCON, map a role, kick a player from panel and Discord.
- One org can add multiple servers on Pro and switch between them in the panel.
- Astral continues to operate on the same deployment.
