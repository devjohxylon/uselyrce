import { getOnlinePlayers, getRconStatus, sendGameCommand } from "./client.js";
import { runWithServer } from "../../saas/rcon/pool.js";
import { config } from "../../config.js";

/** @type {Map<string, Map<string, { x: number, y: number, z: number, at: number, ign: string }>>} */
const positionsByServer = new Map();
/** serverIds currently watched by at least one map tab */
const watchers = new Map(); // serverId -> count
let pollTimer = null;
let polling = false;

const POLL_MS = 5_000;
const STALE_MS = 30_000;
const DEFAULT_SERVER = "default";

function serverKey(serverId) {
  return String(serverId || config.rcon?.identifier || DEFAULT_SERVER);
}

function bucket(serverId) {
  const key = serverKey(serverId);
  if (!positionsByServer.has(key)) positionsByServer.set(key, new Map());
  return positionsByServer.get(key);
}

function parsePosition(raw) {
  if (!raw) return null;
  const text = String(raw);
  const match = text.match(
    /\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/,
  );
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
  };
}

export async function fetchPlayerPosition(ign, serverId) {
  const name = String(ign ?? "").trim();
  if (!name) return null;

  const commands = [`server.printpos "${name}"`, `printpos "${name}"`];
  const run = async () => {
    for (const cmd of commands) {
      try {
        const raw = await sendGameCommand(cmd, serverId);
        const pos = parsePosition(raw);
        if (pos) {
          bucket(serverId).set(name.toLowerCase(), {
            ...pos,
            ign: name,
            at: Date.now(),
          });
          return pos;
        }
      } catch {
        /* try next */
      }
    }
    return null;
  };

  if (config.saas?.enabled && serverId) {
    return runWithServer(serverId, run);
  }
  return run();
}

async function pollServer(serverId) {
  const run = async () => {
    if (!getRconStatus(serverId).enabled) return;
    const online = getOnlinePlayers(serverId);
    const map = bucket(serverId);
    const onlineKeys = new Set(online.map((p) => p.ign.toLowerCase()));
    for (const key of [...map.keys()]) {
      if (!onlineKeys.has(key)) map.delete(key);
    }
    for (const player of online) {
      await fetchPlayerPosition(player.ign, serverId).catch(() => null);
    }
  };
  if (config.saas?.enabled) return runWithServer(serverId, run);
  return run();
}

async function pollOnce() {
  if (polling || watchers.size === 0) return;
  polling = true;
  try {
    for (const serverId of watchers.keys()) {
      await pollServer(serverId).catch(() => null);
    }
  } finally {
    polling = false;
  }
}

function ensurePollTimer() {
  if (pollTimer || watchers.size === 0) return;
  pollTimer = setInterval(() => pollOnce().catch(() => {}), POLL_MS);
  pollOnce().catch(() => {});
}

function stopPollTimerIfIdle() {
  if (watchers.size > 0 || !pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

/** Panel map tab open — start RCON position polling for this server. */
export function watchMapServer(serverId) {
  const key = serverKey(serverId);
  watchers.set(key, (watchers.get(key) || 0) + 1);
  ensurePollTimer();
}

export function unwatchMapServer(serverId) {
  const key = serverKey(serverId);
  const n = (watchers.get(key) || 0) - 1;
  if (n <= 0) watchers.delete(key);
  else watchers.set(key, n);
  stopPollTimerIfIdle();
}

export function mapWatcherCount() {
  return [...watchers.values()].reduce((a, b) => a + b, 0);
}

/** Legacy boot hook — no longer polls until a map tab watches. */
export function startPositionPolling() {
  console.log("Live map position polling idle until a map tab opens");
}

export function stopPositionPolling() {
  watchers.clear();
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function getCachedPositions(serverId) {
  const now = Date.now();
  const out = [];
  for (const entry of bucket(serverId).values()) {
    if (now - entry.at > STALE_MS) continue;
    out.push({
      ign: entry.ign,
      coords: { x: entry.x, y: entry.y, z: entry.z },
      updatedAt: new Date(entry.at).toISOString(),
    });
  }
  return out;
}

export function getPositionFor(ign, serverId) {
  const entry = bucket(serverId).get(String(ign ?? "").toLowerCase());
  if (!entry || Date.now() - entry.at > STALE_MS) return null;
  return { x: entry.x, y: entry.y, z: entry.z };
}

/** Merge online players with cached coords for websocket / API. */
export function getPlayersWithPositions(serverId) {
  const byIgn = new Map(
    getCachedPositions(serverId).map((p) => [p.ign.toLowerCase(), p]),
  );
  return getOnlinePlayers(serverId).map((p) => {
    const cached = byIgn.get(p.ign.toLowerCase());
    return {
      ign: p.ign,
      ping: p.ping ?? null,
      platform: p.platform ?? null,
      team: p.team?.id ?? null,
      coords: cached?.coords || null,
      updatedAt: cached?.updatedAt || null,
    };
  });
}
