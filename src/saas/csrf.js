import { config } from "../config.js";
import { baseDomain } from "./tenancy.js";

function hostFromUrl(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function requestHost(req) {
  const xf = String(req.get?.("x-forwarded-host") || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  return xf || String(req.get?.("host") || "").toLowerCase();
}

function originHost(req) {
  const origin = req.get?.("origin");
  if (origin) return hostFromUrl(origin);
  const referer = req.get?.("referer");
  if (referer) return hostFromUrl(referer);
  return null;
}

function allowedHosts() {
  const hosts = new Set();
  const pub = hostFromUrl(config.saas.publicUrl || config.adminPanel.publicUrl || "");
  if (pub) hosts.add(pub);
  const base = String(baseDomain() || "").toLowerCase();
  if (base) {
    hosts.add(base);
    hosts.add(`www.${base}`);
    hosts.add(`app.${base}`);
  }
  return { hosts, base };
}

function hostAllowed(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  const { hosts, base } = allowedHosts();
  if (hosts.has(h)) return true;
  if (base && (h === base || h.endsWith(`.${base}`))) return true;
  return false;
}

const isProdLike = () =>
  Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) ||
  process.env.NODE_ENV === "production";

/** Block cross-site state changes when Origin/Referer is present or required. */
export function requireSameOrigin(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const path = req.path || req.url || "";
  const guarded =
    path.startsWith("/admin/api") ||
    path.startsWith("/api/signup") ||
    path.startsWith("/api/setup") ||
    path.startsWith("/admin/auth");
  if (!guarded) return next();

  const from = originHost(req);
  const here = requestHost(req);

  if (!from) {
    if (isProdLike()) {
      return res.status(403).json({ ok: false, error: "Missing Origin" });
    }
    return next();
  }

  if (from === here || hostAllowed(from)) return next();
  return res.status(403).json({ ok: false, error: "Cross-origin request blocked" });
}
