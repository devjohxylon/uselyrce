/**
 * Shared WebRCON endpoint checks for setup + panel.
 * Returns normalized fields or throws Error with a customer-facing message.
 */
import dns from "dns/promises";

function isBlockedHost(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (
    h === "localhost" ||
    h === "metadata" ||
    h === "metadata.google.internal" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }

  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const parts = m.slice(1).map(Number);
    if (parts.some((n) => n > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  if (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) {
    return true;
  }

  return false;
}

function isBlockedIp(address) {
  const a = String(address || "").toLowerCase();
  if (a.includes(":")) {
    if (a === "::1" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")) {
      return true;
    }
    return false;
  }
  return isBlockedHost(a);
}

export function normalizeRconEndpointSync({ name, host, port, password } = {}) {
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

  if (isBlockedHost(h)) {
    const err = new Error(
      "That host looks like a private or local address. Use your game host’s public WebRCON IP or hostname.",
    );
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

/** Normalize + resolve DNS; reject private/metadata addresses after lookup. */
export async function normalizeRconEndpoint(input = {}) {
  const endpoint = normalizeRconEndpointSync(input);
  const h = endpoint.host;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h) || h.includes(":")) {
    if (isBlockedIp(h)) {
      const err = new Error(
        "That host looks like a private or local address. Use your game host’s public WebRCON IP or hostname.",
      );
      err.code = "RCON_INVALID";
      throw err;
    }
    return endpoint;
  }

  let records;
  try {
    records = await dns.lookup(h, { all: true, verbatim: true });
  } catch {
    const err = new Error("Could not resolve that WebRCON hostname.");
    err.code = "RCON_INVALID";
    throw err;
  }
  if (!records?.length) {
    const err = new Error("Could not resolve that WebRCON hostname.");
    err.code = "RCON_INVALID";
    throw err;
  }
  for (const rec of records) {
    if (isBlockedIp(rec.address)) {
      const err = new Error(
        "That hostname resolves to a private or local address. Use your game host’s public WebRCON endpoint.",
      );
      err.code = "RCON_INVALID";
      throw err;
    }
  }
  return endpoint;
}
