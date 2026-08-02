import { EmbedBuilder } from "discord.js";
import { requireStaff } from "../lib/permissions.js";
import { sendModLog } from "../lib/modlog.js";
import { rconOfflineMessage } from "../lib/rcon-messages.js";
import { okEmbed, errEmbed, staffEmbed, STAFF_OK_COLOR, STAFF_WARN_COLOR } from "../lib/staff-embed.js";
import {
  getOnlinePlayers,
  getServerInfo,
  sendGameCommand,
} from "../modules/rcon/client.js";
import { getRconStatus } from "../modules/rcon/client.js";
import { buildLeaderboardAttachment } from "../modules/rcon/index.js";
import {
  formatPlaytime,
  getLeaderboard,
  getPlayerCard,
  resetStats,
} from "../modules/rcon/stats.js";
import { getLinkByDiscord } from "../modules/rcon/linking.js";
import { postStatsPanel, replyWithPlayerStats } from "../modules/panels/stats-panel.js";

const CATEGORY_LABELS = {
  kills: "Top Kills",
  deaths: "Most Deaths",
  kd: "Best K/D",
  playtime: "Most Playtime",
};

function offlineNotice() {
  return rconOfflineMessage(getRconStatus());
}

function formatUptime(seconds) {
  if (!seconds) return "unknown";
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  return days ? `${days}d ${hours % 24}h` : `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export async function handleServerInfoCommand(interaction) {
  const info = getServerInfo();
  if (!info) {
    return interaction.reply({
      ephemeral: true,
      embeds: [errEmbed("Server offline", offlineNotice())],
    });
  }

  const embed = staffEmbed({
    title: info.Hostname ?? "Usely",
    color: info.Restarting ? STAFF_WARN_COLOR : STAFF_OK_COLOR,
    fields: [
      {
        name: "Players",
        value: `${info.Players ?? 0}/${info.MaxPlayers ?? "?"}${info.Queued ? ` (+${info.Queued} queued)` : ""}`,
        inline: true,
      },
      { name: "Map", value: String(info.Map ?? "Procedural"), inline: true },
      { name: "In-game time", value: String(info.GameTime ?? "?"), inline: true },
      { name: "Uptime", value: formatUptime(info.Uptime), inline: true },
      { name: "FPS", value: String(info.Framerate ?? "?"), inline: true },
      { name: "Entities", value: String(info.EntityCount ?? "?"), inline: true },
    ],
    footer: info.Restarting ? "Server is restarting" : undefined,
  });

  return interaction.reply({ embeds: [embed] });
}

export async function handlePlayersCommand(interaction) {
  const players = getOnlinePlayers();
  if (!players.length) {
    const info = getServerInfo();
    return interaction.reply({
      ephemeral: true,
      embeds: [
        info
          ? okEmbed("Online players", "Nobody is online right now.")
          : errEmbed("RCON offline", offlineNotice()),
      ],
    });
  }

  const names = players
    .map((p) => `• ${p.ign}`)
    .sort((a, b) => a.localeCompare(b))
    .join("\n");

  return interaction.reply({
    embeds: [
      staffEmbed({
        title: `Online · ${players.length}`,
        description: names.slice(0, 4000),
        color: 0x7dcea0,
      }),
    ],
  });
}

export async function handleStatsCommand(interaction) {
  const sub = interaction.options.getSubcommand(false) || "player";

  if (sub === "panel") {
    if (!(await requireStaff(interaction))) return;
    await postStatsPanel(interaction.channel);
    return interaction.reply({ ephemeral: true, content: "Stats panel posted." });
  }

  if (sub === "me") {
    await interaction.deferReply({ ephemeral: true });
    const link = await getLinkByDiscord(interaction.user.id);
    if (!link) {
      return interaction.editReply(
        "You're not linked. Use the **Link Account** panel, then `/stats me` or **View My Stats**.",
      );
    }
    try {
      return await replyWithPlayerStats(interaction, link.ign);
    } catch (error) {
      return interaction.editReply(`Couldn't render stats: ${error.message}`);
    }
  }

  // player lookup
  const name =
    interaction.options.getString("ign") ||
    interaction.options.getString("player");
  if (!name) {
    return interaction.reply({
      ephemeral: true,
      content: "Provide an IGN with `/stats player`, or use `/stats me`.",
    });
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    return await replyWithPlayerStats(interaction, name);
  } catch (error) {
    const card = await getPlayerCard(name);
    if (!card) {
      return interaction.editReply(
        `No tracked stats for \`${name}\` yet. Stats start counting once they play while the bot is connected.`,
      );
    }
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${card.name}`)
      .setColor(0xd7dde6)
      .addFields(
        { name: "Kills", value: String(card.kills), inline: true },
        { name: "Deaths", value: String(card.deaths), inline: true },
        { name: "K/D", value: card.kd, inline: true },
        { name: "NPC kills", value: String(card.npcKills), inline: true },
        { name: "Suicides", value: String(card.suicides), inline: true },
        { name: "Playtime", value: formatPlaytime(card.playtimeMs), inline: true },
      )
      .setFooter({ text: `Image failed · ${error.message}` });
    return interaction.editReply({ embeds: [embed] });
  }
}

export async function handleLeaderboardCommand(interaction) {
  await interaction.deferReply();

  try {
    const file = await buildLeaderboardAttachment();
    return interaction.editReply({
      content: null,
      files: [file],
    });
  } catch (error) {
    // Fallback to text embed if image render fails
    const category = interaction.options.getString("category") ?? "kills";
    const rows = await getLeaderboard(category, 10);
    if (!rows.length) {
      return interaction.editReply(
        "No stats tracked yet — the leaderboard fills up as players join and fight.",
      );
    }
    const medals = ["🥇", "🥈", "🥉"];
    const body = rows
      .map((row) => `${medals[row.rank - 1] ?? `\`#${row.rank}\``} **${row.name}** — ${row.value}`)
      .join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${CATEGORY_LABELS[category] ?? "Leaderboard"}`)
      .setDescription(body)
      .setColor(0xf1c40f)
      .setFooter({ text: `Usely • image render failed: ${error.message}` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
}

export async function handleRconCommand(interaction) {
  if (!(await requireStaff(interaction))) return;

  const sub = interaction.options.getSubcommand();

  if (sub === "resetstats") {
    await interaction.deferReply({ ephemeral: true });
    const label = interaction.options.getString("label");
    const data = await resetStats(label);
    await sendModLog(interaction.guild, {
      title: "Leaderboard stats reset",
      moderatorId: interaction.user.id,
      reason: `Wipe label: ${data.wipe}`,
    });
    return interaction.editReply({
      embeds: [okEmbed("Stats reset", `Now tracking wipe \`${data.wipe}\`.`)],
    });
  }

  if (sub === "pushstats") {
    await interaction.deferReply({ ephemeral: true });
    const { publishLeaderboardToDiscord } = await import("../modules/rcon/leaderboard-publish.js");
    const discord = await publishLeaderboardToDiscord(interaction.client).catch((error) => ({
      error: error.message,
    }));
    if (discord?.error) {
      return interaction.editReply({ embeds: [errEmbed("Leaderboard push failed", discord.error)] });
    }
    if (!discord) {
      return interaction.editReply({ embeds: [errEmbed("No stats to push yet.")] });
    }
    return interaction.editReply({
      embeds: [okEmbed("Leaderboard updated", "Discord leaderboard image refreshed.")],
    });
  }

  if (!getRconStatus().connected) {
    return interaction.reply({
      ephemeral: true,
      embeds: [errEmbed("RCON offline", offlineNotice())],
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const player = interaction.options.getString("player");
  const reason = interaction.options.getString("reason") ?? "No reason given";

  let command;
  let summary;
  let title = "RCON";

  if (sub === "say") {
    const message = interaction.options.getString("message", true);
    command = `say <color=#00ffcc>[Usely]</color> ${message}`;
    summary = message;
    title = "Broadcast";
  } else if (sub === "console") {
    command = interaction.options.getString("command", true);
    summary = `\`${command}\``;
    title = "Console";
  } else if (sub === "kick") {
    command = `kick "${player}" "${reason}"`;
    summary = `\`${player}\` — ${reason}`;
    title = "Kick";
  } else if (sub === "ban") {
    command = `ban "${player}" "${reason}"`;
    summary = `\`${player}\` — ${reason}`;
    title = "Ban";
  } else if (sub === "unban") {
    command = `unban "${player}"`;
    summary = `\`${player}\``;
    title = "Unban";
  } else if (sub === "give") {
    const item = interaction.options.getString("item", true);
    const amount = interaction.options.getInteger("amount") ?? 1;
    command = `inventory.giveto "${player}" "${item}" ${amount}`;
    summary = `\`${amount}× ${item}\` → \`${player}\``;
    title = "Give item";
  } else {
    return interaction.editReply({ embeds: [errEmbed("Unknown subcommand")] });
  }

  try {
    const response = await sendGameCommand(command);

    if (sub === "ban" && player) {
      const { upsertActiveBan } = await import("../modules/bans/manager.js");
      await upsertActiveBan({
        ign: player,
        reason,
        admin: interaction.user.username,
        source: "discord",
      }).catch(() => {});
    } else if (sub === "unban" && player) {
      const { unbanPlayer } = await import("../modules/bans/manager.js");
      await unbanPlayer(player, interaction.user.username, "Unbanned via Discord").catch(() => {});
    }

    await sendModLog(interaction.guild, {
      title: `RCON · ${title}`,
      moderatorId: interaction.user.id,
      description: summary,
    });

    const output = String(response ?? "").trim();
    const fields = [{ name: "Action", value: summary }];
    if (output) fields.push({ name: "Server reply", value: `\`\`\`\n${output.slice(0, 900)}\n\`\`\`` });
    return interaction.editReply({
      embeds: [okEmbed(title, null, fields)],
    });
  } catch (error) {
    return interaction.editReply({
      embeds: [errEmbed(`${title} failed`, error.message)],
    });
  }
}
