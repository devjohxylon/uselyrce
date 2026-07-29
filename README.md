# Usely

**Usely** (`usely.dev`) is a multi-tenant Discord + WebRCON admin panel for Rust Console Edition servers.

Communities (e.g. Astral, Aces) sign in with Discord, invite the shared bot, add one or more Nitrado WebRCON servers, map staff roles to permissions, and manage players from the web panel.

## Stack

- Node.js + Express admin panel + Socket.IO
- discord.js bot (shared across guilds)
- `rce.js` WebRCON (multi-server pool)
- Supabase (orgs / servers / role maps)
- Stripe (Basic $20 / Pro $49 / Network $99)

## Quick start (local)

```powershell
copy .env.example .env
# fill DISCORD_* and optionally RCON_*
npm.cmd install
npm.cmd run dev
```

Panel: http://localhost:3847/admin

Legacy mode (`SAAS_MODE=false`): access-key login.  
SaaS mode (`SAAS_MODE=true`): Discord OAuth — see [DEPLOY.md](DEPLOY.md).

## Docs

- [DEPLOY.md](DEPLOY.md) — local + Railway
- [docs/superpowers/specs/2026-07-28-saas-multitenant-design.md](docs/superpowers/specs/2026-07-28-saas-multitenant-design.md)
