# Aces → Usely full parity

**Date:** 2026-08-01  
**Status:** Approved  
**Constraint:** Do not modify Aces Bot. Port behavior into Usely only. Keep multi-tenant RCON, SaaS tabs, and `/demo`.

## Goal

Bring Usely’s bot + admin backends up to Aces’ current panel/bot behavior. Usely’s panel UI is largely already ported; wire the missing modules and APIs it already expects.

## In scope

1. VIP claims (quick-chat, once-per-wipe, post-wipe lock, wipe reset)
2. Server kit CRUD APIs + kits.js resync/edit/delete
3. Feeds wired to feed-settings (compact kill, filters, kit redeem embeds, dedupe)
4. Links Discord display-name enrichment
5. Stats Discord UX (panel + PNG card + `/stats` subcommands + button)
6. Offline linking default + panel copy
7. Discord leaderboard image publish wiring + pushstats
8. Pop channel naming via status-settings
9. Wipe soft-skip for missing kit-cooldown RCON
10. Rebrand Astral → Usely in newly ported strings
11. Demo fixtures / changelog for customer-visible pieces

## Out of scope

- Any edit under Aces Bot
- Replacing Usely SaaS (org/server pool, billing, demo auth)
- Blind file overwrite of `client.js` / panel SaaS tabs

## Multi-tenant rules

- Persist VIP claims / kit caches under Usely’s existing DATA_DIR / per-server namespacing
- All RCON through Usely `serverId`-aware client/pool
- Update demo fixtures when new API shapes appear

## Success

Panel kit edit, VIP claim settings, Links names, and feed toggles work. Discord claim + `/stats me` + image leaderboard work. Wipe resets VIP claims and soft-skips missing kit cooldown.
