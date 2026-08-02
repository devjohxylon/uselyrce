import { RCEEvent } from "rce.js";
import { config } from "../../config.js";
import {
  connectRcon,
  getOnlinePlayers,
  getServerInfo,
  isRconEnabled,
  sendGameCommand,
} from "./client.js";
import {
  attachFeedClient,
  feedItemSpawn,
  feedJoin,
  feedKill,
  feedKitSpawn,
  feedLeave,
  feedPlayerBanned,
  feedPlayerUnbanned,
  feedQuickChat,
  feedRoleChange,
  feedServerEvent,
  flushAllFeeds,
} from "./feeds.js";
import {
  endSession,
  flushStats,
  getLeaderboard,
  recordKill,
  recordSuicide,
  startSession,
} from "./stats.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { startWipeScheduler, stopWipeScheduler, syncWipeStatus } from "./wipe.js";
import { startConnectionAlerts } from "./connection-alerts.js";
import { syncVipForDiscord, syncVipOnJoin, tryClaimVipFromQuickChat, attachVipClient } from "./vip-sync.js";
import {
  attachReportsClient,
  checkTeamSize,
  recordCombatEvent,
  startGroupScanner,
  stopGroupScanner,
} from "./reports.js";
import { startPositionPolling, stopPositionPolling } from "./live-map.js";
import { attachLeaderboardClient, publishLeaderboardToDiscord } from "./leaderboard-publish.js";
import { formatPopChannelName, getStatusSettingsSync } from "../admin/status-settings.js";
import { resolveChannelId } from "../../saas/tenant-channels.js";
import {
  eventServerId,
  tenantEventHandler,
  withTenant,
} from "../../saas/tenant-context.js";
import {
  getServerOrgId,
  markPoolHandlersWired,
  poolHandlersWired,
} from "../../saas/rcon/pool.js";
import { getOrg } from "../../saas/db/orgs.js";

const LEADERBOARD_BOARDS = [
  { category: "kills", title: "Top Kills" },
  { category: "kd", title: "Best K/D" },
  { category: "playtime", title: "Most Playtime" },
];

/** @type {Map<string, { name: string|null, at: number }>} */
const statusRenameByServer = new Map();
let discordClient = null;

function resolveOrgForServer(serverId) {
  return getServerOrgId(serverId);
}

function wrap(handler) {
  return tenantEventHandler(handler, resolveOrgForServer);
}

export async function startRcon(client) {
  startConnectionAlerts(client);
  if (!isRconEnabled()) {
    console.log(
      config.saas?.enabled
        ? "RCON pool idle — waiting for servers added in customer workspaces."
        : "RCON not configured — running in Discord-only mode.",
    );
    startWipeScheduler(client);
    return null;
  }

  discordClient = client;
  attachFeedClient(client);
  attachReportsClient(client);
  attachLeaderboardClient(client);
  attachVipClient(client);
  const manager = await connectRcon();
  if (!manager) {
    startWipeScheduler(client);
    return null;
  }

  if (poolHandlersWired()) {
    startWipeScheduler(client);
    return manager;
  }
  markPoolHandlersWired();

  manager.on(
    RCEEvent.Ready,
    wrap(async (payload) => {
      const serverId = eventServerId(payload);
      syncServerStatus(client, getServerInfo(serverId), { force: true, serverId }).catch(() => {});
      publishLeaderboardToDiscord(client).catch((e) =>
        console.error("Leaderboard Discord publish failed:", e.message),
      );
      syncWipeStatus(client, { force: true }).catch(() => {});
      scanTeamsSoon(manager, serverId);
    }),
  );

  manager.on(
    RCEEvent.PlayerKill,
    wrap(async (data) => {
      feedKill(data);
      recordCombatEvent(data);
      await recordKill(data).catch(() => {});

      if (config.rcon.ingameKillfeed && data.killer?.type === "Player") {
        await sendGameCommand(
          `say <color=#ff5555>${data.killer.name}</color> killed <color=#ff5555>${data.victim.name}</color>`,
        ).catch(() => {});
      }
    }),
  );

  for (const evt of [RCEEvent.TeamCreated, RCEEvent.TeamJoin]) {
    manager.on(
      evt,
      wrap(({ team, ...rest }) => {
        checkTeamSize(team).catch(() => {});
        const serverId = eventServerId({ team, ...rest });
        if (serverId) scanTeamsSoon(manager, serverId);
      }),
    );
  }

  manager.on(
    RCEEvent.TeamLeave,
    wrap((payload) => {
      setTimeout(() => scanTeamsSoon(manager, eventServerId(payload)), 2000);
    }),
  );

  manager.on(
    RCEEvent.PlayerJoined,
    wrap(async ({ player, ...rest }) => {
      feedJoin(player);
      await startSession(player.ign).catch(() => {});

      const linked = await syncVipOnJoin(player.ign).catch(() => null);
      if (linked?.discordId && client) {
        const serverId = eventServerId({ player, ...rest });
        const orgId = serverId ? getServerOrgId(serverId) : null;
        let guildId = config.discord.guildId;
        if (orgId) {
          const org = await getOrg(orgId).catch(() => null);
          if (org?.discord_guild_id) guildId = org.discord_guild_id;
        }
        const guild = guildId
          ? await client.guilds.fetch(guildId).catch(() => null)
          : client.guilds.cache.first();
        const member = await guild?.members.fetch(linked.discordId).catch(() => null);
        if (member) {
          await syncVipForDiscord(linked.discordId, member).catch(() => {});
        }
      }
    }),
  );

  manager.on(
    RCEEvent.PlayerLeft,
    wrap(async ({ player }) => {
      feedLeave(player);
      await endSession(player.ign).catch(() => {});
    }),
  );

  manager.on(
    RCEEvent.PlayerSuicide,
    wrap(async ({ player }) => {
      await recordSuicide(player.ign).catch(() => {});
    }),
  );

  manager.on(
    RCEEvent.QuickChat,
    wrap(({ player, message, type }) => {
      feedQuickChat({ player, message, type });
      tryClaimVipFromQuickChat({ player, message }).catch((e) =>
        console.error("VIP quick-chat claim failed:", e.message),
      );
    }),
  );

  manager.on(
    RCEEvent.EventStart,
    wrap((data) => {
      feedServerEvent(data).catch(() => {});
    }),
  );

  manager.on(RCEEvent.PlayerBanned, wrap(feedPlayerBanned));
  manager.on(RCEEvent.PlayerUnbanned, wrap(feedPlayerUnbanned));
  manager.on(RCEEvent.ItemSpawn, wrap(feedItemSpawn));
  manager.on(RCEEvent.KitSpawn, wrap(feedKitSpawn));
  manager.on(
    RCEEvent.PlayerRoleAdd,
    wrap((d) => feedRoleChange({ ...d, added: true })),
  );
  manager.on(
    RCEEvent.PlayerRoleRemove,
    wrap((d) => feedRoleChange({ ...d, added: false })),
  );

  manager.on(
    RCEEvent.ServerInfoUpdated,
    wrap(({ info, ...rest }) => {
      const serverId = eventServerId({ info, ...rest });
      syncServerStatus(client, info, { serverId }).catch((error) =>
        console.error("Server status sync failed:", error.message),
      );
    }),
  );

  setInterval(() => flushStats().catch(() => {}), 60_000);
  setInterval(
    () => {
      publishLeaderboardToDiscord(client).catch((error) =>
        console.error("Leaderboard Discord publish failed:", error.message),
      );
    },
    config.rcon.leaderboardPushMs,
  );

  startScheduler();
  startWipeScheduler(client);
  startGroupScanner();
  startPositionPolling();
  return manager;
}

function scanTeamsSoon(manager, serverId) {
  const id = serverId || config.rcon.identifier;
  setTimeout(() => {
    const teams = manager?.getTeams?.(id) || [];
    for (const team of teams) checkTeamSize(team).catch(() => {});
  }, 3000);
}

export async function syncServerStatus(client, info = getServerInfo(), { force = false, serverId } = {}) {
  if (!info) return null;

  const payload = {
    type: "server_status",
    source: "rcon",
    players: info.Players ?? 0,
    maxPlayers: info.MaxPlayers ?? config.server.max,
    queued: info.Queued ?? 0,
    joining: info.Joining ?? 0,
    hostname: info.Hostname ?? null,
    map: info.Map ?? null,
    gameTime: info.GameTime ?? null,
    uptimeSeconds: info.Uptime ?? null,
    framerate: info.Framerate ?? null,
    restarting: Boolean(info.Restarting),
    online: true,
  };

  await updateStatusChannel(client, info, force, serverId);
  return payload;
}

async function updateStatusChannel(client, info, force = false, serverId = null) {
  const channelId = resolveChannelId("popStatus");
  if (!channelId || !client) return;

  const popSettings = getStatusSettingsSync().popStatus;
  if (popSettings?.enabled === false) return;

  const name = formatPopChannelName(info, popSettings);
  const key = serverId || "legacy";
  const prev = statusRenameByServer.get(key) || { name: null, at: 0 };
  if (!force && name === prev.name) return;

  const now = Date.now();
  if (!force && now - prev.at < config.rcon.statusUpdateMs) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  await channel.setName(name).catch(() => {});
  statusRenameByServer.set(key, { name, at: now });
}

export async function buildLeaderboardPayload(limit = 10) {
  const boards = [];

  for (const board of LEADERBOARD_BOARDS) {
    const rows = await getLeaderboard(board.category, limit);
    if (!rows.length) continue;

    boards.push({
      category: board.category,
      title: board.title,
      entries: rows.map((row) => ({
        rank: row.rank,
        name: row.name,
        value: row.numeric,
        valueRaw: row.value,
        stat: board.category,
      })),
    });
  }

  return boards;
}

export async function relayDiscordToGame(message) {
  if (!config.rcon.chatBridge) return false;
  const gameChat = resolveChannelId("gameChat");
  if (!gameChat) return false;
  if (message.channelId !== gameChat) return false;
  if (message.author.bot) return false;

  const text = message.cleanContent?.trim();
  if (!text) return false;

  const name = message.member?.displayName ?? message.author.username;
  await sendGameCommand(
    `say <color=#7289da>[Discord] ${name}</color>: ${text.slice(0, 180)}`,
  ).catch(() => {});
  return true;
}

export async function shutdownRcon() {
  stopScheduler();
  stopWipeScheduler();
  stopGroupScanner();
  stopPositionPolling();
  await flushAllFeeds().catch(() => {});
  await flushStats({ force: true }).catch(() => {});
}

export { publishLeaderboardToDiscord, buildLeaderboardAttachment } from "./leaderboard-publish.js";
export { getOnlinePlayers, getServerInfo, sendGameCommand };
export { withTenant };
