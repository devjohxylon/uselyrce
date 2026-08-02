import { config } from "../config.js";
import { getSettings } from "../data/store.js";
import { getDataContext } from "./data-path.js";

/** Keep in sync with CHANNEL_FIELDS in modules/admin/channel-settings.js */
const CHANNEL_ENV = [
  ["killfeed", "CHANNEL_KILLFEED"],
  ["joinLeave", "CHANNEL_JOIN_LEAVE"],
  ["gameChat", "CHANNEL_GAME_CHAT"],
  ["gameEvents", "CHANNEL_GAME_EVENTS"],
  ["adminLog", "CHANNEL_ADMIN_LOG"],
  ["reports", "CHANNEL_REPORTS"],
  ["tpLog", "CHANNEL_TP_LOG"],
  ["popStatus", "CHANNEL_POP_STATUS"],
  ["wipeStatus", "CHANNEL_WIPE_STATUS"],
  ["modLog", "CHANNEL_MOD_LOG"],
  ["ticketLog", "CHANNEL_TICKET_LOG"],
  ["welcome", "CHANNEL_WELCOME"],
  ["staffAlert", "CHANNEL_STAFF_ALERT"],
  ["leaderboard", "CHANNEL_LEADERBOARD"],
  ["announcements", "CHANNEL_ANNOUNCEMENTS"],
  ["wipes", "CHANNEL_WIPES"],
  ["events", "CHANNEL_EVENTS"],
];

/** @type {Map<string, Record<string, string|null>>} */
const cache = new Map();

function cacheKey() {
  const c = getDataContext();
  if (c?.orgId && c?.serverId) return `${c.orgId}:${c.serverId}`;
  return "legacy";
}

function envDefaults() {
  const out = {};
  for (const [key, env] of CHANNEL_ENV) {
    out[key] = process.env[env]?.trim() || null;
  }
  return out;
}

/** Load namespaced channel map into the per-tenant cache. */
export async function loadTenantChannels() {
  const key = cacheKey();
  const settings = await getSettings();
  const overrides = settings.channels || {};
  const base = key === "legacy" ? { ...config.channels } : envDefaults();
  const merged = { ...base };
  for (const [fieldKey] of CHANNEL_ENV) {
    if (Object.prototype.hasOwnProperty.call(overrides, fieldKey)) {
      merged[fieldKey] = overrides[fieldKey] || null;
    }
  }
  cache.set(key, merged);
  return merged;
}

export function invalidateTenantChannels() {
  cache.delete(cacheKey());
}

/**
 * Resolve a Discord channel id for the active tenant (or legacy global config).
 * Prefer cached namespaced settings; fall back to process config for single-tenant.
 */
export function resolveChannelId(key) {
  const keyName = String(key);
  const cached = cache.get(cacheKey());
  if (cached && Object.prototype.hasOwnProperty.call(cached, keyName)) {
    return cached[keyName] || null;
  }
  return config.channels?.[keyName] || null;
}

export async function ensureTenantChannels() {
  if (!cache.has(cacheKey())) await loadTenantChannels();
  return cache.get(cacheKey()) || {};
}
