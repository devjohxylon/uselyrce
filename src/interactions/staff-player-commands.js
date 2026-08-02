import { requireStaff } from "../lib/permissions.js";
import { sendModLog } from "../lib/modlog.js";
import { okEmbed, warnEmbed, errEmbed, staffEmbed, formatNameList } from "../lib/staff-embed.js";
import { getOnlinePlayers, getRconStatus } from "../modules/rcon/client.js";
import { getPlayerCard, formatPlaytime } from "../modules/rcon/stats.js";
import { getLinkByIgn } from "../modules/rcon/linking.js";
import { teleportPlayer, getPlayerPosition } from "../modules/rcon/teleports.js";
import { getAllActiveBans } from "../modules/bans/manager.js";
import { rconOfflineMessage } from "../lib/rcon-messages.js";

function findOnline(ign) {
  const needle = String(ign || "").toLowerCase();
  return getOnlinePlayers().find((p) => p.ign.toLowerCase() === needle) || null;
}

export async function handlePlayerStaffCommand(interaction) {
  if (!(await requireStaff(interaction))) return;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "lookup") {
      const ign = interaction.options.getString("ign", true).trim();
      const online = findOnline(ign);
      const link = await getLinkByIgn(ign).catch(() => null);
      const card = await getPlayerCard(ign).catch(() => null);
      const bans = await getAllActiveBans().catch(() => []);
      const banned = bans.find((b) => b.ign.toLowerCase() === ign.toLowerCase());

      const fields = [
        { name: "Online", value: online ? "Yes" : "No", inline: true },
        {
          name: "Discord",
          value: link?.discordId ? `<@${link.discordId}>` : "Not linked",
          inline: true,
        },
        {
          name: "Ban",
          value: banned ? `Active — ${banned.reason || "Banned"}` : "None active",
          inline: true,
        },
      ];
      if (card) {
        fields.push(
          { name: "Kills", value: String(card.kills ?? 0), inline: true },
          { name: "Deaths", value: String(card.deaths ?? 0), inline: true },
          { name: "K/D", value: String(card.kd ?? "—"), inline: true },
          {
            name: "Playtime",
            value: formatPlaytime(card.playtimeMs || 0),
            inline: true,
          },
        );
      } else {
        fields.push({ name: "Wipe stats", value: "No tracked stats yet" });
      }

      return interaction.editReply({
        embeds: [
          staffEmbed({
            title: `Player · ${ign}`,
            fields,
            color: banned ? 0xff6b73 : online ? 0x7dcea0 : 0xd7dde6,
          }),
        ],
      });
    }

    if (sub === "tp") {
      if (!getRconStatus().connected) {
        return interaction.editReply({
          embeds: [errEmbed("RCON offline", rconOfflineMessage(getRconStatus()))],
        });
      }
      const ign = interaction.options.getString("player", true).trim();
      const toPlayer = interaction.options.getString("to_player");
      const x = interaction.options.getNumber("x");
      const y = interaction.options.getNumber("y");
      const z = interaction.options.getNumber("z");

      let pos = null;
      if (toPlayer) {
        pos = await getPlayerPosition(toPlayer.trim());
        if (!pos) {
          return interaction.editReply({
            embeds: [errEmbed("Teleport failed", `\`${toPlayer}\` position unavailable (offline?).`)],
          });
        }
      } else if ([x, y, z].every((n) => Number.isFinite(n))) {
        pos = { x, y, z };
      } else {
        return interaction.editReply({
          embeds: [
            warnEmbed(
              "Missing destination",
              "Provide `to_player` **or** coordinates `x` `y` `z`.",
            ),
          ],
        });
      }

      await teleportPlayer(ign, pos);
      await sendModLog(interaction.guild, {
        title: "Force teleport",
        moderatorId: interaction.user.id,
        description: `Teleported \`${ign}\` → (${pos.x}, ${pos.y}, ${pos.z})`,
      });
      return interaction.editReply({
        embeds: [
          okEmbed("Teleported", null, [
            { name: "Player", value: `\`${ign}\``, inline: true },
            {
              name: "Destination",
              value: `\`${Number(pos.x).toFixed(1)}, ${Number(pos.y).toFixed(1)}, ${Number(pos.z).toFixed(1)}\``,
              inline: true,
            },
          ]),
        ],
      });
    }

    return interaction.editReply({ embeds: [errEmbed("Unknown subcommand")] });
  } catch (error) {
    return interaction.editReply({
      embeds: [errEmbed("Player command failed", error.message)],
    });
  }
}

export async function handleBansCommand(interaction) {
  if (!(await requireStaff(interaction))) return;
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "list") {
      const bans = await getAllActiveBans();
      if (!bans.length) {
        return interaction.editReply({
          embeds: [okEmbed("Active bans", "No active bans on record.")],
        });
      }
      const lines = bans.slice(0, 25).map((b) => {
        const when = b.bannedAt ? `<t:${Math.floor(Date.parse(b.bannedAt) / 1000)}:d>` : "?";
        return `• **${b.ign}** — ${b.reason || "Banned"} · ${when}${b.admin ? ` · ${b.admin}` : ""}`;
      });
      return interaction.editReply({
        embeds: [
          staffEmbed({
            title: `Active bans (${bans.length})`,
            description: formatNameList(lines),
            color: 0xff6b73,
            footer: bans.length > 25 ? `Showing 25 of ${bans.length}` : undefined,
          }),
        ],
      });
    }
    return interaction.editReply({ embeds: [errEmbed("Unknown subcommand")] });
  } catch (error) {
    return interaction.editReply({
      embeds: [errEmbed("Bans command failed", error.message)],
    });
  }
}
