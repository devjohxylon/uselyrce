import { config } from "../config.js";

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
