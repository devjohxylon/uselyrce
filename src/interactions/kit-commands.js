import { requireStaff } from "../lib/permissions.js";
import { sendModLog } from "../lib/modlog.js";
import { okEmbed, warnEmbed, errEmbed, staffEmbed, formatNameList } from "../lib/staff-embed.js";
import { listKits, giveKit } from "../modules/rcon/kits.js";
import { getKitLocks, saveKitLocks } from "../modules/rcon/kit-claims.js";

function lockStatusFields(locks, kitsById) {
  const names = (locks.kitIds || []).map((id) => {
    const kit = kitsById.get(id);
    return kit ? `• **${kit.label || id}** (\`${id}\`)` : `• \`${id}\``;
  });
  return [
    {
      name: "Status",
      value: locks.enabled ? "🔒 **Locked** — quick-chat claims paused" : "🔓 **Open** — claims allowed",
      inline: false,
    },
    {
      name: "Ends",
      value: locks.until ? `<t:${Math.floor(Date.parse(locks.until) / 1000)}:f>` : "No end time (manual)",
      inline: true,
    },
    {
      name: "Kits on list",
      value: formatNameList(names, "None selected"),
      inline: false,
    },
  ];
}

export async function handleKitCommand(interaction) {
  if (!(await requireStaff(interaction))) return;

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === "list") {
      const kits = await listKits();
      const locks = await getKitLocks();
      const locked = new Set(locks.kitIds || []);
      if (!kits.length) {
        return interaction.editReply({
          embeds: [warnEmbed("Panel kits", "No panel kits yet. Create some in the admin Kits tab.")],
        });
      }
      const lines = kits.map((k) => {
        const badges = [];
        if (k.claimPhrase) badges.push(`claim: \`${k.claimPhrase}\``);
        else badges.push("no claim phrase");
        if (k.claimRoleId) badges.push("role-gated");
        if (locked.has(k.id) && locks.enabled) badges.push("**LOCKED**");
        else if (locked.has(k.id)) badges.push("on lock list");
        return `• **${k.label || k.id}** (\`${k.id}\`) — ${k.cooldownMinutes || 0}m CD · ${badges.join(" · ")}`;
      });
      return interaction.editReply({
        embeds: [
          staffEmbed({
            title: `Panel kits (${kits.length})`,
            description: lines.join("\n").slice(0, 4000),
            fields: [
              {
                name: "Lock state",
                value: locks.enabled
                  ? `Locked${locks.until ? ` until <t:${Math.floor(Date.parse(locks.until) / 1000)}:R>` : ""}`
                  : "Open",
              },
            ],
          }),
        ],
      });
    }

    if (sub === "give") {
      const ign = interaction.options.getString("player", true).trim();
      const kitId = interaction.options.getString("kit", true).trim();
      const result = await giveKit(ign, kitId, { source: "auto" });
      if (!result.ok) {
        return interaction.editReply({
          embeds: [errEmbed("Give kit failed", result.error || "Unknown error")],
        });
      }
      await sendModLog(interaction.guild, {
        title: "Kit given",
        moderatorId: interaction.user.id,
        description: `Gave \`${result.kitId || kitId}\` to \`${ign}\``,
      });
      return interaction.editReply({
        embeds: [
          okEmbed("Kit given", null, [
            { name: "Player", value: `\`${ign}\``, inline: true },
            { name: "Kit", value: `\`${result.kitId || kitId}\``, inline: true },
            { name: "Source", value: result.source || "auto", inline: true },
          ]),
        ],
      });
    }

    if (sub === "locks") {
      const kits = await listKits();
      const locks = await getKitLocks();
      const kitsById = new Map(kits.map((k) => [k.id, k]));
      return interaction.editReply({
        embeds: [
          staffEmbed({
            title: "Kit locks",
            description:
              "While locked, players cannot claim listed kits via quick chat. Staff `/kit give` still works.",
            fields: lockStatusFields(locks, kitsById),
            color: locks.enabled ? 0xe8c06a : 0x7dcea0,
          }),
        ],
      });
    }

    if (sub === "lock" || sub === "unlock") {
      const enable = sub === "lock";
      const hours = interaction.options.getInteger("hours");
      const current = await getKitLocks();
      let until = current.until;
      if (enable && hours != null && hours > 0) {
        until = new Date(Date.now() + hours * 3600_000).toISOString();
      }
      if (!enable) {
        // keep until + kitIds; just flip off
      }
      if (enable && !(current.kitIds || []).length) {
        return interaction.editReply({
          embeds: [
            warnEmbed(
              "No kits on the lock list",
              "Pick kits in the admin panel **Kit locks** card first, then run `/kit lock`.",
            ),
          ],
        });
      }
      const result = await saveKitLocks({
        enabled: enable,
        until: enable ? until : current.until,
        kitIds: current.kitIds,
      });
      if (!result.ok) {
        return interaction.editReply({
          embeds: [errEmbed("Could not update locks", result.error)],
        });
      }
      const kits = await listKits();
      const kitsById = new Map(kits.map((k) => [k.id, k]));
      await sendModLog(interaction.guild, {
        title: enable ? "Kit locks enabled" : "Kit locks disabled",
        moderatorId: interaction.user.id,
        description: enable
          ? `Paused claims for ${result.kitLocks.kitIds.length} kit(s)`
          : "Quick-chat claims open again",
      });
      return interaction.editReply({
        embeds: [
          (enable ? warnEmbed : okEmbed)(
            enable ? "Kit locks on" : "Kit locks off",
            enable
              ? "Selected kits cannot be claimed via quick chat until you unlock."
              : "Players can claim kits again (list kept for next wipe).",
            lockStatusFields(result.kitLocks, kitsById),
          ),
        ],
      });
    }

    return interaction.editReply({ embeds: [errEmbed("Unknown subcommand")] });
  } catch (error) {
    return interaction.editReply({
      embeds: [errEmbed("Kit command failed", error.message)],
    });
  }
}
