import { REST, Routes } from "discord.js";
import { config } from "./config.js";
import { commandDefinitions } from "./commands/definitions.js";

/**
 * Push slash command definitions to Discord.
 * SaaS / multi-tenant → global app commands (every guild the bot is in).
 * Legacy single-server → guild commands when GUILD_ID is set (instant).
 */
export async function syncSlashCommands({ clientId, token } = {}) {
  const id = clientId || config.discord.clientId;
  const botToken = token || config.discord.token;
  if (!id || !botToken) throw new Error("Missing Discord client id or token");

  const rest = new REST({ version: "10" }).setToken(botToken);
  const body = commandDefinitions;

  // Multi-tenant: never pin commands to one home guild.
  if (config.saas.enabled || !config.discord.guildId) {
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
