import { config } from "../config.js";

/** Map raw socket/library errors to owner-friendly WebRCON copy. */
export function friendlyRconError(raw, { timedOut = false } = {}) {
  const s = String(raw || "").toLowerCase();
  if (
    s.includes("auth") ||
    s.includes("password") ||
    s.includes("unauthorized") ||
    s.includes("login failed")
  ) {
    return "WebRCON rejected the password — double-check it in your game host panel.";
  }
  if (s.includes("econnrefused") || s.includes("connection refused")) {
    return "Connection refused — is WebRCON enabled, and is the port the WebRCON port (not the game port)?";
  }
  if (
    timedOut ||
    s.includes("etimedout") ||
    s.includes("timed out") ||
    s.includes("timeout")
  ) {
    return "Timed out reaching WebRCON — check host, port, firewall, and that the server is online.";
  }
  if (s.includes("enotfound") || s.includes("getaddrinfo") || s.includes("resolve")) {
    return "Could not resolve that WebRCON hostname.";
  }
  if (s.includes("subscription is not active") || s.includes("plan_required")) {
    return "Subscription is not active — WebRCON stays disconnected until billing is fixed.";
  }
  const trimmed = String(raw || "").trim();
  if (trimmed && trimmed.length < 160 && !/^error:/i.test(trimmed)) return trimmed;
  return "Could not reach WebRCON — check host, port, and password.";
}

/** User-facing copy when WebRCON / game server isn't ready. */
export function rconOfflineMessage(status = {}) {
  if (config.saas?.enabled) {
    if (!status.enabled) {
      return (
        "No WebRCON server is connected for this workspace yet. " +
        "Add one in the Usely panel under **Workspace → Servers** (host, port, password from your game host), " +
        "or finish the setup link you got after signup."
      );
    }
    return (
      `Not connected to the Rust server${status.lastError ? ` — ${status.lastError}` : ""}. ` +
      "Check the server's WebRCON details in **Workspace → Servers**, or use **Reconnect** from platform ops."
    );
  }

  if (!status.enabled) {
    return "RCON isn't configured yet. Add `RCON_HOST`, `RCON_PORT` and `RCON_PASSWORD` to `.env`.";
  }
  return `Not connected to the Rust server${status.lastError ? ` — ${status.lastError}` : ""}.`;
}
