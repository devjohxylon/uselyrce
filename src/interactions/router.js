import {
  handleCommunityCommands,
  handleGiveawayCommand,
  handleModerationCommands,
  handleTicketCommand,
} from "./commands.js";
import { handleButton } from "./buttons.js";
import {
  handleLeaderboardCommand,
  handlePlayersCommand,
  handleRconCommand,
  handleServerInfoCommand,
  handleStatsCommand,
} from "./rcon-commands.js";
import { handleKitCommand } from "./kit-commands.js";
import { handleBansCommand, handlePlayerStaffCommand } from "./staff-player-commands.js";
import {
  handleAutoMessageCommand,
  handleHomeCommand,
  handleLinkCommand,
  handleTpaCommand,
  handleTpdCommand,
  handleTprCommand,
  handleWarpCommand,
} from "./player-commands.js";
import { handleLinkModal } from "../modules/panels/link-panel.js";

const MOD_COMMANDS = new Set([
  "warn",
  "mute",
  "kick",
  "ban",
  "purge",
  "slowmode",
  "lock",
  "unlock",
  "raidmode",
  "case",
]);

const PLAYER_COMMANDS = {
  link: handleLinkCommand,
  home: handleHomeCommand,
  warp: handleWarpCommand,
  tpr: handleTprCommand,
  tpa: handleTpaCommand,
  tpd: handleTpdCommand,
  automessage: handleAutoMessageCommand,
};

export function attachInteractionRouter(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const name = interaction.commandName;

        if (name === "server") return await handleServerInfoCommand(interaction);
        if (name === "players") return await handlePlayersCommand(interaction);
        if (name === "stats") return await handleStatsCommand(interaction);
        if (name === "leaderboard") return await handleLeaderboardCommand(interaction);
        if (name === "rcon") return await handleRconCommand(interaction);
        if (name === "kit") return await handleKitCommand(interaction);
        if (name === "player") return await handlePlayerStaffCommand(interaction);
        if (name === "bans") return await handleBansCommand(interaction);
        if (PLAYER_COMMANDS[name]) return await PLAYER_COMMANDS[name](interaction);

        if (MOD_COMMANDS.has(name)) return await handleModerationCommands(interaction);
        if (name === "giveaway") return await handleGiveawayCommand(interaction, client);
        if (name === "ticket") return await handleTicketCommand(interaction);
        if (name === "poll" || name === "announce") return await handleCommunityCommands(interaction);
      }

      if (interaction.isButton()) {
        return await handleButton(interaction, client);
      }

      if (interaction.isModalSubmit()) {
        if (await handleLinkModal(interaction)) return;
      }
    } catch (error) {
      console.error("Interaction error:", error);
      const reply = { content: `Error: ${error.message}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
  });
}
