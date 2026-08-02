import { RCEManager, LogLevel, RCEEvent, RCEIntent } from "rce.js";
import { config } from "../../config.js";
import {
  startPool,
  attachServer as poolAttach,
  detachServer as poolDetach,
  destroyPool,
  getPoolStatus,
  getPoolServer,
  getPoolServerInfo,
  getPoolOnlinePlayers,
  poolSendCommand,
  poolFetchInfo,
  getActiveServerId,
  runWithServer,
  getPoolManager,
  waitForPoolConnection,
} from "../../saas/rcon/pool.js";
import { listAllEnabledForPool } from "../../saas/db/servers.js";
import { noteRconState } from "./connection-alerts.js";

export { runWithServer, getActiveServerId };

let manager = null;
let lastError = null;
let connectedAt = null;
let watchdog = null;
let reattaching = false;
let reconnectAttempts = 0;

const WATCHDOG_MS = 12_000;

function saasOn() {
  return Boolean(config.saas?.enabled);
}

function mockOn() {
  return Boolean(config.saas?.mock);
}

const MOCK_BOOTED_AT = new Date();
const MOCK_PLAYERS = [
  "Penumbra", "xXWolfyXx", "RustyNail", "BradTheBuilder", "Kiwi",
  "SgtScrap", "NoLifeNate", "Vex", "TurretTina", "HempFarmer420",
].map((ign) => ({ ign, isOnline: true }));

function mockServerInfo() {
  return {
    Hostname: "Usely Main [MOCK]",
    Players: MOCK_PLAYERS.length,
    MaxPlayers: 100,
    Queued: 0,
    Joining: 0,
    EntityCount: 118432,
    GameTime: "14:20",
    Uptime: Math.floor((Date.now() - MOCK_BOOTED_AT.getTime()) / 1000) + 3600,
    Map: "Procedural Map",
    Framerate: 58,
    Memory: 4096,
    NetworkIn: 128,
    NetworkOut: 256,
  };
}

function requireServerId(explicit) {
  const id = explicit || getActiveServerId();
  if (!id) {
    throw new Error("No active server selected. Pick a server in the panel.");
  }
  return id;
}

export function isRconEnabled() {
  if (saasOn()) return true;
  const { enabled, host, port, password } = config.rcon;
  return Boolean(enabled && host && port && password);
}

/** host:port fingerprint — drop stale kit caches when the RCON target changes. */
export function getRconEndpointKey(serverId) {
  const status = getRconStatus(serverId);
  if (!status?.host || !status?.port) return null;
  const sid = serverId || getActiveServerId() || "";
  return `${sid ? `${sid}@` : ""}${String(status.host).toLowerCase()}:${Number(status.port)}`;
}

/** Clear in-memory KitManager list for the active (or given) server. */
export function clearServerKitCache(serverId) {
  const server = getServer(serverId);
  if (server) server.kits = [];
}

function serverOptions() {
  return {
    identifier: config.rcon.identifier,
    rcon: {
      host: config.rcon.host,
      port: config.rcon.port,
      password: config.rcon.password,
    },
    state: [],
    reconnection: { enabled: true, interval: 5000, maxAttempts: -1 },
    intents: [RCEIntent.ServerInfo, RCEIntent.PlayerList, RCEIntent.Teams],
  };
}

function socketIsOpen() {
  if (saasOn()) {
    const id = getActiveServerId();
    if (!id) return false;
    const socket = getPoolServer(id)?.socket;
    return Boolean(socket && socket.readyState === 1);
  }
  const socket = getServer()?.socket;
  return Boolean(socket && socket.readyState === 1);
}

export function getRconStatus(serverId) {
  if (saasOn()) {
    const id = serverId || getActiveServerId();
    if (mockOn() && id) {
      return {
        enabled: true,
        connected: true,
        lastError: null,
        connectedAt: MOCK_BOOTED_AT,
        identifier: id,
        host: "mock-rcon",
        port: 28016,
      };
    }
    if (!id) {
      return {
        enabled: false,
        connected: false,
        lastError: null,
        connectedAt: null,
        identifier: null,
        host: null,
        port: null,
      };
    }
    return getPoolStatus(id);
  }
  const live = socketIsOpen();
  return {
    enabled: isRconEnabled(),
    connected: live,
    lastError: live ? null : lastError,
    connectedAt: live ? connectedAt : null,
    identifier: config.rcon.identifier,
    host: config.rcon.host || null,
    port: config.rcon.port || null,
  };
}

export function getManager() {
  if (saasOn()) return getPoolManager();
  return manager;
}

export function getServer(serverId) {
  if (saasOn()) {
    const id = serverId || getActiveServerId();
    return id ? getPoolServer(id) : null;
  }
  return manager?.getServer(config.rcon.identifier) ?? null;
}

export function getServerInfo(serverId) {
  if (saasOn()) {
    const id = serverId || getActiveServerId();
    if (mockOn() && id) return mockServerInfo();
    return id ? getPoolServerInfo(id) : null;
  }
  return getServer()?.info ?? null;
}

export function getOnlinePlayers(serverId) {
  if (saasOn()) {
    const id = serverId || getActiveServerId();
    if (mockOn() && id) return [...MOCK_PLAYERS];
    return id ? getPoolOnlinePlayers(id) : [];
  }
  const players = getServer()?.players ?? [];
  return players.filter((p) => p.isOnline !== false);
}

async function attachServer() {
  const added = await manager.addServer(serverOptions()).catch((error) => {
    lastError = error.message;
    return false;
  });

  if (!added) {
    console.error(
      config.saas?.enabled
        ? "Could not reach a Rust server over WebRCON. Check host/port/password in Workspace → Servers."
        : "Could not reach the Rust server. Double-check RCON_HOST / RCON_PORT / RCON_PASSWORD in your Nitrado panel.",
    );
  }
  return Boolean(added);
}

async function watchdogTick() {
  if (reattaching || socketIsOpen()) return;
  await noteRconState(config.rcon.identifier || "default", false, {
    name: config.rcon.identifier || "Server",
    host: config.rcon.host,
    port: config.rcon.port,
  }).catch(() => {});
  reattaching = true;
  reconnectAttempts += 1;
  try {
    console.warn(`RCON watchdog: connection down — reconnect attempt ${reconnectAttempts}…`);
    if (getServer()) manager.removeServer(config.rcon.identifier);
    const ok = await attachServer();
    if (ok && socketIsOpen()) reconnectAttempts = 0;
  } catch (error) {
    lastError = error.message;
  }
  reattaching = false;
}

export async function connectRcon() {
  if (saasOn()) {
    if (mockOn()) {
      console.log("SaaS MOCK mode: skipping real RCON — serving fake server data.");
      return null;
    }
    const servers = await listAllEnabledForPool().catch((e) => {
      console.error("Failed to load SaaS servers for RCON pool:", e.message);
      return [];
    });
    if (!servers.length) {
      console.log("SaaS mode: RCON pool idle — waiting for paid workspace servers.");
    } else {
      console.log(`SaaS mode: attaching ${servers.length} RCON server(s)…`);
    }
    // Always return a manager so event handlers wire once; servers attach later.
    return startPool(servers);
  }

  if (!isRconEnabled()) {
    console.log(
      config.saas?.enabled
        ? "Legacy single-server RCON disabled (SaaS uses Workspace → Servers)."
        : "RCON disabled — set RCON_HOST, RCON_PORT, RCON_PASSWORD in .env to connect.",
    );
    return null;
  }

  manager = new RCEManager({ logger: { level: LogLevel.Error } });

  manager.on(RCEEvent.Ready, () => {
    lastError = null;
    connectedAt = new Date();
    reconnectAttempts = 0;
    console.log(`RCON connected to ${config.rcon.host}:${config.rcon.port}`);
    noteRconState(config.rcon.identifier || "default", true, {
      name: config.rcon.identifier || "Server",
      host: config.rcon.host,
      port: config.rcon.port,
    }).catch(() => {});
  });

  manager.on(RCEEvent.Error, ({ error }) => {
    let msg = typeof error === "string" ? error : String(error?.message ?? error);
    if (/Does Not Exist Or Is Not Connected|Is Not Connected!/i.test(msg)) {
      msg = "Not connected to the game server (websocket down). Reconnecting…";
    }
    lastError = msg;
    console.error("RCON error:", msg);

    if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|closed|WebSocket error/i.test(msg)) {
      setTimeout(() => watchdogTick().catch(() => {}), 1500);
    }
  });

  await attachServer();

  if (!watchdog) {
    watchdog = setInterval(() => watchdogTick().catch(() => {}), WATCHDOG_MS);
  }

  return manager;
}

export async function sendGameCommand(command, serverId) {
  if (saasOn()) {
    const id = requireServerId(serverId);
    if (mockOn()) return `[mock] accepted: ${command}`;
    return poolSendCommand(id, command);
  }
  if (!manager || !socketIsOpen()) {
    throw new Error("RCON is not connected to the game server.");
  }
  const response = await manager.sendCommand(config.rcon.identifier, command);
  return response ?? "";
}

export async function fetchServerInfo(serverId) {
  if (saasOn()) {
    const id = requireServerId(serverId);
    if (mockOn()) return mockServerInfo();
    return poolFetchInfo(id);
  }
  if (!manager || !socketIsOpen()) {
    throw new Error("RCON is not connected to the game server.");
  }
  return manager.fetchInfo(config.rcon.identifier);
}

export async function broadcast(message, serverId) {
  return sendGameCommand(`say ${message}`, serverId);
}

export async function attachSaasServer(server) {
  if (server?.orgId && !mockOn()) {
    const { getOrg } = await import("../../saas/db/orgs.js");
    const { isPlanLive } = await import("../../saas/billing/plans.js");
    const org = await getOrg(server.orgId);
    if (!org || !isPlanLive(org.plan_status)) {
      const err = new Error("Subscription is not active — WebRCON stays disconnected.");
      err.code = "PLAN_REQUIRED";
      throw err;
    }
  }
  return poolAttach(server);
}

/** Attach then wait briefly for the WebRCON socket (setup / panel feedback). */
export async function attachSaasServerAndWait(server, { timeoutMs = 12_000 } = {}) {
  const added = await poolAttach(server);
  if (!added) {
    const status = getPoolStatus(server.id);
    return {
      ok: false,
      connected: false,
      lastError: status.lastError || "Could not reach WebRCON — check host, port, and password.",
    };
  }
  return waitForPoolConnection(server.id, { timeoutMs });
}

export function detachSaasServer(serverId) {
  return poolDetach(serverId);
}

let cachedMapMetadata = null;

function parseMapNumber(raw) {
  if (raw == null) return null;
  const text = String(raw).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mapImageCandidates(seed, size) {
  const custom = process.env.RUST_MAP_IMAGE_URL?.trim();
  if (custom) return [custom];
  if (seed) return [`/admin/api/map/image?seed=${seed}&size=${size || 4000}`];
  return [];
}

export async function getMapMetadata() {
  if (cachedMapMetadata) return cachedMapMetadata;

  const envSeed = process.env.RUST_MAP_SEED ? parseMapNumber(process.env.RUST_MAP_SEED) : null;
  const envSize = process.env.RUST_MAP_SIZE ? parseMapNumber(process.env.RUST_MAP_SIZE) : null;

  if (!getManager() || !socketIsOpen()) {
    const seed = envSeed;
    const size = envSize || 4000;
    return {
      seed,
      size,
      imageUrl: mapImageCandidates(seed, size)[0] || null,
      imageUrls: mapImageCandidates(seed, size),
    };
  }

  try {
    const seedResponse = await sendGameCommand("global.seed").catch(() =>
      sendGameCommand("seed").catch(() => null),
    );

    const sizeResponse = await sendGameCommand("global.worldsize").catch(() =>
      sendGameCommand("worldsize").catch(() => null),
    );

    const seed = parseMapNumber(seedResponse) || envSeed;
    const size = parseMapNumber(sizeResponse) || envSize || 4000;
    const images = mapImageCandidates(seed, size);

    cachedMapMetadata = {
      seed,
      size,
      imageUrl: images[0] || null,
      imageUrls: images,
    };

    if (cachedMapMetadata.seed) {
      console.log(`Map metadata cached: Seed ${cachedMapMetadata.seed}, Size ${cachedMapMetadata.size}m`);
    }

    return cachedMapMetadata;
  } catch (error) {
    console.error("Failed to fetch map metadata:", error.message);
    const seed = envSeed;
    const size = envSize || 4000;
    return {
      seed,
      size,
      imageUrl: mapImageCandidates(seed, size)[0] || null,
      imageUrls: mapImageCandidates(seed, size),
    };
  }
}

export function clearMapMetadataCache() {
  cachedMapMetadata = null;
}

export function destroyRcon() {
  if (saasOn()) {
    destroyPool();
    cachedMapMetadata = null;
    return;
  }
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
  manager?.destroy();
  manager = null;
  connectedAt = null;
  cachedMapMetadata = null;
}
