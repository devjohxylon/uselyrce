/**
 * Shared WebRCON endpoint checks for setup + panel.
 * Returns normalized fields or throws Error with a customer-facing message.
 */
export function normalizeRconEndpoint({ name, host, port, password } = {}) {
  const displayName = String(name || "").trim();
  let h = String(host || "").trim();
  let p = port;
  const pw = String(password ?? "");

  if (!displayName) {
    const err = new Error("Enter a server display name.");
    err.code = "RCON_INVALID";
    throw err;
  }
  if (displayName.length > 64) {
    const err = new Error("Server name is too long (max 64 characters).");
    err.code = "RCON_INVALID";
    throw err;
  }

  if (!h) {
    const err = new Error("Enter the WebRCON host (IP or hostname only — no http://).");
    err.code = "RCON_INVALID";
    throw err;
  }

  // Common paste: "1.2.3.4:28016" in the host field
  if (/^[^/\s]+:\d{1,5}$/.test(h) && !h.includes("://")) {
    const i = h.lastIndexOf(":");
    const maybePort = Number(h.slice(i + 1));
    if (Number.isInteger(maybePort) && maybePort >= 1 && maybePort <= 65535) {
      if (p == null || p === "" || Number(p) === 0) p = maybePort;
      h = h.slice(0, i);
    }
  }

  if (/^https?:\/\//i.test(h) || h.includes("/") || /\s/.test(h)) {
    const err = new Error("Host must be an IP or hostname only — no URL, path, or spaces.");
    err.code = "RCON_INVALID";
    throw err;
  }

  if (h.length > 253) {
    const err = new Error("Host is too long.");
    err.code = "RCON_INVALID";
    throw err;
  }

  const portNum = Number(p);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    const err = new Error("Port must be a whole number between 1 and 65535 (WebRCON port, not the game port).");
    err.code = "RCON_INVALID";
    throw err;
  }

  if (!pw) {
    const err = new Error("Enter the WebRCON password from your game host panel.");
    err.code = "RCON_INVALID";
    throw err;
  }
  if (pw.length > 256) {
    const err = new Error("RCON password is too long.");
    err.code = "RCON_INVALID";
    throw err;
  }

  return {
    name: displayName,
    host: h,
    port: portNum,
    password: pw,
  };
}
