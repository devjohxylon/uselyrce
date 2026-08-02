import { AsyncLocalStorage } from "async_hooks";
import { RCEManager, LogLevel, RCEEvent, RCEIntent } from "rce.js";
import { noteRconState } from "../../modules/rcon/connection-alerts.js";

const WATCHDOG_MS = 12_000;
const serverContext = new AsyncLocalStorage();

let manager = null;
/** @type {Map<string, { host: string, port: number, lastError: string|null, connectedAt: Date|null, reattaching: boolean, reconnectAttempts: number, name?: string }>} */
const states = new Map();
let watchdog = null;

export function getActiveServerId() {
  return serverContext.getStore()?.serverId ?? null;
}

export function runWithServer(serverId, fn) {
  return serverContext.run({ serverId }, fn);
}

export function getPoolManager() {
  return manager;
}

function ensureManager() {
  if (!manager) {
    manager = new RCEManager({ logger: { level: LogLevel.Error } });
    manager.on(RCEEvent.Ready, (payload) => {
      const id = payload?.server?.identifier || payload?.identifier;
      if (!id || !states.has(id)) return;
      const st = states.get(id);
      st.lastError = null;
      st.connectedAt = new Date();
      st.reconnectAttempts = 0;
      console.log(`RCON connected [${id}] ${st.host}:${st.port}`);
      noteRconState(id, true, { name: st.name, host: st.host, port: st.port }).catch(() => {});
    });
    manager.on(RCEEvent.Error, ({ error, server }) => {
      const id = server?.identifier;
      let msg = typeof error === "string" ? error : String(error?.message ?? error);
      if (/Does Not Exist Or Is Not Connected|Is Not Connected!/i.test(msg)) {
        msg = "Not connected to the game server (websocket down). Reconnecting…";
      }
      if (id && states.has(id)) states.get(id).lastError = msg;
      console.error(`RCON error [${id || "?"}]:`, msg);
      if (id && /ECONNRESET|ECONNREFUSED|ETIMEDOUT|closed|WebSocket error/i.test(msg)) {
        setTimeout(() => watchdogTick(id).catch(() => {}), 1500);
      }
    });
  }
  return manager;
}

function socketIsOpen(serverId) {
  const socket = manager?.getServer(serverId)?.socket;
  return Boolean(socket && socket.readyState === 1);
}

function serverOptions(server) {
  return {
    identifier: server.id,
    rcon: {
      host: server.host,
      port: server.port,
      password: server.password,
    },
    state: [],
    reconnection: { enabled: true, interval: 5000, maxAttempts: -1 },
    intents: [RCEIntent.ServerInfo, RCEIntent.PlayerList, RCEIntent.Teams],
  };
}

async function attachOne(server) {
  const m = ensureManager();
  const prev = states.get(server.id);
  states.set(server.id, {
    host: server.host,
    port: server.port,
    name: server.name || prev?.name || server.id,
    lastError: null,
    connectedAt: null,
    reattaching: false,
    reconnectAttempts: 0,
    // Keep password for watchdog reconnect (was wiped before and broke recovery).
    _password: server.password ?? prev?._password ?? null,
  });
  const added = await m.addServer(serverOptions(server)).catch((error) => {
    const st = states.get(server.id);
    if (st) st.lastError = error.message;
    return false;
  });
  if (!added) {
    console.error(
      `Could not reach Rust server ${server.name || server.id} (${server.host}:${server.port}).`,
    );
  }
  return Boolean(added);
}

async function watchdogTick(serverId) {
  const st = states.get(serverId);
  if (!st || st.reattaching || socketIsOpen(serverId)) return;
  await noteRconState(serverId, false, {
    name: st.name,
    host: st.host,
    port: st.port,
  }).catch(() => {});
  st.reattaching = true;
  st.reconnectAttempts += 1;
  try {
    console.warn(
      `RCON watchdog [${serverId}]: down — reconnect ${st.reconnectAttempts}…`,
    );
    if (manager?.getServer(serverId)) manager.removeServer(serverId);
    await manager.addServer(
      serverOptions({
        id: serverId,
        host: st.host,
        port: st.port,
        password: st._password,
      }),
    ).catch((e) => {
      st.lastError = e.message;
      return false;
    });
    if (socketIsOpen(serverId)) st.reconnectAttempts = 0;
  } catch (error) {
    st.lastError = error.message;
  }
  st.reattaching = false;
}

/**
 * @param {Array<{ id: string, host: string, port: number, password: string, name?: string }>} servers
 */
export async function startPool(servers) {
  ensureManager();
  for (const server of servers) {
    const st = states.get(server.id) || {};
    st._password = server.password;
    states.set(server.id, {
      host: server.host,
      port: server.port,
      name: server.name || server.id,
      lastError: null,
      connectedAt: null,
      reattaching: false,
      reconnectAttempts: 0,
      _password: server.password,
    });
    await attachOne(server);
  }
  if (!watchdog) {
    watchdog = setInterval(() => {
      for (const id of states.keys()) {
        watchdogTick(id).catch(() => {});
      }
    }, WATCHDOG_MS);
  }
  return manager;
}

export async function attachServer(server) {
  ensureManager();
  states.set(server.id, {
    host: server.host,
    port: server.port,
    name: server.name || server.id,
    lastError: null,
    connectedAt: null,
    reattaching: false,
    reconnectAttempts: 0,
    _password: server.password,
  });
  return attachOne(server);
}

export function detachServer(serverId) {
  if (manager?.getServer(serverId)) manager.removeServer(serverId);
  states.delete(serverId);
}

export function getPoolStatus(serverId) {
  const st = states.get(serverId);
  const live = socketIsOpen(serverId);
  return {
    enabled: Boolean(st),
    connected: live,
    lastError: live ? null : st?.lastError ?? null,
    connectedAt: live ? st?.connectedAt ?? null : null,
    identifier: serverId,
    host: st?.host ?? null,
    port: st?.port ?? null,
  };
}

/** Wait until the pool socket is open, or timeout with lastError. */
export function waitForPoolConnection(serverId, { timeoutMs = 12_000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const status = getPoolStatus(serverId);
      if (status.connected) {
        return resolve({ ok: true, connected: true, lastError: null });
      }
      if (Date.now() - started >= timeoutMs) {
        return resolve({
          ok: false,
          connected: false,
          lastError: status.lastError || "Timed out waiting for WebRCON — check host, port, and password.",
        });
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

export function getPoolServer(serverId) {
  return manager?.getServer(serverId) ?? null;
}

export function getPoolServerInfo(serverId) {
  return getPoolServer(serverId)?.info ?? null;
}

export function getPoolOnlinePlayers(serverId) {
  const players = getPoolServer(serverId)?.players ?? [];
  return players.filter((p) => p.isOnline !== false);
}

export async function poolSendCommand(serverId, command) {
  if (!manager || !socketIsOpen(serverId)) {
    throw new Error("RCON is not connected to the game server.");
  }
  const response = await manager.sendCommand(serverId, command);
  return response ?? "";
}

export async function poolFetchInfo(serverId) {
  if (!manager || !socketIsOpen(serverId)) {
    throw new Error("RCON is not connected to the game server.");
  }
  return manager.fetchInfo(serverId);
}

export function destroyPool() {
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
  manager?.destroy();
  manager = null;
  states.clear();
}

export function listAttachedServerIds() {
  return [...states.keys()];
}

/** Aggregate counts for the public status page — no per-tenant detail. */
export function getPoolHealth() {
  const ids = [...states.keys()];
  return {
    attached: ids.length,
    connected: ids.filter((id) => socketIsOpen(id)).length,
  };
}
