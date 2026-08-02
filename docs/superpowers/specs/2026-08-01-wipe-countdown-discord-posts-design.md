# Wipe countdown Discord posts

## Goal

When a wipe time is set, automatically post milestone embeds to Discord so the community sees countdown without opening the panel.

## Behavior

- **Milestones:** `24h`, `1h`, and `wipe` (T≈0 / past).
- **Channel:** `config.channels.wipes`, fallback `config.channels.announcements`. Skip if neither is set.
- **On by default** whenever wipe time + channel exist. No panel toggle in v1.
- **Embed:** reuse `wipeEmbed` with title/body per milestone; include Discord timestamp `<t:unix:F>` and relative `<t:unix:R>`.
- **Dedupe:** store `settings.wipeCountdownPosted = { wipeAt, milestones: string[] }`. Only post a milestone once per wipeAt. Changing wipeAt resets the bag. Clearing wipe clears the bag.
- **Hook:** inside `syncWipeStatus` / the existing 60s `startWipeScheduler` tick in `src/modules/rcon/wipe.js`.
- **Windows:** fire when `remainingMs` crosses under the threshold (e.g. 24h when `0 < remaining <= 24h` and not yet posted). For `wipe`, fire when `past` or `remainingMs <= 0`.
- **Catch-up:** if the bot was down and later sees remaining under 1h without having posted 24h, still post 24h once then 1h (order: check 24h, then 1h, then wipe in one tick if needed — or only fire the tightest missed? Prefer: post every unposted milestone whose threshold has been crossed, oldest first, so a late restart still announces 24h then 1h).

## Non-goals (v1)

- Custom milestone list, @everyone, new channel setting, enable toggle, in-game say for milestones.

## Files

- `src/modules/rcon/wipe.js` — milestone check + send + dedupe
- `src/utils/format.js` — already has `wipeEmbed`
- Changelog entry in `src/server/site/changelog.js`
