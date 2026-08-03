# Go-live ops

Operational checklist for soft launch. Product audits are separate.

## Architecture

| Piece | Host | URL |
| --- | --- | --- |
| Marketing | Vercel | `https://www.usely.dev` |
| App / bot / RCON | Railway (1 replica) | `https://app.usely.dev`, `*.usely.dev` |
| Database | Supabase project **Usely** | `https://iteyedqonfhwrrqtwrxm.supabase.co` |

Do **not** point production at the older shared project `bahxlanmxxcovtpljjyj` (Aces Rust).

## Supabase cutover (Railway)

1. Supabase → project **Usely** → Settings → API.
2. Set on Railway:
   - `SUPABASE_URL=https://iteyedqonfhwrrqtwrxm.supabase.co`
   - `SUPABASE_ANON_KEY=` (anon / publishable)
   - `SUPABASE_SERVICE_ROLE_KEY=` (service_role — never expose to browsers)
3. Redeploy Railway. Confirm `/ops` still lists workspaces.
4. Leave the Aces project alone (game bot data stays there).

## Backups

- **Postgres:** Supabase Dashboard → Database → Backups. On free tier, confirm daily backups are on for your plan. Once: restore a backup into a throwaway branch/project and open `/ops` against it.
- **Railway volume (`.data`):** kits/JSON live on the volume. From Railway shell or volume backup UI, copy `/app/.data` after any risky deploy. Document the restore path you used.

## Rollback

1. Railway → Deployments → open last green deploy → **Redeploy**.
2. Vercel → Deployments → Promote previous production deployment.
3. Keep `numReplicas: 1` in `railway.json` (two replicas = two Discord bots + duplicate RCON).
4. DB migrations are forward-only — never ship a destructive migration without a reverse SQL note in the PR.

## Kill switches (env, then redeploy)

| Variable | Effect |
| --- | --- |
| `MAINTENANCE_MODE=true` | Holding page for panel/signup; `/health`, Stripe, Resend, `/api/status`, `/ops` stay up |
| `MAINTENANCE_MESSAGE=` | Custom holding copy |
| `DISABLE_KITS=true` | Panel kit APIs + `/kit` slash command off |
| `DISABLE_WIPE_SCHEDULER=true` | Wipe countdown auto-run paused |
| `DISABLE_SLASH_COMMANDS=true` | All slash commands reply “disabled” |
| `MAX_RCON_CONNECTIONS=40` | Global WebRCON attach ceiling |
| `ALLOW_STRIPE_TEST=true` | Only if you intentionally use `sk_test_` on Railway |

## Ops alerts

Set at least one:

- `OPS_ALERT_WEBHOOK_URL` — Discord incoming webhook (recommended)
- `OPS_ALERT_EMAIL` — defaults to `SUPPORT_FORWARD_TO` if unset

Fires (deduped) on Discord disconnect, Stripe webhook failure, RCON pool cap, customer RCON down.

Also: `SENTRY_DSN` + Sentry alert rule → your email/phone.

## Status incidents (no redeploy)

```http
POST /api/ops/incident
Cookie: usely_ops=…
{ "message": "WebRCON reconnects delayed — investigating. Next update 15:30 UTC.", "severity": "warning" }

POST /api/ops/incident
{ "clear": true }
```

Or set `STATUS_INCIDENT_MESSAGE` on Railway.

## Owner broadcast

```http
POST /api/ops/broadcast
{ "dryRun": true, "subject": "…", "body": "…" }
POST /api/ops/broadcast
{ "subject": "…", "body": "…" }
```

Skips `@usely.dev` preview addresses.

## External uptime

GitHub Actions workflow `.github/workflows/uptime.yml` pings www + `/health` + `/api/status` every 5 minutes. Optional repo secret `OPS_ALERT_WEBHOOK_URL` posts on failure. Enable Actions on the repo; optionally add Better Stack / UptimeRobot as a second channel.

## Stripe live smoke (required before announce)

1. `STRIPE_SECRET_KEY` starts with `sk_live_`.
2. Webhook `https://app.usely.dev/billing/stripe/webhook` with `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Price IDs match Basic $20 / Pro $49 / Network $99.
4. Buy once yourself → row in `stripe_webhook_events` → org has `stripe_customer_id` → cancel/refund and confirm access drops.

## Soft launch

1. Clear env cutover + alerts + Stripe smoke.
2. Invite 3–5 real owners; no public blast for 48–72h.
3. Watch: Sentry, Railway restarts, Stripe webhook log, contact inbox, `/api/status`, RCON flaps.
4. Day 7: triage leftover Medium/Low audit items with usage data.

## First 48–72h watch

| Signal | Where |
| --- | --- |
| Errors | Sentry + Railway logs |
| Signup → setup email | Resend |
| Stripe webhooks | Stripe Dashboard |
| Discord / RCON | `/status`, ops alerts |
| Support | `SUPPORT_FORWARD_TO` inbox |
