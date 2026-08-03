import { Client, GatewayIntentBits, Partials } from "discord.js";
import { config } from "./config.js";
import { createWebhookServer } from "./server/webhook.js";
import { attachInteractionRouter } from "./interactions/router.js";
import { runAutomod, trackMemberJoin } from "./modules/automod/engine.js";
import { triggerRaidAlert } from "./modules/moderation/actions.js";
import { handleMemberJoin } from "./modules/welcome/handlers.js";
import { checkExpiredGiveaways } from "./modules/giveaways/manager.js";
import { relayDiscordToGame, shutdownRcon, startRcon } from "./modules/rcon/index.js";
import { getOnlinePlayers, getServerInfo } from "./modules/rcon/client.js";
import { handleVipRoleChange } from "./modules/rcon/vip-sync.js";
import { loadChannelOverrides } from "./modules/admin/channel-settings.js";
import { assertDataPersistence } from "./data/store.js";
import { attachWebSocket, attachAnalytics } from "./modules/rcon/feeds.js";
import * as websocketModule from "./server/websocket.js";
import * as analyticsModule from "./modules/analytics/tracker.js";

export function createBotClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.GuildMember],
  });

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Auto-mod: ${config.automod.enabled ? "ON" : "OFF"}`);

    try {
      const { syncSlashCommands } = await import("./commands/sync.js");
      const appId = client.application?.id || client.user.id;
      const guildIds = [...client.guilds.cache.keys()];
      const result = await syncSlashCommands({ clientId: appId, guildIds });
      if (result.scope === "guild") {
        console.log(`Slash commands: ${result.count} on guild ${result.guildId}`);
      } else if (result.scope === "guilds") {
        const ok = (result.guilds || []).filter((g) => g.ok).length;
        console.log(
          `Slash commands: ${result.count} × ${ok}/${guildIds.length} guild(s) (globals cleared, app ${result.clientId})`,
        );
      } else {
        console.log(`Slash commands: ${result.count} global (app ${result.clientId})`);
      }
    } catch (error) {
      console.error("Slash command sync failed:", error.message);
    }

    attachWebSocket(websocketModule);
    attachAnalytics(analyticsModule);

    await assertDataPersistence().catch((e) =>
      console.error("Data persistence check failed:", e.message),
    );

    const { initScheduler } = await import("./modules/scheduler/engine.js");
    await initScheduler().catch((e) =>
      console.error("Scheduler initialization failed:", e.message),
    );

    await loadChannelOverrides().catch((e) =>
      console.error("Channel overrides failed:", e.message),
    );

    setInterval(() => {
      const players = getOnlinePlayers();
      analyticsModule.trackPlayerCount(players.length).catch(() => {});
      
      const server = getServerInfo();
      if (server) {
        analyticsModule.trackServerPerformance(
          server.Framerate,
          server.EntityCount,
          server.Players
        ).catch(() => {});
      }
    }, 60000);

    setInterval(() => checkExpiredGiveaways(client).catch(() => {}), 30_000);

    startRcon(client).catch((error) => console.error("RCON startup failed:", error.message));
  });

  client.on("guildCreate", async (guild) => {
    console.log(`Joined guild ${guild.name} (${guild.id})`);
    try {
      const { syncGuildSlashCommands } = await import("./commands/sync.js");
      const appId = client.application?.id || client.user.id;
      const result = await syncGuildSlashCommands(guild.id, { clientId: appId });
      console.log(`Slash commands: ${result.count} installed on ${guild.name}`);
    } catch (error) {
      console.error(`Slash sync on join failed [${guild.id}]:`, error.message);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      await handleMemberJoin(member);
      const joinCount = trackMemberJoin();
      if (joinCount >= config.automod.raidJoinThreshold) {
        await triggerRaidAlert(member.guild, joinCount);
      }
    } catch (error) {
      console.error("Member join handler failed:", error.message);
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
      const vipId = config.roles.vip;
      if (!vipId) return;
      const had = oldMember.roles.cache.has(vipId);
      const has = newMember.roles.cache.has(vipId);
      if (had === has) return;
      await handleVipRoleChange(newMember, has);
    } catch (error) {
      console.error("VIP role sync failed:", error.message);
    }
  });

  client.on("messageCreate", async (message) => {
    try {
      await runAutomod(message);
      await relayDiscordToGame(message);
    } catch (error) {
      console.error(`Message handler failed ${message.id}:`, error.message);
    }
  });

  client.on("messageUpdate", async (_old, newMessage) => {
    try {
      if (newMessage.partial) await newMessage.fetch();
      await runAutomod(newMessage);
    } catch (error) {
      console.error(`Message update failed ${newMessage.id}:`, error.message);
    }
  });

  attachInteractionRouter(client);

  return client;
}

export async function startBot() {
  const client = createBotClient();
  const app = await createWebhookServer(client);

  // Keep the bot alive on stray Discord API errors (expired interactions, etc.)
  client.on("error", (error) => {
    console.error("Discord client error:", error.message);
    import("./observability/sentry.js")
      .then(({ captureException }) => captureException(error))
      .catch(() => {});
  });

  import("./saas/ops/alerts.js")
    .then(({ attachDiscordOpsAlerts }) => attachDiscordOpsAlerts(client))
    .catch(() => {});

  // Flush buffered killfeed lines and playtime before exiting
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, async () => {
      await shutdownRcon();
      client.destroy();
      process.exit(0);
    });
  }

  await client.login(config.discord.token);

  app.listen(config.webhook.port, "0.0.0.0", () => {
    console.log(`Webhook server listening on port ${config.webhook.port}`);
    const panelUrl =
      config.adminPanel.publicUrl?.replace(/\/$/, "") ||
      `http://localhost:${config.webhook.port}`;
    console.log(`Admin panel: ${panelUrl}/admin`);
    if (!process.env.ADMIN_PANEL_PASSWORD?.trim() || config.adminPanel.password === "change-me") {
      console.warn(
        "WARNING: Set a strong unique ADMIN_PANEL_PASSWORD — default/fallback passwords are unsafe on a public host.",
      );
    }
    if (!process.env.ADMIN_SESSION_SECRET?.trim()) {
      console.warn(
        "WARNING: Set ADMIN_SESSION_SECRET (separate from the login password) for stronger session cookies.",
      );
    }
  });

  return client;
}
