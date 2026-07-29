# Usely SaaS Multi-tenant — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SaaS foundation: Supabase schema, encrypted server registry, multi-server RCON pool, Discord OAuth session path, org/server context in the panel API, and Stripe plan gating — behind `SAAS_MODE` so Astral keeps working.

**Architecture:** Evolve the existing Express + discord.js + rce.js process. Supabase stores orgs/servers/role maps/billing. Game JSON stays file-backed but namespaced by org/server when SaaS mode is on.

**Tech Stack:** Node 18+, Express, discord.js, rce.js, `@supabase/supabase-js`, Stripe, AES-256-GCM for RCON secrets.

**Spec:** [docs/superpowers/specs/2026-07-28-saas-multitenant-design.md](../specs/2026-07-28-saas-multitenant-design.md)

## Global Constraints

- Do not break legacy mode: when `SAAS_MODE` is unset/false, behavior matches today (env RCON, access-key login).
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or RCON passwords to the browser.
- Permission keys must stay compatible with `STAFF_PERMISSIONS` / `OWNER_PERMISSIONS` in `src/modules/admin/access-keys.js`.
- Stripe prices: Basic $20/1 server, Pro $49/5, Network $99/15.

## File structure (new / touched)

| Path | Responsibility |
|------|----------------|
| `supabase/migrations/20260728000000_saas_core.sql` | orgs, servers, org_role_permissions |
| `src/saas/crypto.js` | AES-256-GCM encrypt/decrypt for RCON passwords |
| `src/saas/db/client.js` | Supabase service client |
| `src/saas/db/orgs.js` | Org CRUD + guild lookup |
| `src/saas/db/servers.js` | Server CRUD + decrypt for pool |
| `src/saas/db/roles.js` | Role → permission maps |
| `src/saas/auth/discord-session.js` | Resolve Discord user + org membership + effective perms |
| `src/saas/auth/middleware.js` | `requireSaasSession` / legacy fallback |
| `src/saas/billing/plans.js` | Plan limits |
| `src/saas/billing/stripe.js` | Checkout, portal, webhook handlers |
| `src/saas/rcon/pool.js` | Multi-server wrap around rce.js manager |
| `src/saas/data-path.js` | Resolve `DATA_DIR/orgs/.../servers/...` |
| `src/config.js` | `saasMode`, Supabase, Stripe, encryption key |
| `src/modules/rcon/client.js` | Delegate to pool when SaaS; keep legacy API |
| `src/server/admin/api.js` | OAuth routes, org/server switcher, SaaS auth |
| `src/server/admin/panel.html` | Login with Discord + org/server switchers |
| `.env.example` | New env vars |

---

### Task 1: Config + crypto + Supabase client

**Files:**
- Modify: `src/config.js`, `.env.example`
- Create: `src/saas/crypto.js`, `src/saas/db/client.js`

- [ ] **Step 1:** Add to `config.js`:

```js
saas: {
  enabled: parseBool("SAAS_MODE", false),
  supabaseUrl: optional("SUPABASE_URL"),
  supabaseServiceKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseAnonKey: optional("SUPABASE_ANON_KEY"),
  rconEncryptionKey: optional("RCON_ENCRYPTION_KEY"),
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePriceBasic: optional("STRIPE_PRICE_BASIC"),
  stripePricePro: optional("STRIPE_PRICE_PRO"),
  stripePriceNetwork: optional("STRIPE_PRICE_NETWORK"),
  publicUrl: optional("ADMIN_PANEL_URL") || "http://localhost:3847",
},
```

When `saas.enabled`, require Supabase URL + service key + encryption key at boot (throw clear error).

- [ ] **Step 2:** Implement `src/saas/crypto.js` with `encryptSecret(plain)` / `decryptSecret(payload)` using AES-256-GCM; key = 32 bytes from base64 `RCON_ENCRYPTION_KEY`.

- [ ] **Step 3:** Implement `src/saas/db/client.js` exporting `getServiceClient()` (singleton `@supabase/supabase-js` createClient with service role).

- [ ] **Step 4:** Update `.env.example` with the new vars and a one-line comment that SaaS is opt-in via `SAAS_MODE=true`.

- [ ] **Step 5:** `npm install @supabase/supabase-js stripe` and commit.

---

### Task 2: Database migration

**Files:**
- Create: `supabase/migrations/20260728000000_saas_core.sql`

- [ ] **Step 1:** Write SQL creating `orgs`, `servers`, `org_role_permissions` per the design spec (uuid PKs, FKs, unique guild_id, indexes on `org_id`).

- [ ] **Step 2:** Enable RLS; policies: deny all for `anon`; `authenticated` select orgs where `owner_discord_id = (auth.jwt() ->> 'user_metadata' ->> 'provider_id')` OR later membership helper — document that Express uses service role for writes after Discord role checks.

- [ ] **Step 3:** Apply migration to the linked Supabase project (CLI or dashboard). Verify tables exist.

---

### Task 3: Org / server / role data access

**Files:**
- Create: `src/saas/db/orgs.js`, `src/saas/db/servers.js`, `src/saas/db/roles.js`, `src/saas/billing/plans.js`

- [ ] **Step 1:** `plans.js` — `PLAN_LIMITS = { basic: 1, pro: 5, network: 15 }`, `maxServers(plan)`, `assertCanAddServer(org)`.

- [ ] **Step 2:** `orgs.js` — `createOrg`, `getOrg`, `getOrgByGuildId`, `listOrgsForDiscordUser`, `setGuild`, `setDefaultServer`, `updateStripe`.

- [ ] **Step 3:** `servers.js` — `listServers(orgId)`, `createServer` (encrypt password, enforce plan limit), `updateServer`, `deleteServer`, `listAllEnabledForPool()` returning decrypted credentials for boot.

- [ ] **Step 4:** `roles.js` — `listRoleMaps`, `upsertRoleMap`, `deleteRoleMap`, `permissionsForMember(orgId, memberRoleIds)` → union + sanitize via existing `sanitizeStaffPerms` pattern.

---

### Task 4: Multi-server RCON pool

**Files:**
- Create: `src/saas/rcon/pool.js`
- Modify: `src/modules/rcon/client.js`

- [ ] **Step 1:** Implement pool with one `RCEManager`, map `serverId → connection state`, methods: `startPool(servers)`, `attachServer`, `detachServer`, `sendCommand(serverId, cmd)`, `getPlayers(serverId)`, `getInfo(serverId)`, `getStatus(serverId)`, watchdog per server.

- [ ] **Step 2:** In `client.js`, if `!config.saas.enabled`, keep current single-server behavior. If SaaS, export the same function names but require `serverId` from AsyncLocalStorage or explicit arg; provide `runWithServer(serverId, fn)` context helper so existing call sites can migrate gradually.

- [ ] **Step 3:** On bot ready in SaaS mode, `listAllEnabledForPool()` → `startPool`.

- [ ] **Step 4:** Manual test: with two mock/disabled servers in DB, pool starts without crashing; legacy mode still connects via env.

---

### Task 5: Discord OAuth session + permission resolve

**Files:**
- Create: `src/saas/auth/discord-session.js`, `src/saas/auth/middleware.js`
- Modify: `src/server/admin/api.js`, `src/modules/admin/access-keys.js` (export sanitize helpers if needed)

- [ ] **Step 1:** Add routes `GET /admin/auth/discord`, `GET /admin/auth/callback` using Supabase OAuth (or Discord OAuth code exchange with Supabase). Set httpOnly session cookie containing `discordUserId` + expiry (HMAC or Supabase access token).

- [ ] **Step 2:** `resolveSaasSession(req, discordClient)`:
  - Load user from cookie
  - Resolve `active_org_id` from cookie/query
  - Fetch guild member roles via Discord API
  - If owner → `OWNER_PERMISSIONS` + `servers` + `billing`
  - Else union role maps; if empty → deny
  - Attach `serverId` from cookie/`X-Server-Id` validated against org

- [ ] **Step 3:** Middleware: if SaaS mode, use SaaS session; else existing `resolveSession`.

- [ ] **Step 4:** Panel login UI: show Discord button when SaaS; hide password form (or keep only when legacy).

---

### Task 6: Org/server management API + panel switchers

**Files:**
- Modify: `src/server/admin/api.js`, `src/server/admin/panel.html`

- [ ] **Step 1:** API routes (SaaS only):  
  `GET /admin/api/orgs`, `POST /admin/api/orgs`,  
  `POST /admin/api/orgs/:id/guild`,  
  `GET/POST/PATCH/DELETE /admin/api/servers`,  
  `GET/PUT/DELETE /admin/api/role-maps`,  
  `POST /admin/api/context` (set active org/server).

- [ ] **Step 2:** Panel header: org dropdown + server dropdown; persist via `/admin/api/context`.

- [ ] **Step 3:** Wire existing status/players/rcon routes to active `serverId` in SaaS mode.

---

### Task 7: Stripe checkout + webhooks

**Files:**
- Create: `src/saas/billing/stripe.js`
- Modify: `src/server/webhook.js` or admin api for webhook path

- [ ] **Step 1:** `createCheckoutSession(org, plan)`, `createPortalSession(org)`.

- [ ] **Step 2:** `POST /billing/stripe/webhook` — update org plan fields; on cancel/inactive schedule pool detach.

- [ ] **Step 3:** Gate `createServer` with `assertCanAddServer`.

- [ ] **Step 4:** Panel Billing tab (owner only): plan name, upgrade CTA, manage subscription.

---

### Task 8: Namespaced data paths + Astral seed script

**Files:**
- Create: `src/saas/data-path.js`, `scripts/seed-astral-org.js`
- Modify: `src/data/store.js` (optional thin wrapper when context set)

- [ ] **Step 1:** `dataPath(orgId, serverId, file)` → `.data/orgs/{orgId}/servers/{serverId}/{file}`.

- [ ] **Step 2:** Seed script: create Astral org, one server from env, role maps from `ROLE_STAFF_IDS`, copy JSON files into namespace.

- [ ] **Step 3:** Document cutover steps in `DEPLOY.md` (short SaaS section).

---

## Phase 2 (separate plan later)

- Per-org Discord channel config in DB
- Global slash command guild scoping polish
- Migrate remaining JSON stores fully into Postgres
- Marketing site / signup funnel on Vercel

## Done when

- [ ] `SAAS_MODE=false` smoke: bot + panel + RCON unchanged
- [ ] `SAAS_MODE=true` with seeded org: Discord login, role-gated panel, server switcher, Stripe test checkout, second server on Pro
