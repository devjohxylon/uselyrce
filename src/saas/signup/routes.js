import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import {
  getAccount,
  getValidSetupToken,
  markSetupTokenUsed,
  setAccountPassword,
  shortenSetupToken,
  createExchangeToken,
  consumeExchangeToken,
} from "../db/accounts.js";
import { getOrg, getOrgBySlug, setGuild, updateOrgFields } from "../db/orgs.js";
import {
  createServer,
  listServers,
  withCredentials,
  getServerRaw,
} from "../db/servers.js";
import { hashPassword } from "../auth/passwords.js";
import {
  botInviteUrlSimple,
  setSaasSessionCookie,
} from "../auth/discord-session.js";
import { baseDomain, orgPanelUrl, slugProblem } from "../tenancy.js";
import { maxServersForPlan } from "../billing/plans.js";
import { finalizeSignup } from "./finalize.js";
const SITE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../server/site",
);
const SIGNUP_HTML = readFileSync(path.join(SITE_DIR, "signup.html"), "utf8");
const SETUP_HTML = readFileSync(path.join(SITE_DIR, "setup.html"), "utf8");

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** createOrg assigns `name-xxxxxx` slugs; a chosen panel address replaces that. */
function isAutoSlug(slug) {
  return /^[a-z0-9-]+-[a-z0-9]{6}$/.test(String(slug || ""));
}

async function setupContext(token) {
  const row = await getValidSetupToken(String(token || ""));
  if (!row) return null;
  const [account, org] = await Promise.all([
    getAccount(row.account_id),
    getOrg(row.org_id),
  ]);
  if (!account || !org) return null;
  const servers = await listServers(org.id);
  return { row, account, org, servers };
}

function inferStep(account, org, servers) {
  const workspaceDone = Boolean(account.password_hash) && org.slug && !isAutoSlug(org.slug);
  if (!workspaceDone) return "workspace";
  if (!org.discord_guild_id) return "discord";
  if (!servers.length) return "server";
  return "review";
}

function publicServers(servers) {
  return (servers || []).map((s) => ({
    id: s.id,
    name: s.name,
    host: s.rcon_host,
    port: s.rcon_port,
  }));
}

export function attachSignupRoutes(app, client = null) {
  if (!config.saas.enabled) return;

  app.get("/signup", (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(SIGNUP_HTML);
  });
  app.get("/setup", (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(SETUP_HTML);
  });

  app.get("/signup/sent", (_req, res) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.type("html").send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Check your email — Usely</title>
      <style>body{font-family:"Space Grotesk",system-ui,sans-serif;background:#050506;color:#f0f2f5;display:grid;place-items:center;min-height:100vh;margin:0}
      a{color:#d7dde6}</style>
      <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};va("event",{name:"signup_paid"});</script>
      <script defer src="/_vercel/insights/script.js"></script>
      </head><body><div style="max-width:26rem;padding:2rem;text-align:center">
      <h1 style="font-weight:600">Check your email</h1>
      <p style="color:#9aa0ab;line-height:1.6">Payment received. We emailed you a setup link — open it to pick your panel address, invite the Discord bot, and connect WebRCON.</p>
      <p><a href="https://www.usely.dev/">← usely.dev</a></p></div></body></html>`);
  });

  app.post("/api/signup/checkout", async (req, res) => {
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      const plan = ["basic", "pro", "network"].includes(req.body?.plan)
        ? req.body.plan
        : "basic";
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, error: "Enter a valid email address." });
      }

      // Local SAAS_MOCK only — never skip Stripe on the public signup path
      // (ops free preview lives at POST /api/ops/preview-setup).
      if (config.saas.mock) {
        const { setupUrl } = await finalizeSignup({
          email,
          plan,
          skipEmail: true,
        });
        return res.json({ ok: true, mock: true, setupUrl });
      }

      const { createSignupCheckout } = await import("../billing/stripe.js");
      const url = await createSignupCheckout(email, plan);
      res.json({ ok: true, url });
    } catch (error) {
      console.error("Signup checkout failed:", error.message);
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/setup/info", async (req, res) => {
    const ctx = await setupContext(req.query.token);
    if (!ctx) return res.status(404).json({ ok: false, error: "Invalid or expired link" });
    const { account, org, servers } = ctx;
    res.json({
      ok: true,
      email: account.email,
      plan: org.plan,
      hasPassword: Boolean(account.password_hash),
      baseDomain: baseDomain(),
      orgName: isAutoSlug(org.slug) ? "" : org.name,
      slug: isAutoSlug(org.slug) ? "" : org.slug,
      guildId: org.discord_guild_id || null,
      servers: publicServers(servers),
      maxServers: maxServersForPlan(org.plan),
      botInviteUrl: botInviteUrlSimple(client),
      step: inferStep(account, org, servers),
    });
  });

  app.get("/api/setup/slug", async (req, res) => {
    const slug = String(req.query.slug || "").toLowerCase().trim();
    const problem = slugProblem(slug);
    if (problem) return res.json({ available: false, reason: problem, baseDomain: baseDomain() });
    const token = String(req.query.token || "");
    const ctx = token ? await setupContext(token) : null;
    const existing = await getOrgBySlug(slug);
    const available = !existing || (ctx && existing.id === ctx.org.id);
    res.json({
      available,
      reason: available ? null : "That address is taken.",
      baseDomain: baseDomain(),
    });
  });

  /** Step 1 — workspace name, slug, password. Token stays valid for later steps. */
  app.post("/api/setup/workspace", async (req, res) => {
    try {
      const ctx = await setupContext(req.body?.token);
      if (!ctx) return res.status(400).json({ ok: false, error: "Invalid or expired link" });

      const orgName = String(req.body?.orgName || "").trim();
      const slug = String(req.body?.slug || "").toLowerCase().trim();
      const password = req.body?.password;
      if (!orgName) return res.status(400).json({ ok: false, error: "Workspace name required" });
      const problem = slugProblem(slug);
      if (problem) return res.status(400).json({ ok: false, error: problem });

      let { account, org } = ctx;
      if (slug !== org.slug) {
        const taken = await getOrgBySlug(slug);
        if (taken && taken.id !== org.id) {
          return res.status(409).json({ ok: false, error: "That address is taken." });
        }
      }

      if (!account.password_hash) {
        if (!password || String(password).length < 8) {
          return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
        }
        if (String(password).length > 128) {
          return res.status(400).json({ ok: false, error: "Password must be at most 128 characters" });
        }
        account = await setAccountPassword(account.id, hashPassword(password));
        await shortenSetupToken(req.body?.token);
      }

      const updated = await updateOrgFields(org.id, { name: orgName, slug });
      setSaasSessionCookie(res, {
        accountId: account.id,
        email: account.email,
        username: account.email.split("@")[0],
        orgId: org.id,
        sv: Number(account.session_version ?? 0),
      });

      res.json({
        ok: true,
        step: updated.discord_guild_id ? (ctx.servers.length ? "review" : "server") : "discord",
        org: { id: updated.id, name: updated.name, slug: updated.slug },
        botInviteUrl: botInviteUrlSimple(client),
        maxServers: maxServersForPlan(updated.plan),
      });
    } catch (error) {
      console.error("Setup workspace failed:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** Step 2 — link Discord guild after inviting the bot. */
  app.post("/api/setup/guild", async (req, res) => {
    try {
      const ctx = await setupContext(req.body?.token);
      if (!ctx) return res.status(400).json({ ok: false, error: "Invalid or expired link" });
      const { account, org, servers } = ctx;
      if (inferStep(account, org, servers) === "workspace") {
        return res.status(400).json({ ok: false, error: "Finish workspace setup first" });
      }

      const guildId = String(req.body?.guildId || "").trim();
      if (!/^\d{5,32}$/.test(guildId)) {
        return res.status(400).json({ ok: false, error: "Enter a valid Discord guild ID" });
      }

      const discord = client || req.app?.locals?.discordClient || null;
      if (discord) {
        let guild = discord.guilds.cache.get(guildId) || null;
        for (let i = 0; i < 5 && !guild; i++) {
          await new Promise((r) => setTimeout(r, 400));
          guild = await discord.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) {
          return res.status(400).json({
            ok: false,
            error: "Bot is not in that Discord yet. Click Invite Discord bot, authorize, then try again.",
            botInviteUrl: botInviteUrlSimple(client),
          });
        }
      }

      const updated = await setGuild(org.id, guildId);
      res.json({
        ok: true,
        step: servers.length ? "review" : "server",
        guildId: updated.discord_guild_id,
      });
    } catch (error) {
      console.error("Setup guild failed:", error.message);
      const status = error.status || (error.code === "GUILD_TAKEN" ? 409 : 500);
      res.status(status).json({ ok: false, error: error.message });
    }
  });

  /** Step 3 — add a WebRCON server (repeatable up to plan limit). */
  app.post("/api/setup/server", async (req, res) => {
    try {
      const ctx = await setupContext(req.body?.token);
      if (!ctx) return res.status(400).json({ ok: false, error: "Invalid or expired link" });
      const { account, org, servers } = ctx;
      if (inferStep(account, org, servers) === "workspace") {
        return res.status(400).json({ ok: false, error: "Finish workspace setup first" });
      }
      if (!org.discord_guild_id) {
        return res.status(400).json({ ok: false, error: "Link your Discord guild first" });
      }

      const endpoint = await (await import("../rcon/endpoint.js")).normalizeRconEndpoint({
        name: req.body?.name,
        host: req.body?.host,
        port: req.body?.port,
        password: req.body?.password,
      });

      const server = await createServer(org.id, endpoint);
      let rcon = { connected: false, lastError: null };
      if (!config.saas.mock) {
        try {
          const { attachSaasServerAndWait } = await import("../../modules/rcon/client.js");
          const raw = await getServerRaw(server.id);
          rcon = await attachSaasServerAndWait(withCredentials(raw));
        } catch (e) {
          console.error("Setup RCON attach failed:", e.message);
          rcon = { connected: false, lastError: e.message };
        }
      } else {
        rcon = { connected: true, lastError: null };
      }

      const nextServers = await listServers(org.id);
      const max = maxServersForPlan(org.plan);
      res.json({
        ok: true,
        server,
        servers: publicServers(nextServers),
        canAddMore: nextServers.length < max,
        maxServers: max,
        connected: Boolean(rcon.connected),
        warning: rcon.connected
          ? null
          : rcon.lastError ||
            "Saved, but WebRCON did not connect yet. Double-check host/port/password — you can fix this in the panel under Workspace → Servers.",
        step: "review",
      });
    } catch (error) {
      const status = error.code === "SERVER_LIMIT" || error.code === "PLAN_REQUIRED" ? 402 : 400;
      res.status(status).json({ ok: false, error: error.message, code: error.code });
    }
  });

  /** Finish — consume token and hop to the org panel. */
  app.post("/api/setup/finish", async (req, res) => {
    try {
      const ctx = await setupContext(req.body?.token);
      if (!ctx) return res.status(400).json({ ok: false, error: "Invalid or expired link" });
      const { row, account, org, servers } = ctx;

      if (inferStep(account, org, servers) === "workspace") {
        return res.status(400).json({ ok: false, error: "Finish workspace setup first" });
      }
      if (!org.discord_guild_id) {
        return res.status(400).json({ ok: false, error: "Invite the Discord bot and link your guild first" });
      }
      if (!servers.length) {
        return res.status(400).json({ ok: false, error: "Add at least one WebRCON server first" });
      }

      await markSetupTokenUsed(row.token);
      const hop = await createExchangeToken({
        accountId: account.id,
        orgId: org.id,
        email: account.email,
      });
      const redirect = `${orgPanelUrl(org).replace(/\/admin$/, "")}/admin/auth/exchange?t=${hop}`;
      res.json({ ok: true, redirect, panelUrl: orgPanelUrl(org) });
    } catch (error) {
      console.error("Setup finish failed:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** Back-compat for any old setup page still posting here. */
  app.post("/api/setup/complete", (req, res) => {
    res.status(410).json({
      ok: false,
      error: "Reload this page — setup is now multi-step (workspace → Discord → server).",
    });
  });

  app.get("/admin/auth/exchange", async (req, res) => {
    try {
      const token = String(req.query.t || "");
      const entry = token ? await consumeExchangeToken(token) : null;
      if (!entry) return res.redirect(302, "/admin");

      const account = await getAccount(entry.account_id);
      setSaasSessionCookie(res, {
        accountId: entry.account_id,
        email: entry.email,
        username: String(entry.email).split("@")[0],
        orgId: entry.org_id,
        sv: Number(account?.session_version ?? 0),
      });
      res.redirect(302, "/admin");
    } catch (error) {
      console.error("Setup exchange failed:", error.message);
      res.redirect(302, "/admin");
    }
  });
}
