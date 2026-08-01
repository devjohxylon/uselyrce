import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import { commandDefinitions } from "./definitions.js";

function restClient(token) {
  return new REST({ version: "10" }).setToken(token || config.discord.token);
}

/**
 * Instant guild-scoped commands (show up right away in that server).
 */
export async function syncGuildSlashCommands(guildId, { clientId, token } = {}) {
  const id = clientId || config.discord.clientId;
  if (!id || !guildId) throw new Error("Missing Discord client id or guild id");
  await restClient(token).put(Routes.applicationGuildCommands(id, String(guildId)), {
    body: commandDefinitions,
  });
  return { scope: "guild", guildId: String(guildId), count: commandDefinitions.length, clientId: id };
}

/**
 * Push slash commands.
 * SaaS: guild-only (instant, no duplicates). Clears global commands once.
 * Legacy: home GUILD_ID when set, otherwise global.
 */
export async function syncSlashCommands({ clientId, token, guildIds = [] } = {}) {
  const id = clientId || config.discord.clientId;
  const botToken = token || config.discord.token;
  if (!id || !botToken) throw new Error("Missing Discord client id or token");

  const rest = restClient(botToken);
  const body = commandDefinitions;
  const guilds = [...new Set(guildIds.map(String).filter(Boolean))];

  if (config.saas.enabled) {
    // Drop globals so Discord doesn't show two of every command (global + guild).
    await rest.put(Routes.applicationCommands(id), { body: [] });
    const guildResults = [];
    for (const guildId of guilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(id, guildId), { body });
        guildResults.push({ guildId, ok: true });
      } catch (error) {
        guildResults.push({ guildId, ok: false, error: error.message });
        console.error(`Guild slash sync failed [${guildId}]:`, error.message);
      }
    }
    return {
      scope: "guilds",
      count: body.length,
      clientId: id,
      guilds: guildResults,
      clearedGlobal: true,
    };
  }

  if (!config.discord.guildId) {
    await rest.put(Routes.applicationCommands(id), { body });
    return { scope: "global", count: body.length, clientId: id };
  }

  await rest.put(Routes.applicationGuildCommands(id, config.discord.guildId), { body });
  return {
    scope: "guild",
    guildId: config.discord.guildId,
    count: body.length,
    clientId: id,
  };
}
