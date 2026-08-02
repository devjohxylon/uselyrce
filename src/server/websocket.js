import { Server } from "socket.io";
import { config } from "../config.js";
import { resolvePanelSession } from "../saas/auth/routes.js";
import { getOnlinePlayers, getRconStatus, getServerInfo } from "../modules/rcon/client.js";
import { getPlayersWithPositions } from "../modules/rcon/live-map.js";
import { statsSummary } from "../modules/rcon/stats.js";
import { runWithServer } from "../saas/rcon/pool.js";
import { runWithDataContext } from "../saas/data-path.js";
import { baseDomain } from "../saas/tenancy.js";

let io = null;
const connectedSockets = new Map();

function corsOriginAllowlist() {
  const list = [];
  const panel = config.adminPanel.publicUrl || config.saas.publicUrl;
  if (panel) {
    try {
      list.push(new URL(panel).origin);
    } catch {
      /* ignore */
    }
  }
  const base = baseDomain();
  if (base && base.includes(".")) {
    list.push(`https://${base}`);
    list.push(`https://www.${base}`);
    list.push(`https://app.${base}`);
  }
  const isProd =
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) ||
    process.env.NODE_ENV === "production";
  if (!list.length && !isProd) return true;
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    if (list.includes(origin)) return cb(null, true);
    if (base && origin.endsWith(`.${base}`) && origin.startsWith("https://")) {
      return cb(null, true);
    }
    return cb(new Error("CORS blocked"), false);
  };
}

function roomFor(session) {
  if (session?.orgId && session?.serverId) return `t:${session.orgId}:${session.serverId}`;
  if (session?.serverId) return `s:${session.serverId}`;
  return null;
}

export function createWebSocketServer(httpServer, discordClient = null) {
  io = new Server(httpServer, {
    path: "/admin/socket.io",
    cors: {
      origin: corsOriginAllowlist(),
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const session = await resolvePanelSession(socket.request, discordClient);
      if (!session || session.needsOnboarding) {
        return next(new Error("Unauthorized"));
      }
      socket.session = session;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const room = roomFor(socket.session);
    if (room) socket.join(room);
    connectedSockets.set(socket.id, socket);

    socket.on("disconnect", () => {
      connectedSockets.delete(socket.id);
    });

    socket.emit("connected", {
      message: "Real-time connection established",
      role: socket.session.role,
    });
  });

  startRealtimeUpdates();
  return io;
}

async function payloadForSession(session) {
  const serverId = session.serverId;
  if (!serverId) return null;

  const run = async () => {
    const rcon = getRconStatus(serverId);
    const server = getServerInfo(serverId);
    const players = getOnlinePlayers(serverId);
    const positions = getPlayersWithPositions();
    const summary = await statsSummary().catch(() => null);
    return {
      rcon: { connected: rcon.connected, enabled: rcon.enabled },
      server: server
        ? {
            players: server.Players,
            maxPlayers: server.MaxPlayers,
            fps: server.Framerate,
            entities: server.EntityCount,
          }
        : null,
      onlineCount: players.length,
      positions,
      stats: summary,
    };
  };

  if (session.orgId) {
    return runWithDataContext({ orgId: session.orgId, serverId }, () =>
      runWithServer(serverId, run),
    );
  }
  return runWithServer(serverId, run);
}

function startRealtimeUpdates() {
  setInterval(async () => {
    if (!io || connectedSockets.size === 0) return;

    const byRoom = new Map();
    for (const socket of connectedSockets.values()) {
      const room = roomFor(socket.session);
      if (!room) continue;
      if (!byRoom.has(room)) byRoom.set(room, socket.session);
    }

    for (const [room, session] of byRoom) {
      try {
        const data = await payloadForSession(session);
        if (!data) continue;
        io.to(room).emit("server:update", {
          rcon: data.rcon,
          server: data.server,
          onlineCount: data.onlineCount,
        });
        io.to(room).emit("players:update", data.positions);
        if (data.stats) io.to(room).emit("stats:update", data.stats);
      } catch {
        /* ignore per-tenant emit failures */
      }
    }
  }, 3000);
}

export function getIO() {
  return io;
}
