# Run Usely 24/7

For **local testing**, see [Local SaaS test](#local-saas-test) below.

## Production architecture

The Discord bot and WebRCON connections must stay online 24/7, so the app
can't run on serverless. Production is split across two hosts:

| Piece | Host | Domain |
| --- | --- | --- |
| Marketing site (home, pricing) | Vercel | `usely.dev`, `www.usely.dev` |
| App: panel, bot, RCON, signup/billing APIs | Railway | `app.usely.dev` + `*.usely.dev` (org panels) |

Repo: https://github.com/devjohxylon/uselyrce

### Vercel (marketing site)

1. [vercel.com](https://vercel.com) → **Add New Project** → import `devjohxylon/uselyrce`.
2. No settings needed — `vercel.json` builds `public/` via `scripts/build-site.js`
   and redirects `/signup`, `/setup`, `/admin`, `/api/*` to `app.usely.dev`.
3. Domains: add `usely.dev` and `www.usely.dev`.

### Railway (app)

`railway.json` already pins the start command, the `/health` check, and
**one replica**. Keep it at one: a second instance would open duplicate WebRCON
sockets and run the Discord bot twice.

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → `uselyrce`.
2. Variables → copy from `.env.example`. The app refuses to boot without these:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
SUPABASE_URL=https://bahxlanmxxcovtpljjyj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # Supabase → Settings → API. Never expose this.
SUPABASE_ANON_KEY=...
RCON_ENCRYPTION_KEY=...         # 32-byte hex; rotating it orphans stored passwords
DISCORD_OAUTH_CLIENT_SECRET=...
```

Then the production values:

```env
SAAS_MODE=true
SAAS_MOCK=false
ADMIN_PANEL_URL=https://app.usely.dev
SAAS_BASE_DOMAIN=usely.dev
BRAND_URL=https://usely.dev
DATA_DIR=/app/.data             # must match the volume mount path below
ADMIN_PANEL_PASSWORD=...        # long random string; not the default
BOT_WEBHOOK_SECRET=...
RESEND_API_KEY=...              # verify usely.dev as a sending domain in Resend
EMAIL_FROM=Usely <onboarding@usely.dev>
SUPPORT_EMAIL=support@inbound.usely.dev
SUPPORT_FORWARD_TO=you@gmail.com   # where contact + inbound mail is delivered
RESEND_WEBHOOK_SECRET=...          # Resend webhook signing secret
# Inbound: Vercel DNS MX on `inbound` → inbound-smtp.us-east-1.amazonaws.com
# Resend Domains → usely.dev → enable Receiving → Webhook
#   URL https://app.usely.dev/api/webhooks/resend  event: email.received
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_NETWORK=price_...
# Access code for the platform ops console at https://app.usely.dev/ops
USELY_OPS_CODE=your-long-secret-code
```

Stripe keys aren't enforced at boot, but `/signup` can't take payment without
them, so signup stays broken until they're set.

3. Custom domains on the Railway service: `app.usely.dev` **and** `*.usely.dev`
   (wildcard — this is what makes `astral.usely.dev` org panels work).
4. Discord Developer Portal (the **bot** application matching `DISCORD_CLIENT_ID`):
   - Bot → enable **Public Bot** (required so customers can invite it)
   - Bot → Privileged Gateway Intents: Message Content + Server Members
   - OAuth2 → Redirects:
     - `https://app.usely.dev/admin/auth/callback` (staff Discord login — may use `DISCORD_OAUTH_CLIENT_ID` app instead)
     - `https://app.usely.dev/admin/auth/bot-installed` (optional auto-link after bot invite)
5. Customers invite from **Workspace → Servers → Invite Discord bot**, then Link guild.
5. Stripe webhook: `https://app.usely.dev/billing/stripe/webhook`
   (events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`)
6. Supabase migrations: **already applied** to project `bahxlanmxxcovtpljjyj`
   (`saas_core`, `accounts`, `drop_owner_select_policies`). Only re-run
   `supabase/migrations/` against a fresh project.

### DNS at your registrar

| Record | Name | Points to |
| --- | --- | --- |
| A / ALIAS | `usely.dev` | Vercel |
| CNAME | `www` | Vercel |
| CNAME | `app` | Railway |
| CNAME | `*` | Railway |

### Volume (game JSON)

Kits, links, and scheduled commands are JSON on disk, and Railway's filesystem is
wiped on every redeploy. Add a volume before taking real customers:

Railway → service → **Volumes** → mount at `/app/.data`, then set
`DATA_DIR=/app/.data`. The app logs a loud persistence warning at boot if it
detects Railway without a volume on the data directory.

## After deploy checklist

- [ ] `usely.dev` shows the marketing site (Vercel)
- [ ] `usely.dev/signup` redirects to `app.usely.dev/signup`
- [ ] `app.usely.dev/health` returns `{"ok":true,"discordReady":true}`
- [ ] `usely.dev/status` shows all three components operational
- [ ] Buy → setup email arrives → setup page picks a `*.usely.dev` address
- [ ] Owner email login works on their subdomain; staff Discord login works
- [ ] Bot online in Discord; org can add a server and see RCON connected
- [ ] Stripe webhook deliveries succeed
- [ ] Volume mounted on `.data` and `DATA_DIR` points at it
- [ ] `USELY_OPS_CODE` set; `app.usely.dev/ops` unlocks with that code
- [ ] Google Search Console: submit `https://www.usely.dev/sitemap.xml`

## Local SaaS test

Fastest path — mock mode fakes Supabase, Stripe, OAuth, and email:

```env
SAAS_MODE=true
SAAS_MOCK=true
```

Then `npm.cmd run dev` → http://localhost:3847/signup. Mock "emails" land in
`.data/mock-outbox.json`, and org panels live at `<slug>.localhost:3847`.

For a real-backend local test instead, set `SAAS_MOCK=false` and fill in
Supabase, `RCON_ENCRYPTION_KEY`, and Discord OAuth secrets per `.env.example`,
plus the Discord redirect `http://localhost:3847/admin/auth/callback`.
Stripe can stay empty until you set price IDs; checkout will fail gracefully.

## Slash command updates

```powershell
npm.cmd run register-commands
```

## Seed first org (optional)

```powershell
$env:ASTRAL_OWNER_DISCORD_ID="your_discord_user_id"
npm.cmd run seed:astral-org
```

That seeds an **org named Astral** (a customer server), not the product brand.
