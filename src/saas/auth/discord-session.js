import crypto from "crypto";
import { config } from "../../config.js";
import { OWNER_PERMISSIONS } from "../../modules/admin/access-keys.js";
import {
  getOrg,
  listOrgsOwnedBy,
  listOrgsOwnedByAccount,
} from "../db/orgs.js";
import { listServers } from "../db/servers.js";
import { resolveOrgAccessKey } from "../db/org-keys.js";
import { baseDomain } from "../tenancy.js";

const COOKIE = "usely_saas";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function signingSecret() {
  return (
    config.adminPanel.sessionSecret ||
    config.saas.discordOAuthClientSecret ||
    "usely-saas"
  );
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.get?.("cookie") ?? req.headers?.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }),
  );
}

function cookieAttrs() {
  const secure =
    process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";
  // Share the session across <slug>.usely.dev subdomains in production.
  // localhost stays host-only (browsers reject Domain=.localhost).
  const base = baseDomain();
  const domain = base.includes(".") ? `; Domain=.${base}` : "";
  return `${secure}${domain}`;
}

export function setSaasSessionCookie(res, payload) {
  const token = sign({ ...payload, exp: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${cookieAttrs()}`,
  );
}

export function clearSaasSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieAttrs()}`);
}

export function readSaasCookie(req) {
  return verify(parseCookies(req)[COOKIE]);
}

export function discordAuthorizeUrl(state) {
  const clientId = config.saas.discordOAuthClientId || config.discord.clientId;
  const redirect = `${config.saas.publicUrl.replace(/\/$/, "")}/admin/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

function resolveBotClientId(discordClient = null) {
  const live =
    discordClient?.application?.id ||
    discordClient?.user?.id ||
    null;
  const configured = config.discord.clientId || null;
  if (live && configured && live !== configured && !resolveBotClientId._warned) {
    resolveBotClientId._warned = true;
    console.warn(
      `DISCORD_CLIENT_ID=${configured} does not match the running bot (${live}). Invite links will use the running bot — update Railway DISCORD_CLIENT_ID to ${live}.`,
    );
  }
  return live || configured || config.saas.discordOAuthClientId || null;
}

export function botInviteUrl(orgId, discordClient = null) {
  const clientId = resolveBotClientId(discordClient);
  if (!clientId) return "";
  const redirect = `${String(config.saas.publicUrl || "").replace(/\/$/, "")}/admin/auth/bot-installed`;
  const params = new URLSearchParams({
    client_id: clientId,
    // Administrator — tickets, channel rename, feeds, moderation need broad guild access.
    permissions: "8",
    scope: "bot applications.commands",
    redirect_uri: redirect,
    response_type: "code",
    state: orgId || "",
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

/** Invite URL without redirect — works even before OAuth redirect is registered. */
export function botInviteUrlSimple(discordClient = null) {
  const clientId = resolveBotClientId(discordClient);
  if (!clientId) return "";
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: "8",
    scope: "bot applications.commands",
  });
  return `https://discord.com/api/oauth2/authorize?${params}`;
}

export async function exchangeDiscordCode(code) {
  const clientId = config.saas.discordOAuthClientId || config.discord.clientId;
  const redirect = `${config.saas.publicUrl.replace(/\/$/, "")}/admin/auth/callback`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: config.saas.discordOAuthClientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirect,
  });
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Discord token exchange failed: ${text}`);
  }
  const tokens = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error("Failed to fetch Discord user");
  const user = await userRes.json();

  const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const guilds = guildsRes.ok ? await guildsRes.json() : [];

  return {
    discordUserId: user.id,
    username: user.username,
    globalName: user.global_name || user.username,
    avatar: user.avatar,
    guildIds: (guilds || []).map((g) => g.id),
    accessToken: tokens.access_token,
  };
}

/**
 * Discord OAuth only unlocks orgs the user owns. Staff use access keys.
 */
export async function listAccessibleOrgs(_discordClient, discordUserId, _guildIdsFromOAuth = []) {
  const owned = await listOrgsOwnedBy(discordUserId);
  return owned.map((org) => ({
    org,
    isOwner: true,
    permissions: { ...OWNER_PERMISSIONS, servers: true, billing: true },
  }));
}

function ownerEntry(org) {
  return {
    org,
    isOwner: true,
    permissions: { ...OWNER_PERMISSIONS, servers: true, billing: true },
  };
}

/** Accessible orgs for whichever identity the cookie carries. */
export async function listAccessibleOrgsForCookie(discordClient, cookie) {
  if (cookie?.accountId) {
    const owned = await listOrgsOwnedByAccount(cookie.accountId);
    return owned.map(ownerEntry);
  }
  if (cookie?.discordUserId) {
    return listAccessibleOrgs(discordClient, cookie.discordUserId, cookie.guildIds || []);
  }
  return [];
}

async function sessionForOrgEntry(entry, cookie, req) {
  const servers = entry.org ? await listServers(entry.org.id) : [];
  let serverId =
    req.get?.("x-server-id") ||
    cookie.serverId ||
    entry.org.default_server_id ||
    servers[0]?.id ||
    null;
  if (serverId && !servers.some((s) => s.id === serverId)) {
    serverId = servers[0]?.id || null;
  }
  return {
    role: entry.isOwner ? "owner" : "staff",
    discordUserId: cookie.discordUserId || null,
    accountId: cookie.accountId || null,
    keyId: cookie.keyId || null,
    label: entry.label || cookie.username || cookie.email || "Staff",
    orgId: entry.org.id,
    org: entry.org,
    serverId,
    servers,
    permissions: entry.permissions,
    needsOnboarding: false,
  };
}

async function resolveKeySaasSession(req, cookie) {
  const hostOrg = req.orgFromHost || null;
  if (hostOrg && cookie.orgId && hostOrg.id !== cookie.orgId) return null;
  const orgId = hostOrg?.id || cookie.orgId;
  if (!orgId) return null;

  const key = await resolveOrgAccessKey(orgId, cookie.keyId);
  if (!key) return null;
  const org = hostOrg || (await getOrg(orgId));
  if (!org) return null;
  return sessionForOrgEntry(
    { org, isOwner: false, permissions: key.permissions, label: key.label },
    { ...cookie, orgId },
    req,
  );
}

export async function resolveSaasSession(req, discordClient) {
  const cookie = readSaasCookie(req);
  if (!cookie) return null;

  if (cookie.keyId && cookie.orgId) {
    return resolveKeySaasSession(req, cookie);
  }

  if (!cookie.discordUserId && !cookie.accountId) return null;

  let accessible;
  if (cookie.accountId) {
    const owned = await listOrgsOwnedByAccount(cookie.accountId);
    accessible = owned.map(ownerEntry);
  } else {
    accessible = await listAccessibleOrgs(
      discordClient,
      cookie.discordUserId,
      cookie.guildIds || [],
    );
  }

  let entry = null;
  const hostOrg = req.orgFromHost || null;
  if (hostOrg) {
    entry = accessible.find((a) => a.org.id === hostOrg.id) || null;
    if (!entry) return null;
  } else {
    const activeOrgId = cookie.orgId || req.get?.("x-org-id") || null;
    entry = accessible.find((a) => a.org.id === activeOrgId) || accessible[0] || null;
  }

  if (!entry) {
    const owned = cookie.discordUserId
      ? await listOrgsOwnedBy(cookie.discordUserId)
      : [];
    if (owned[0]) {
      entry = ownerEntry(owned[0]);
    } else {
      return {
        role: "saas_user",
        discordUserId: cookie.discordUserId || null,
        accountId: cookie.accountId || null,
        label: cookie.username || cookie.email || "User",
        orgId: null,
        serverId: null,
        permissions: {},
        needsOnboarding: true,
      };
    }
  }

  return sessionForOrgEntry(entry, cookie, req);
}

export async function refreshOrgSession(req, _discordClient, { orgId, serverId } = {}) {
  const cookie = readSaasCookie(req);
  if (!cookie?.discordUserId && !cookie?.accountId && !cookie?.keyId) return null;
  return {
    ...cookie,
    orgId: orgId ?? cookie.orgId,
    serverId: serverId ?? cookie.serverId,
  };
}

export { getOrg };
