# Support runbook (beta)

Target: reply within **24–48 hours**. Be honest that Usely is in public beta.

## RCON won’t connect

1. Confirm host:port is the **WebRCON** endpoint (not game query port).
2. Panel → **Workspace → Setup** — password saved? Encryption key must not have rotated.
3. Game server online? Firewall allowlist Railway egress if they lock IPs.
4. `/status` WebRCON: “retrying” vs “no servers”.
5. Ops → org → **Reconnect RCON**.
6. If only one customer: their host. If many: platform incident + status post.

**Canned:** “WebRCON needs the console RCON host/port/password from your host panel. After saving under Workspace → Setup, wait ~30s for the green connected state. If it stays red, reply with your panel address (e.g. `myserver.usely.dev`) and a screenshot of Setup — we’ll check from our side.”

## Didn’t get verification / setup email

1. Spam folder; from-domain `usely.dev` via Resend.
2. Ops → **Test email** to their address.
3. Resend dashboard delivery log.
4. Ops → **Free setup preview** only for recovery you control — prefer resend-setup on login.
5. Confirm `RESEND_API_KEY` / `EMAIL_FROM` on Railway.

**Canned:** “Setup mail comes from our `usely.dev` address — check spam. If nothing in 10 minutes, reply here and we’ll send a fresh setup link.”

## Payment failed / paid but no access

1. Stripe Dashboard → customer / payment + **Webhooks** (must be 2xx).
2. `stripe_webhook_events` should gain a row; org should get `stripe_customer_id`.
3. If paid + no webhook: replay event in Stripe; page yourself via ops alert.
4. Never manually set `plan_status=active` without a Stripe customer unless ops preview.

**Canned:** “Sorry — checking Stripe now. If the charge succeeded we’ll unlock access within the hour and email your setup link again.”

## How do I cancel?

1. Panel → Billing → Stripe Customer Portal (or link we email).
2. Access continues through the paid period; then `canceled` / detach RCON.
3. Refunds: case-by-case in beta (see Terms).

**Canned:** “Open Billing in your panel and use Manage subscription to cancel. You’ll keep access through the period you’ve already paid. Need a refund? Reply with the email you used at checkout.”

## Staff access key not working

1. Key is for **staff Discord login**, not owner email password.
2. Owner generates keys under Workspace → staff / access keys; unused or revoked keys fail.
3. Staff must use Discord OAuth on the org subdomain.
4. Permissions: kick-only keys can’t open ban UI.

**Canned:** “Staff keys work with Discord sign-in on your panel URL (not the owner email login). Ask the owner to create a fresh key under Workspace and make sure Discord is linked. If it still fails, send the panel address and whether you’re the owner or staff.”

## Incident posts (status page)

Be specific: what broke, who is affected, workaround, next update time.

Ops: `POST /api/ops/incident` with `{ "message": "…", "severity": "warning"|"critical" }`. Clear with `{ "clear": true }`.

## Bulk notice

`POST /api/ops/broadcast` with `dryRun: true` first, then send. Prefer status + broadcast for breaking changes.
