# Ops org detail + live probes

Date: 2026-08-01  
Status: approved

## Goal

Platform ops at `/ops` becomes a support console: click an org → dedicated page with live health probes and safe repair actions. No password edits, no manual plan overrides, no acting as the customer in billing.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/ops` | Org list (existing) |
| GET | `/ops/orgs/:slug` | Org detail HTML |
| GET | `/api/ops/orgs/:slug` | Org + servers + health |
| POST | `/api/ops/orgs/:slug/fix` | Safe repair action |

Auth: existing `USELY_OPS_CODE` cookie (`requireOps`). Same gate as `/ops`.

## Health checklist

| id | OK when |
|----|---------|
| `plan` | `plan_status` is `active` or `trialing` |
| `billing` | If plan is not `inactive`/`canceled`, Stripe customer + subscription IDs present; otherwise informational |
| `guild` | `discord_guild_id` set |
| `bot` | Bot can see that guild (skip/warn if no Discord client) |
| `servers` | At least one server row |
| `rcon` | Every **enabled** server is attached and connected in the RCON pool |

Overall:

- `ok` — all checks pass
- `degraded` — any non-critical fail (billing IDs missing, bot unknown, some RCON down)
- `down` — no servers, or all enabled RCON disconnected, or plan `past_due`/`unpaid` with no connectivity

Never return `rcon_password_enc` or decrypted secrets. Public fields only: host, port, `hasPassword`, pool status.

## Repair actions (`POST .../fix`)

Body: `{ "action": string, "serverId"?: string, "guildId"?: string }`

| action | Behavior |
|--------|----------|
| `reconnect_rcon` | Requires `serverId`. Detach + re-attach from stored credentials. |
| `reconnect_all_rcon` | Same for every enabled server in the org. |
| `refresh_stripe` | Retrieve subscription from Stripe; update org `plan` / `plan_status` (and related IDs if needed). |
| `clear_guild` | Set `discord_guild_id` to null. |
| `relink_guild` | Requires `guildId`. Set only if bot is in that guild. |
| (UI only) Open panel | Link to existing `orgPanelUrl` — no API. |

Response: `{ ok, action, result?, health?, org?, servers?, error? }` — re-run probes after successful fix when practical.

## Mock (`USELY_OPS_MOCK=true`)

- Detail available for the five sample orgs in `mock-orgs.js` (extend with servers + initial health).
- Probes return scripted healthy/broken mixes.
- Fix actions mutate in-memory mock state for the process lifetime (or file if already used) so the UI updates; no Supabase/Stripe/Discord calls.

## UI

**List (`/ops`)**: row name/slug (or whole row) links to `/ops/orgs/:slug`.

**Detail (`/ops/orgs/:slug`)**:

- Header: name, slug, plan/status pills, overall health, Back, Lock
- Mock banner when mock
- Checklist with ok/warn/fail + detail text
- Server table: name, host:port, enabled, RCON status, Reconnect
- Actions: Refresh Stripe, Clear guild, Relink guild (input + button), Open panel

Visual language: match existing ops amber/platform console look — not the game admin panel.

## Out of scope (v1)

- Editing RCON passwords / hosts
- Changing plan by hand
- Impersonating owner session
- Stripe Customer Portal as the customer
- Schema migrations

## Files

- `src/saas/ops/routes.js` — detail + fix APIs + HTML route
- `src/saas/ops/ops.html` — list links
- `src/saas/ops/org.html` — new detail page (or single SPA; prefer dedicated HTML for clarity)
- `src/saas/ops/mock-orgs.js` — richer mock detail + fix simulation
- `src/saas/ops/health.js` — probe + overall scoring (new)
- `src/saas/db/orgs.js` / `servers.js` — get-by-slug for ops if missing
- `src/saas/rcon/pool.js` / RCON attach helpers — reconnect
- `src/saas/billing/stripe.js` — thin sync helper if missing
- `.env.example` — no new vars required
