# Kit claim phrases + Kit locks

**Date:** 2026-08-02

## Goal

Let servers claim panel kits via Usely quick chat (custom phrase + optional Discord role), and pause a saved list of those kits with one master switch (optional auto-end) for wipe-day boom locks — without deleting KitManager kits.

## Behavior

- Panel kits store `claimPhrase` and `claimRoleId`.
- Quick chat → VIP handler first → then kit claim matcher → lock / role / cooldown checks → `giveKit`.
- `settings.kitLocks`: `{ enabled, until, kitIds }`. Selection persists when toggled off.
- Staff panel Give is not blocked by locks.
- Cooldowns tracked in `kit-claim-cooldowns.json` per IGN+kit.

## Out of scope

Native KitManager UI redemption (not Usely-gated). VIP claim path unchanged.
