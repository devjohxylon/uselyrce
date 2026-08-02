import crypto from "crypto";
import { config } from "../../config.js";
import { STAFF_PERMISSIONS } from "../../modules/admin/access-keys.js";
import {
  attachSaasServer,
  detachSaasServer,
  runWithServer,
} from "../../modules/rcon/client.js";
import { withCredentials, getServerRaw } from "../db/servers.js";
import {
  botInviteUrl,
  botInviteUrlSimple,
  clearSaasSessionCookie,
  discordAuthorizeUrl,
  exchangeDiscordCode,
  listAccessibleOrgsForCookie,
  resolveSaasSession,
  setSaasSessionCookie,
  readSaasCookie,
} from "./discord-session.js";
import {
  createPasswordResetToken,
  createSetupToken,
  getAccountByEmail,
  getValidPasswordResetToken,
  markPasswordResetTokenUsed,
  setAccountPassword,
} from "../db/accounts.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import {
  createOrg,
  setGuild,
  setDefaultServer,
  getOrg,
  listOrgsOwnedByAccount,
} from "../db/orgs.js";
import {
  createServer,
  deleteServer,
  listServers,
  updateServer,
} from "../db/servers.js";
import { PLAN_LIMITS, PLAN_PRICES_USD, maxServersForPlan } from "../billing/plans.js";
import {
  createCheckoutSession,
  createPortalSession,
} from "../billing/stripe.js";
import { createRateLimiter } from "../rate-limit.js";
import { sendEmail, setupEmailHtml, resetPasswordEmailHtml } from "../email/send.js";

function oauthStates() {
  if (!globalThis.__uselyOAuthStates) globalThis.__uselyOAuthStates = new Map();
  return globalThis.__uselyOAuthStates;
}

function requireOwnerServers(session) {
  return session?.permissions?.servers || session?.role === "owner";
}

const emailLoginLimit = createRateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 });
const forgotLimit = createRateLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 });

export function attachSaasRoutes(app, client) {
  if (!config.saas.enabled) {
    app.get("/admin/auth/discord", (_req, res) => {
      res.status(503).type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Usely</title>
        <style>body{font-family:system-ui;background:#071018;color:#e8f0f4;display:grid;place-items:center;min-height:100vh;margin:0}
        a{color:#2dd4bf}</style></head><body><div style="max-width:28rem;padding:2rem">
        <h1>SaaS mode is off</h1>
        <p>Discord login needs SaaS mode enabled on this deployment. If you're a customer, open your panel at <code>yourname.usely.dev</code>.</p>
        <p><a href="/">← Homepage</a> · <a href="/admin">Staff panel (access key)</a></p>
        </div></body></html>`);
    });
    return;
  }

  app.get("/admin/api/saas/config", (_req, res) => {
    res.json({
      ok: true,
      saas: true,
      plans: PLAN_LIMITS,
      prices: PLAN_PRICES_USD,
      botInviteUrl: botInviteUrlSimple(client),
    });
  });

  /** After Discord bot invite — auto-link guild when redirect_uri is registered. */
  app.get("/admin/auth/bot-installed", async (req, res) => {
    try {
      const err = String(req.query.error || "");
      if (err) {
        return res.redirect(302, "/admin?bot=denied");
      }
      const guildId = String(req.query.guild_id || "").trim();
      const orgId = String(req.query.state || "").trim();
      const session = await resolveSaasSession(req, client);
      if (!session?.orgId || session.role !== "owner") {
        return res.redirect(302, "/admin?bot=login");
      }
      const targetOrg = orgId && orgId === session.orgId ? orgId : session.orgId;
      if (guildId) {
        // Guild join can lag the redirect by a beat — retry fetch briefly.
        let guild = client.guilds.cache.get(guildId) || null;
        for (let i = 0; i < 5 && !guild; i++) {
          await new Promise((r) => setTimeout(r, 400));
          guild = await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) {
          return res.redirect(302, `/admin?bot=pending&guild=${encodeURIComponent(guildId)}`);
        }
        await setGuild(targetOrg, guildId);
        return res.redirect(302, "/admin?bot=linked");
      }
      return res.redirect(302, "/admin?bot=ok");
    } catch (error) {
      console.error("Bot install callback failed:", error.message);
      return res.redirect(302, "/admin?bot=error");
    }
  });

  app.get("/admin/auth/discord", async (_req, res) => {
    if (config.saas.mock) {
      const { MOCK_USER } = await import("../mock.js");
      setSaasSessionCookie(res, {
        discordUserId: MOCK_USER.discordUserId,
        username: MOCK_USER.username,
        guildIds: [],
      });
      return res.redirect(302, "/admin");
    }
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates().set(state, Date.now());
    res.redirect(302, discordAuthorizeUrl(state));
  });

  app.post("/admin/auth/email", async (req, res) => {
    try {
      const ip = emailLoginLimit.clientIp(req);
      const gate = emailLoginLimit.check(ip);
      if (!gate.ok) {
        return res.status(429).json({
          ok: false,
          error: `Too many attempts. Try again in ${gate.retryAfterSec}s.`,
        });
      }
      const email = String(req.body?.email || "").toLowerCase().trim();
      const password = String(req.body?.password || "");
      const account = email ? await getAccountByEmail(email) : null;
      if (!account?.password_hash || !verifyPassword(password, account.password_hash)) {
        emailLoginLimit.fail(ip);
        return res.status(401).json({ ok: false, error: "Invalid email or password" });
      }
      emailLoginLimit.clear(ip);
      setSaasSessionCookie(res, {
        accountId: account.id,
        email: account.email,
        username: account.email.split("@")[0],
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/admin/auth/forgot-password", async (req, res) => {
    try {
      const ip = forgotLimit.clientIp(req);
      const gate = forgotLimit.check(ip);
      if (!gate.ok) {
        return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
      }
      forgotLimit.fail(ip);
      const email = String(req.body?.email || "").toLowerCase().trim();
      const account = email ? await getAccountByEmail(email) : null;
      // Always succeed — don't leak whether the email exists.
      if (account?.password_hash) {
        const token = await createPasswordResetToken(account.id);
        const resetUrl = `${config.saas.publicUrl.replace(/\/$/, "")}/admin?reset=${token}`;
        await sendEmail({
          to: account.email,
          subject: "Reset your Usely password",
          html: resetPasswordEmailHtml({ resetUrl }),
          text: `Reset your Usely password: ${resetUrl}`,
        });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("forgot-password failed:", error.message);
      res.status(500).json({ ok: false, error: "Could not start password reset" });
    }
  });

  app.post("/admin/auth/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      const password = String(req.body?.password || "");
      if (password.length < 8) {
        return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
      }
      const row = await getValidPasswordResetToken(token);
      if (!row) {
        return res.status(400).json({ ok: false, error: "Reset link is invalid or expired" });
      }
      await setAccountPassword(row.account_id, hashPassword(password));
      await markPasswordResetTokenUsed(token);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/admin/auth/resend-setup", async (req, res) => {
    try {
      const ip = forgotLimit.clientIp(req);
      const gate = forgotLimit.check(ip);
      if (!gate.ok) {
        return res.status(429).json({ ok: false, error: "Too many requests. Try again later." });
      }
      forgotLimit.fail(ip);
      const email = String(req.body?.email || "").toLowerCase().trim();
      const account = email ? await getAccountByEmail(email) : null;
      if (account && !account.password_hash) {
        const orgs = await listOrgsOwnedByAccount(account.id);
        const org = orgs[0];
        if (org) {
          const token = await createSetupToken({ accountId: account.id, orgId: org.id });
          const setupUrl = `${config.saas.publicUrl.replace(/\/$/, "")}/setup?token=${token}`;
          await sendEmail({
            to: account.email,
            subject: "Finish setting up your Usely workspace",
            html: setupEmailHtml({ setupUrl, plan: org.plan || "basic" }),
            text: `Finish setup: ${setupUrl}`,
          });
        }
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("resend-setup failed:", error.message);
      res.status(500).json({ ok: false, error: "Could not resend setup link" });
    }
  });

  app.get("/admin/auth/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || !state || !oauthStates().has(String(state))) {
        return res.status(400).send("Invalid OAuth state. Try logging in again.");
      }
      oauthStates().delete(String(state));
      const profile = await exchangeDiscordCode(String(code));
      setSaasSessionCookie(res, {
        discordUserId: profile.discordUserId,
        username: profile.globalName || profile.username,
        guildIds: profile.guildIds,
      });
      res.redirect(302, "/admin");
    } catch (error) {
      console.error("Discord OAuth callback failed:", error.message);
      res.status(500).send(`Login failed: ${error.message}`);
    }
  });

  app.get("/admin/api/saas/session", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session) return res.json({ ok: true, authed: false, saas: true });
    return res.json({
      ok: true,
      authed: true,
      saas: true,
      role: session.role,
      label: session.label,
      permissions: session.permissions,
      orgId: session.orgId,
      org: session.org
        ? {
            id: session.org.id,
            name: session.org.name,
            plan: session.org.plan,
            planStatus: session.org.plan_status,
            guildId: session.org.discord_guild_id,
            maxServers: maxServersForPlan(session.org.plan),
          }
        : null,
      serverId: session.serverId,
      servers: session.servers || [],
      needsOnboarding: session.needsOnboarding,
      staffPermissionDefaults: STAFF_PERMISSIONS,
      botInviteUrl: botInviteUrl(session.orgId, client),
    });
  });

  app.post("/admin/api/saas/logout", async (_req, res) => {
    clearSaasSessionCookie(res);
    res.json({ ok: true });
  });

  app.post("/admin/api/saas/context", async (req, res) => {
    const cookie = readSaasCookie(req);
    if (!cookie?.discordUserId && !cookie?.accountId && !cookie?.keyId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const orgId = req.body?.orgId || cookie.orgId;
    const serverId = req.body?.serverId || cookie.serverId || null;

    if (cookie.keyId) {
      if (orgId && cookie.orgId && orgId !== cookie.orgId) {
        return res.status(403).json({ error: "No access to org" });
      }
      setSaasSessionCookie(res, { ...cookie, orgId: cookie.orgId, serverId });
      return res.json({ ok: true, orgId: cookie.orgId, serverId });
    }

    if (orgId) {
      const accessible = await listAccessibleOrgsForCookie(client, cookie);
      const entry = accessible.find((a) => a.org.id === orgId);
      if (!entry) {
        const org = await getOrg(orgId);
        const ownsByDiscord =
          org && cookie.discordUserId && org.owner_discord_id === String(cookie.discordUserId);
        const ownsByAccount =
          org && cookie.accountId && org.owner_account_id === cookie.accountId;
        if (!ownsByDiscord && !ownsByAccount) {
          return res.status(403).json({ error: "No access to org" });
        }
      }
    }

    setSaasSessionCookie(res, { ...cookie, orgId, serverId });
    res.json({ ok: true, orgId, serverId });
  });

  app.get("/admin/api/saas/orgs", async (req, res) => {
    const cookie = readSaasCookie(req);
    if (!cookie?.discordUserId && !cookie?.accountId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const accessible = await listAccessibleOrgsForCookie(client, cookie);
    res.json({
      ok: true,
      orgs: accessible.map((a) => ({
        id: a.org.id,
        name: a.org.name,
        plan: a.org.plan,
        planStatus: a.org.plan_status,
        guildId: a.org.discord_guild_id,
        isOwner: a.isOwner,
      })),
    });
  });

  app.post("/admin/api/saas/orgs", async (req, res) => {
    const cookie = readSaasCookie(req);
    if (!cookie?.discordUserId && !cookie?.accountId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name required" });
    const org = await createOrg({
      name,
      ownerDiscordId: cookie.discordUserId || null,
      ownerAccountId: cookie.accountId || null,
    });
    setSaasSessionCookie(res, { ...cookie, orgId: org.id });
    res.json({ ok: true, org, botInviteUrl: botInviteUrl(org.id, client) });
  });

  app.post("/admin/api/saas/orgs/:id/guild", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session || session.orgId !== req.params.id || !requireOwnerServers(session)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const guildId = String(req.body?.guildId || "").trim();
    if (!guildId) return res.status(400).json({ error: "guildId required" });
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      return res.status(400).json({
        error: "Bot is not in that Discord server yet. Invite the bot first.",
        botInviteUrl: botInviteUrl(req.params.id, client),
      });
    }
    const org = await setGuild(req.params.id, guildId);
    res.json({ ok: true, org });
  });

  app.get("/admin/api/saas/servers", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session?.orgId) return res.status(401).json({ error: "Unauthorized" });
    const servers = await listServers(session.orgId);
    res.json({ ok: true, servers });
  });

  app.post("/admin/api/saas/servers", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session?.orgId || !requireOwnerServers(session)) {
      return res.status(403).json({ error: "Owner only" });
    }
    try {
      const endpoint = (await import("../rcon/endpoint.js")).normalizeRconEndpoint({
        name: req.body?.name,
        host: req.body?.host,
        port: req.body?.port,
        password: req.body?.password,
      });
      const server = await createServer(session.orgId, endpoint);
      let rcon = { connected: config.saas.mock, lastError: null };
      if (!config.saas.mock) {
        const { attachSaasServerAndWait } = await import("../../modules/rcon/client.js");
        const raw = await getServerRaw(server.id);
        rcon = await attachSaasServerAndWait(withCredentials(raw)).catch((e) => ({
          connected: false,
          lastError: e.message,
        }));
      }
      res.json({
        ok: true,
        server,
        connected: Boolean(rcon.connected),
        warning: rcon.connected
          ? null
          : rcon.lastError ||
            "Saved, but WebRCON did not connect yet. Check host, port, and password.",
      });
    } catch (error) {
      const status =
        error.code === "SERVER_LIMIT" || error.code === "PLAN_REQUIRED" ? 402 : 400;
      res.status(status).json({ error: error.message, code: error.code });
    }
  });

  app.patch("/admin/api/saas/servers/:id", async (req, res) => {
    try {
      const session = await resolveSaasSession(req, client);
      if (!session?.orgId || !requireOwnerServers(session)) {
        return res.status(403).json({ error: "Owner only" });
      }
      const server = await updateServer(session.orgId, req.params.id, req.body || {});
      if (!config.saas.mock && (req.body?.password || req.body?.host || req.body?.port)) {
        detachSaasServer(req.params.id);
        const raw = await getServerRaw(req.params.id);
        if (raw?.enabled && raw.org_id === session.orgId) {
          await attachSaasServer(withCredentials(raw)).catch(() => {});
        }
      }
      res.json({ ok: true, server });
    } catch (error) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: error.message, code: error.code });
    }
  });

  app.delete("/admin/api/saas/servers/:id", async (req, res) => {
    try {
      const session = await resolveSaasSession(req, client);
      if (!session?.orgId || !requireOwnerServers(session)) {
        return res.status(403).json({ error: "Owner only" });
      }
      detachSaasServer(req.params.id);
      await deleteServer(session.orgId, req.params.id);
      res.json({ ok: true });
    } catch (error) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: error.message, code: error.code });
    }
  });

  app.post("/admin/api/saas/servers/:id/default", async (req, res) => {
    try {
      const session = await resolveSaasSession(req, client);
      if (!session?.orgId || !requireOwnerServers(session)) {
        return res.status(403).json({ error: "Owner only" });
      }
      const org = await setDefaultServer(session.orgId, req.params.id);
      res.json({ ok: true, org });
    } catch (error) {
      const status = error.code === "NOT_FOUND" ? 404 : 400;
      res.status(status).json({ error: error.message, code: error.code });
    }
  });

  const roleMapsGone = (_req, res) => {
    res.status(410).json({
      error: "Discord role maps were removed. Create staff access keys under Workspace → Staff keys.",
    });
  };
  app.all("/admin/api/saas/role-maps", roleMapsGone);
  app.all("/admin/api/saas/role-maps/:roleId", roleMapsGone);

  app.post("/admin/api/saas/billing/checkout", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session?.orgId || !session.permissions?.billing) {
      return res.status(403).json({ error: "Owner only" });
    }
    try {
      const plan = String(req.body?.plan || "basic");
      const url = await createCheckoutSession(session.org, plan);
      res.json({ ok: true, url });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/admin/api/saas/billing/portal", async (req, res) => {
    const session = await resolveSaasSession(req, client);
    if (!session?.orgId || !session.permissions?.billing) {
      return res.status(403).json({ error: "Owner only" });
    }
    try {
      const url = await createPortalSession(session.org);
      res.json({ ok: true, url });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
}

export async function resolvePanelSession(req, client) {
  if (config.saas.enabled) {
    return resolveSaasSession(req, client);
  }
  const { resolveSession } = await import("../../modules/admin/access-keys.js");
  return resolveSession(req);
}

export function withActiveServer(req, _res, next) {
  if (!config.saas.enabled || !req.session?.serverId) return next();
  return runWithServer(req.session.serverId, () => next());
}
