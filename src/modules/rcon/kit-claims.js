import { getSettings, saveSettings, getKitClaimCooldowns, saveKitClaimCooldowns } from "../../data/store.js";
import { getDataContext } from "../../saas/data-path.js";
import { config } from "../../config.js";
import { getLinkByIgn } from "./linking.js";
import { giveKit, listKits } from "./kits.js";
import { sendGameCommand, isRconEnabled } from "./client.js";
import { normalizeQuickChat } from "./vip-sync.js";
import { getOrg } from "../../saas/db/orgs.js";
import { getServerOrgId, getActiveServerId } from "../../saas/rcon/pool.js";

let discordClient = null;

export function attachKitClaimClient(client) {
  discordClient = client;
}

function normalizePhrase(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseList(raw) {
  return String(raw ?? "")
    .split("|")
    .map((s) => normalizePhrase(s))
    .filter(Boolean);
}

function normalizeKitId(id) {
  return String(id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32);
}

export async function getKitLocks() {
  const settings = await getSettings();
  const raw = settings.kitLocks && typeof settings.kitLocks === "object" ? settings.kitLocks : {};
  const kitIds = Array.isArray(raw.kitIds)
    ? [...new Set(raw.kitIds.map(normalizeKitId).filter(Boolean))]
    : [];
  let until = raw.until ? String(raw.until) : null;
  if (until && Number.isNaN(Date.parse(until))) until = null;
  let enabled = Boolean(raw.enabled);
  if (enabled && until && Date.parse(until) <= Date.now()) {
    enabled = false;
    const next = { enabled: false, until, kitIds };
    settings.kitLocks = next;
    await saveSettings(settings);
    return next;
  }
  return { enabled, until, kitIds };
}

export async function saveKitLocks(patch = {}) {
  const current = await getKitLocks();
  const next = {
    enabled: patch.enabled != null ? Boolean(patch.enabled) : current.enabled,
    until:
      patch.until === null || patch.until === ""
        ? null
        : patch.until != null
          ? String(patch.until)
          : current.until,
    kitIds: Array.isArray(patch.kitIds)
      ? [...new Set(patch.kitIds.map(normalizeKitId).filter(Boolean))]
      : current.kitIds,
  };
  if (next.until && Number.isNaN(Date.parse(next.until))) {
    return { ok: false, error: "Invalid until timestamp" };
  }
  if (next.enabled && next.until && Date.parse(next.until) <= Date.now()) {
    next.until = null;
  }
  const settings = await getSettings();
  settings.kitLocks = next;
  await saveSettings(settings);
  return { ok: true, kitLocks: next };
}

export async function isKitClaimLocked(kitId) {
  const locks = await getKitLocks();
  if (!locks.enabled) return false;
  return locks.kitIds.includes(normalizeKitId(kitId));
}

function claimKey(ign, kitId) {
  return `${String(ign).trim().toLowerCase()}::${normalizeKitId(kitId)}`;
}

async function getClaimCooldownRemaining(ign, kitId, cooldownMinutes) {
  const mins = Math.max(0, Number(cooldownMinutes) || 0);
  if (!mins) return 0;
  const data = await getKitClaimCooldowns();
  const at = data.claims?.[claimKey(ign, kitId)];
  if (!at) return 0;
  const elapsed = Date.now() - Date.parse(at);
  if (!Number.isFinite(elapsed)) return 0;
  const left = mins * 60_000 - elapsed;
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

async function recordClaimCooldown(ign, kitId) {
  const data = await getKitClaimCooldowns();
  data.claims = data.claims || {};
  data.claims[claimKey(ign, kitId)] = new Date().toISOString();
  await saveKitClaimCooldowns(data);
}

async function sayToServer(line) {
  if (!isRconEnabled()) return;
  const safe = String(line).replace(/"/g, "").slice(0, 180);
  await sendGameCommand(`say ${safe}`).catch(() => {});
}

function formatCooldown(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 1) return `${m}m`;
  return `${Math.max(1, s)}s`;
}

async function resolveGuildId() {
  const ctx = getDataContext();
  if (ctx?.orgId) {
    const org = await getOrg(ctx.orgId).catch(() => null);
    if (org?.discord_guild_id) return org.discord_guild_id;
  }
  const serverId = getActiveServerId();
  if (serverId) {
    const orgId = getServerOrgId(serverId);
    if (orgId) {
      const org = await getOrg(orgId).catch(() => null);
      if (org?.discord_guild_id) return org.discord_guild_id;
    }
  }
  return config.discord.guildId || null;
}

async function playerHasRole(ign, roleId) {
  if (!roleId) return { ok: true };
  if (!discordClient) return { ok: false, reason: "no_bot" };
  const link = await getLinkByIgn(ign);
  if (!link?.discordId) return { ok: false, reason: "not_linked" };
  const guildId = await resolveGuildId();
  const guild = guildId
    ? await discordClient.guilds.fetch(guildId).catch(() => null)
    : discordClient.guilds.cache.first() || null;
  if (!guild) return { ok: false, reason: "no_guild" };
  const member = await guild.members.fetch(link.discordId).catch(() => null);
  if (!member) return { ok: false, reason: "not_in_guild" };
  if (!member.roles.cache.has(String(roleId))) return { ok: false, reason: "missing_role" };
  return { ok: true, discordId: link.discordId };
}

/**
 * Match quick chat to a panel kit claim phrase and grant if allowed.
 * Call after VIP claim handler (VIP phrases take priority when both run).
 */
export async function tryClaimKitFromQuickChat({ player, message } = {}) {
  const text = normalizeQuickChat(message);
  if (!text) return null;

  const kits = await listKits();
  const matches = kits.filter((k) => {
    const phrases = phraseList(k.claimPhrase);
    if (!phrases.length) return false;
    return phrases.some((p) => text === p || text.includes(p));
  });
  if (!matches.length) return null;

  matches.sort((a, b) => {
    const la = Math.max(...phraseList(a.claimPhrase).map((p) => p.length));
    const lb = Math.max(...phraseList(b.claimPhrase).map((p) => p.length));
    return lb - la;
  });
  const kit = matches[0];
  const ign = String(player?.ign || player?.name || "").trim();
  if (!ign) return { ok: false, error: "Unknown player" };

  if (await isKitClaimLocked(kit.id)) {
    await sayToServer(
      `<color=#e8c06a>${ign}</color> — <color=#e8c06a>${kit.label || kit.id}</color> is locked right now`,
    );
    return { ok: false, error: "Kit locked", ign, kitId: kit.id };
  }

  if (kit.claimRoleId) {
    const roleCheck = await playerHasRole(ign, kit.claimRoleId);
    if (!roleCheck.ok) {
      if (roleCheck.reason === "not_linked") {
        await sayToServer(
          `<color=#ff6b73>${ign}</color> — link Discord first (/link) to claim this kit`,
        );
      } else {
        await sayToServer(
          `<color=#ff6b73>${ign}</color> — you need the required Discord role for <color=#ff6b73>${kit.label || kit.id}</color>`,
        );
      }
      return { ok: false, error: roleCheck.reason, ign, kitId: kit.id };
    }
  }

  const cdLeft = await getClaimCooldownRemaining(ign, kit.id, kit.cooldownMinutes);
  if (cdLeft > 0) {
    await sayToServer(
      `<color=#e8c06a>${ign}</color> — <color=#e8c06a>${kit.label || kit.id}</color> ready in ${formatCooldown(cdLeft)}`,
    );
    return { ok: false, error: "Cooldown", ign, kitId: kit.id, leftSeconds: cdLeft };
  }

  const result = await giveKit(ign, kit.id, { bypassCooldown: true, source: "panel" });
  if (!result.ok) {
    await sayToServer(
      `<color=#ff6b73>${ign}</color> — kit claim failed (${result.error || "error"})`,
    );
    return { ...result, ign, kitId: kit.id };
  }

  if (kit.cooldownMinutes > 0) {
    await recordClaimCooldown(ign, kit.id);
  }

  await sayToServer(
    `<color=#7dcea0>${ign}</color> claimed <color=#7dcea0>${kit.label || kit.id}</color>`,
  );
  return { ok: true, ign, kitId: kit.id, ...result };
}

/** Expire locks whose until time has passed (safe to call on an interval). */
export async function tickKitLocks() {
  await getKitLocks();
}
