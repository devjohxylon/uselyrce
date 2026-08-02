import { config } from "../../config.js";
import { getPersistenceHealth } from "../../data/store.js";

/**
 * Public health summary for the /status page.
 *
 * Platform mode: coarse subsystem health (no customer counts).
 * Org subdomain: that workspace's Discord link + its RCON servers.
 */
const ALLOWED_ORIGIN = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:usely\.dev|localhost)(?::\d+)?$/i;

async function platformRconStatus() {
  if (!config.saas?.enabled) {
    try {
      const { getRconStatus } = await import("../../modules/rcon/client.js");
      const s = getRconStatus();
      if (!s.enabled) return { state: "operational", detail: "No RCON configured" };
      return s.connected
        ? { state: "operational", detail: "Connected" }
        : { state: "down", detail: "Disconnected — reconnecting" };
    } catch {
      return { state: "unknown", detail: "Could not read connection state" };
    }
  }

  try {
    const { getPoolHealth } = await import("../../saas/rcon/pool.js");
    const { attached, connected } = getPoolHealth();

    if (attached === 0) return { state: "operational", detail: "No servers connected" };
    if (connected === attached) return { state: "operational", detail: "All connections live" };
    if (connected === 0) return { state: "down", detail: "No connections established" };
    return { state: "degraded", detail: "Some connections retrying" };
  } catch {
    return { state: "unknown", detail: "Could not read connection state" };
  }
}

async function orgStatus(org, client) {
  const { listServers } = await import("../../saas/db/servers.js");
  const { getPoolStatus } = await import("../../saas/rcon/pool.js");
  const servers = await listServers(org.id);
  const enabled = servers.filter((s) => s.enabled !== false);
  let connected = 0;
  for (const s of enabled) {
    const st = getPoolStatus(s.id);
    if (st?.connected) connected += 1;
  }

  const guildId = org.discord_guild_id;
  const guildOk = Boolean(guildId && client?.guilds?.cache?.has?.(guildId));

  let rcon;
  if (enabled.length === 0) {
    rcon = { state: "degraded", detail: "No WebRCON servers added yet" };
  } else if (connected === enabled.length) {
    rcon = { state: "operational", detail: `${connected}/${enabled.length} servers live` };
  } else if (connected === 0) {
    rcon = { state: "down", detail: `0/${enabled.length} servers connected` };
  } else {
    rcon = { state: "degraded", detail: `${connected}/${enabled.length} servers live` };
  }

  return {
    scope: "org",
    org: { name: org.name, slug: org.slug },
    components: {
      panel: { state: "operational", detail: "Workspace panel responding" },
      discord: guildOk
        ? { state: "operational", detail: "Bot linked to your Discord" }
        : guildId
          ? { state: "degraded", detail: "Guild linked but bot not in server" }
          : { state: "degraded", detail: "Discord not linked yet" },
      rcon,
    },
    poweredBy: "Usely",
  };
}

function overallFrom(components) {
  const states = Object.values(components).map((c) => c.state);
  if (states.includes("down")) return "down";
  if (states.includes("degraded") || states.includes("unknown")) return "degraded";
  return "operational";
}

export function attachStatusRoute(app, client) {
  app.get("/api/status", async (req, res) => {
    const origin = req.get("origin");
    if (origin && ALLOWED_ORIGIN.test(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set("Cache-Control", "public, max-age=20");

    const org = req.orgFromHost || null;
    if (org) {
      try {
        const body = await orgStatus(org, client);
        return res.json({
          ok: true,
          overall: overallFrom(body.components),
          ...body,
          uptimeSeconds: Math.floor(process.uptime()),
          checkedAt: new Date().toISOString(),
        });
      } catch (error) {
        return res.status(500).json({ ok: false, error: error.message });
      }
    }

    const discordReady = Boolean(client?.isReady?.());
    const persistence = getPersistenceHealth();
    const components = {
      panel: { state: "operational", detail: "Responding" },
      discord: discordReady
        ? { state: "operational", detail: "Connected to Discord" }
        : { state: "down", detail: "Not connected to Discord" },
      rcon: await platformRconStatus(),
    };

    // Persistence is ops-facing — include on platform status only.
    if (persistence.onRailway) {
      components.persistence = {
        state: persistence.ok ? "operational" : "degraded",
        detail: persistence.detail,
      };
    }

    res.json({
      ok: true,
      scope: "platform",
      overall: overallFrom(components),
      components,
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    });
  });
}
