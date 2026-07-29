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

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** → `uselyrce`.
2. Variables → copy from `.env.example`. Key prod values:

```env
SAAS_MODE=true
SAAS_MOCK=false
ADMIN_PANEL_URL=https://app.usely.dev
SAAS_BASE_DOMAIN=usely.dev
BRAND_URL=https://usely.dev
RESEND_API_KEY=...        # verify usely.dev as a sending domain in Resend
EMAIL_FROM=Usely <onboarding@usely.dev>
```

3. Custom domains on the Railway service: `app.usely.dev` **and** `*.usely.dev`
   (wildcard — this is what makes `astral.usely.dev` org panels work).
4. Discord OAuth redirect: `https://app.usely.dev/admin/auth/callback`
5. Stripe webhook: `https://app.usely.dev/billing/stripe/webhook`
   (events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`)
6. Supabase → SQL editor → run both files in `supabase/migrations/`.

### DNS at your registrar

| Record | Name | Points to |
| --- | --- | --- |
| A / ALIAS | `usely.dev` | Vercel |
| CNAME | `www` | Vercel |
| CNAME | `app` | Railway |
| CNAME | `*` | Railway |

### Volume (game JSON)

Railway → Volumes → mount path matching `DATA_DIR` (default `/app/.data`).

## After deploy checklist

- [ ] `usely.dev` shows the marketing site (Vercel)
- [ ] `usely.dev/signup` redirects to `app.usely.dev/signup`
- [ ] Buy → setup email arrives → setup page picks a `*.usely.dev` address
- [ ] Owner email login works on their subdomain; staff Discord login works
- [ ] Bot online in Discord; org can add a server and see RCON connected
- [ ] Stripe webhook deliveries succeed
- [ ] Volume mounted on `.data`

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
