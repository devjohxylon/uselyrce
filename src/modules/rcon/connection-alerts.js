import { EmbedBuilder } from "discord.js";
import { resolveChannelId, ensureTenantChannels } from "../../saas/tenant-channels.js";
import { withTenant } from "../../saas/tenant-context.js";
import { getServerOrgId } from "../../saas/rcon/pool.js";

let discordClient = null;
/** @type {Map<string, "up" | "down">} */
const lastState = new Map();
/** @type {Map<string, number>} */
const lastAlertAt = new Map();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

export function startConnectionAlerts(client) {
  discordClient = client;
}

function alertChannelId() {
  return (
    resolveChannelId("announcements") ||
    resolveChannelId("wipes") ||
    resolveChannelId("killfeed") ||
    null
  );
}

async function sendAlert(embed) {
  await ensureTenantChannels().catch(() => {});
  const channelId = alertChannelId();
  if (!discordClient || !channelId) return;
  const channel = await discordClient.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send({ embeds: [embed] }).catch(() => {});
}

/**
 * Track RCON up/down transitions and post Discord alerts (debounced).
 * @param {string} serverId
 * @param {boolean} connected
 * @param {{ name?: string, host?: string, port?: number }} [meta]
 */
export async function noteRconState(serverId, connected, meta = {}) {
  const id = String(serverId || "default");
  const next = connected ? "up" : "down";
  const prev = lastState.get(id);
  if (prev === next) return;
  lastState.set(id, next);

  // First observation — seed state, don't spam on boot.
  if (prev == null) return;

  const now = Date.now();
  const last = lastAlertAt.get(`${id}:${next}`) || 0;
  if (now - last < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(`${id}:${next}`, now);

  const label = meta.name || id;
  const where =
    meta.host && meta.port ? `\`${meta.host}:${meta.port}\`` : null;

  const embed =
    next === "down"
      ? new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle("WebRCON disconnected")
          .setDescription(
            [
              `**${label}** lost its WebRCON connection.`,
              where ? `Endpoint: ${where}` : null,
              "Usely is reconnecting automatically. Check **Workspace → Setup** if this keeps happening.",
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .setTimestamp(new Date())
      : new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("WebRCON back online")
          .setDescription(`**${label}** is connected again.`)
          .setTimestamp(new Date());

  const orgId = getServerOrgId(id);
  if (orgId) {
    await withTenant({ orgId, serverId: id }, () => sendAlert(embed));
  } else {
    await sendAlert(embed);
  }
}
