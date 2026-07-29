import { config } from "../../config.js";

/**
 * Public health summary for the /status page.
 *
 * Deliberately coarse: it reports whether each subsystem works, never how many
 * customers or servers exist, and never a hostname. Anyone can call it.
 */
const ALLOWED_ORIGIN = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:usely\.dev|localhost)(?::\d+)?$/i;

async function rconStatus() {
  if (!config.saas?.enabled) return { state: "operational", detail: "Single-server mode" };

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

export function attachStatusRoute(app, client) {
  app.get("/api/status", async (req, res) => {
    const origin = req.get("origin");
    if (origin && ALLOWED_ORIGIN.test(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set("Cache-Control", "public, max-age=20");

    const discordReady = Boolean(client?.isReady?.());
    const components = {
      panel: { state: "operational", detail: "Responding" },
      discord: discordReady
        ? { state: "operational", detail: "Connected to Discord" }
        : { state: "down", detail: "Not connected to Discord" },
      rcon: await rconStatus(),
    };

    const states = Object.values(components).map((c) => c.state);
    const overall = states.includes("down")
      ? "down"
      : states.includes("degraded")
        ? "degraded"
        : states.includes("unknown")
          ? "degraded"
          : "operational";

    res.json({
      ok: true,
      overall,
      components,
      uptimeSeconds: Math.floor(process.uptime()),
      checkedAt: new Date().toISOString(),
    });
  });
}
