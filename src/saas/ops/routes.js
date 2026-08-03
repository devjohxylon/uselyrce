import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import { getAccount } from "../db/accounts.js";
import { getOrgBySlug, listAllOrgsForOps, setGuild } from "../db/orgs.js";
import { getServerRaw, listServers, withCredentials } from "../db/servers.js";
import { syncSubscriptionFromStripe } from "../billing/stripe.js";
import { attachSaasServer, detachSaasServer, getRconStatus } from "../../modules/rcon/client.js";
import { orgPanelUrl } from "../tenancy.js";
import { finalizeSignup } from "../signup/finalize.js";
import { buildHealth, serializeServerForOps } from "./health.js";
import {
  applyMockOpsFix,
  getMockOpsDetail,
  listMockOpsOrgs,
} from "./mock-orgs.js";
import {
  clearOpsCookie,
  codesMatch,
  hasOpsSession,
  opsCodeConfigured,
  setOpsCookie,
} from "./session.js";
import { createRateLimiter } from "../rate-limit.js";
import { getOpsWebAnalytics } from "./web-analytics.js";

const opsLoginLimit = createRateLimiter({
  maxAttempts: 8,
  windowMs: 15 * 60 * 1000,
  lockMs: 15 * 60 * 1000,
});

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OPS_HTML = path.resolve(DIR, "ops.html");
const ORG_HTML = path.resolve(DIR, "org.html");
const OPS_CSS = path.resolve(DIR, "ops-ui.css");


function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gateHtml({ error = "" } = {}) {
  const err = error ? `<p class="err">${escapeHtml(error)}</p>` : "";
  const configured = opsCodeConfigured();
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Usely Ops</title>
<link rel="icon" href="/logo.png" type="image/png"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/ops/ui.css"/>
<style>
body{display:grid;place-items:center;padding:1.5rem;min-height:100vh}
.gate{width:min(24rem,100%);border:1px solid var(--line);border-radius:var(--radius);background:var(--bg2);padding:1.85rem}
.gate .label{margin-bottom:.9rem}
.gate h1{margin:0 0 .55rem;font-size:1.65rem;font-weight:700;letter-spacing:-.02em}
.gate p{color:var(--muted);line-height:1.55;margin:0 0 1.25rem;font-size:.95rem}
.gate label{display:grid;gap:.4rem;font-size:.8rem;color:var(--chrome-dim);margin-bottom:1rem;font-family:var(--mono);letter-spacing:.1em;text-transform:uppercase}
.gate .err{display:block;margin:0 0 .85rem;color:var(--text);font-size:.875rem}
.gate .note{font-size:.75rem;color:var(--faint);margin:1rem 0 0;font-family:var(--mono);letter-spacing:.04em}
</style></head><body>
<form class="gate" method="POST" action="/ops/login">
  <p class="label">Platform console</p>
  <h1>Ops</h1>
  <p>Customer workspaces across Usely — health, Discord, billing, and RCON. Not a game admin panel.</p>
  ${configured ? "" : `<p class="err">Set USELY_OPS_CODE on Railway, then redeploy.</p>`}
  ${err}
  <label>Access code
    <input type="password" name="code" autocomplete="current-password" autofocus ${configured ? "required" : "disabled"} />
  </label>
  <button class="btn btn-primary" type="submit" style="width:100%" ${configured ? "" : "disabled"}>Unlock</button>
  <p class="note">/ops · USELY_OPS_CODE</p>
</form>
</body></html>`;
}

function requireOps(req, res, { html = false } = {}) {
  if (!config.saas.enabled) {
    if (html) {
      res.status(503).type("html").send(gateHtml({ error: "SaaS mode is off on this deployment." }));
    } else {
      res.status(404).end();
    }
    return false;
  }
  if (!opsCodeConfigured()) {
    if (html) {
      res.status(503).type("html").send(gateHtml());
    } else {
      res.status(503).json({ ok: false, error: "Ops code not configured" });
    }
    return false;
  }
  if (!hasOpsSession(req)) {
    if (html) {
      res.status(401).type("html").send(gateHtml());
    } else {
      res.status(401).json({ ok: false, error: "Unlock required" });
    }
    return false;
  }
  return true;
}

function summarize(orgs) {
  const activeStatuses = new Set(["active", "trialing"]);
  return {
    orgCount: orgs.length,
    serverCount: orgs.reduce((n, o) => n + (Number(o.server_count) || 0), 0),
    activeSubs: orgs.filter((o) => activeStatuses.has(o.plan_status)).length,
  };
}

function loadOpsOrgs() {
  if (config.saas.opsMock) {
    return { orgs: listMockOpsOrgs(), mock: true };
  }
  return listAllOrgsForOps().then((orgs) => ({ orgs, mock: false }));
}

async function probeBotInGuild(client, guildId) {
  if (!guildId) return { botInGuild: false, discordReady: Boolean(client?.isReady?.()) };
  const discordReady = Boolean(client?.isReady?.());
  if (!discordReady) return { botInGuild: null, discordReady: false };
  let guild = client.guilds.cache.get(guildId) || null;
  if (!guild) {
    guild = await client.guilds.fetch(guildId).catch(() => null);
  }
  return { botInGuild: Boolean(guild), discordReady: true, guildName: guild?.name || null };
}

function publicOrg(org, ownerEmail) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    planStatus: org.plan_status,
    ownerEmail: ownerEmail ?? org.owner_email ?? null,
    ownerDiscordId: org.owner_discord_id || null,
    guildId: org.discord_guild_id || null,
    stripeCustomerId: org.stripe_customer_id || null,
    stripeSubscriptionId: org.stripe_subscription_id || null,
    defaultServerId: org.default_server_id || null,
    panelUrl: orgPanelUrl(org),
    createdAt: org.created_at,
  };
}

async function loadLiveDetail(slug, client) {
  const org = await getOrgBySlug(String(slug || "").toLowerCase().trim());
  if (!org) return null;
  let ownerEmail = null;
  if (org.owner_account_id) {
    const account = await getAccount(org.owner_account_id).catch(() => null);
    ownerEmail = account?.email || null;
  }
  const rawServers = await listServers(org.id);
  const servers = rawServers.map((s) => serializeServerForOps(s, getRconStatus(s.id)));
  const probe = await probeBotInGuild(client, org.discord_guild_id);
  const health = buildHealth(org, servers, {
    botInGuild: probe.botInGuild,
    discordReady: probe.discordReady,
  });
  return {
    mock: false,
    org: publicOrg(org, ownerEmail),
    servers,
    health,
    _raw: org,
  };
}

async function loadDetail(slug, client) {
  if (config.saas.opsMock) {
    const detail = getMockOpsDetail(slug);
    if (!detail) return null;
    return {
      mock: true,
      org: publicOrg(detail.org),
      servers: detail.servers,
      health: detail.health,
    };
  }
  return loadLiveDetail(slug, client);
}

async function reconnectServer(orgId, serverId) {
  const raw = await getServerRaw(serverId);
  if (!raw || raw.org_id !== orgId) {
    const err = new Error("Server not found for this org");
    err.status = 404;
    throw err;
  }
  if (!raw.rcon_password_enc) {
    const err = new Error("Server has no RCON password stored");
    err.status = 400;
    throw err;
  }
  detachSaasServer(serverId);
  if (raw.enabled !== false) {
    await attachSaasServer(withCredentials(raw));
  }
  return { serverId, attached: raw.enabled !== false };
}

async function runLiveFix(org, action, { serverId, guildId }, client) {
  switch (action) {
    case "reconnect_rcon": {
      if (!serverId) {
        const err = new Error("serverId required");
        err.status = 400;
        throw err;
      }
      return { result: await reconnectServer(org.id, serverId) };
    }
    case "reconnect_all_rcon": {
      const servers = await listServers(org.id);
      const results = [];
      for (const s of servers.filter((x) => x.enabled !== false)) {
        results.push(await reconnectServer(org.id, s.id));
      }
      return { result: { reconnected: results.length, servers: results } };
    }
    case "refresh_stripe": {
      const updated = await syncSubscriptionFromStripe(org);
      return {
        result: {
          plan: updated.plan,
          plan_status: updated.plan_status,
        },
      };
    }
    case "clear_guild": {
      await setGuild(org.id, null);
      return { result: { guildId: null } };
    }
    case "relink_guild": {
      const id = String(guildId || "").trim();
      if (!id) {
        const err = new Error("guildId required");
        err.status = 400;
        throw err;
      }
      const probe = await probeBotInGuild(client, id);
      if (!probe.discordReady) {
        const err = new Error("Discord client not ready");
        err.status = 503;
        throw err;
      }
      if (!probe.botInGuild) {
        const err = new Error("Bot is not in that Discord server yet. Invite the bot first.");
        err.status = 400;
        throw err;
      }
      await setGuild(org.id, id);
      return { result: { guildId: id, guildName: probe.guildName } };
    }
    default: {
      const err = new Error(`Unknown action: ${action}`);
      err.status = 400;
      throw err;
    }
  }
}

export function attachOpsRoutes(app, client = null) {
  if (!config.saas.enabled) return;

  app.get("/ops", (req, res) => {
    if (!requireOps(req, res, { html: true })) return;
    res.type("html").sendFile(OPS_HTML);
  });

  app.get("/ops/ui.css", (_req, res) => {
    res.type("text/css").sendFile(OPS_CSS);
  });

  app.get("/ops/orgs/:slug", (req, res) => {
    if (!requireOps(req, res, { html: true })) return;
    res.type("html").sendFile(ORG_HTML);
  });

  app.post("/ops/login", (req, res) => {
    const ip = opsLoginLimit.clientIp(req);
    const gate = opsLoginLimit.check(ip);
    if (!gate.ok) {
      return res
        .status(429)
        .type("html")
        .send(gateHtml({ error: `Too many attempts. Try again in ${gate.retryAfterSec}s.` }));
    }
    const code = req.body?.code ?? req.body?.accessCode ?? "";
    if (!codesMatch(code)) {
      opsLoginLimit.fail(ip);
      return res.status(401).type("html").send(gateHtml({ error: "Wrong access code." }));
    }
    opsLoginLimit.clear(ip);
    setOpsCookie(res);
    const next = String(req.body?.next || req.query?.next || "/ops");
    const safe = next.startsWith("/ops") ? next : "/ops";
    res.redirect(302, safe);
  });

  app.post("/ops/logout", (_req, res) => {
    clearOpsCookie(res);
    res.redirect(302, "/ops");
  });

  app.get("/api/ops/summary", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const { orgs, mock } = await loadOpsOrgs();
      res.json({ ok: true, mock, ...summarize(orgs) });
    } catch (error) {
      console.error("ops summary failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load summary" });
    }
  });

  app.get("/api/ops/orgs", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const { orgs, mock } = await loadOpsOrgs();
      res.json({
        ok: true,
        mock,
        orgs: orgs.map((org) => ({
          id: org.id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          planStatus: org.plan_status,
          serverCount: org.server_count,
          ownerEmail: org.owner_email,
          createdAt: org.created_at,
          panelUrl: orgPanelUrl(org),
          guildLinked: Boolean(org.discord_guild_id),
          guildId: org.discord_guild_id || null,
          hasStripeCustomer: Boolean(org.stripe_customer_id),
          hasStripeSubscription: Boolean(org.stripe_subscription_id),
        })),
      });
    } catch (error) {
      console.error("ops orgs failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load orgs" });
    }
  });

  app.get("/api/ops/orgs/:slug", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const discord = client || req.app?.locals?.discordClient || null;
      const detail = await loadDetail(req.params.slug, discord);
      if (!detail) return res.status(404).json({ ok: false, error: "Org not found" });
      res.json({
        ok: true,
        mock: detail.mock,
        org: detail.org,
        servers: detail.servers,
        health: detail.health,
      });
    } catch (error) {
      console.error("ops org detail failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load org" });
    }
  });

  app.post("/api/ops/orgs/:slug/fix", async (req, res) => {
    if (!requireOps(req, res)) return;
    const action = String(req.body?.action || "").trim();
    const serverId = req.body?.serverId ? String(req.body.serverId) : null;
    const guildId = req.body?.guildId ? String(req.body.guildId) : null;
    try {
      const discord = client || req.app?.locals?.discordClient || null;
      let fixResult;
      if (config.saas.opsMock) {
        fixResult = applyMockOpsFix(req.params.slug, action, { serverId, guildId });
      } else {
        const org = await getOrgBySlug(String(req.params.slug || "").toLowerCase().trim());
        if (!org) return res.status(404).json({ ok: false, error: "Org not found" });
        fixResult = await runLiveFix(org, action, { serverId, guildId }, discord);
      }
      const detail = await loadDetail(req.params.slug, discord);
      res.json({
        ok: true,
        action,
        ...fixResult,
        mock: detail?.mock ?? config.saas.opsMock,
        org: detail?.org,
        servers: detail?.servers,
        health: detail?.health,
      });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("ops fix failed:", error.message);
      res.status(status).json({ ok: false, error: error.message || "Fix failed" });
    }
  });

  /** Probe Resend with a real send to the address you choose (ops only). */
  app.post("/api/ops/test-email", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const { sendEmail, getEmailConfigPublic } = await import("../email/send.js");
      const to = String(req.body?.to || "").toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
        return res.status(400).json({ ok: false, error: "Provide a valid to email" });
      }
      const cfg = getEmailConfigPublic();
      await sendEmail({
        to,
        subject: "Usely ops test email",
        html: `<p>Resend is working for <strong>${cfg.from}</strong>.</p>`,
        text: `Resend is working for ${cfg.from}.`,
      });
      res.json({ ok: true, ...cfg, to });
    } catch (error) {
      console.error("ops test-email failed:", error.message, error.detail || "");
      res.status(500).json({
        ok: false,
        error: error.message,
        detail: error.detail || null,
        ...(await import("../email/send.js").then((m) => m.getEmailConfigPublic()).catch(() => ({}))),
      });
    }
  });

  /** Marketing-site traffic from Vercel Web Analytics (www.usely.dev). */
  app.get("/api/ops/analytics", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const days = Number(req.query?.days) || 7;
      const payload = await getOpsWebAnalytics({ days });
      res.json(payload);
    } catch (error) {
      console.error("ops analytics failed:", error.message);
      res.status(500).json({ ok: false, configured: true, error: error.message });
    }
  });

  /** Public status incident banner (written to DATA_DIR/incident.json). */
  app.get("/api/ops/incident", async (req, res) => {
    if (!requireOps(req, res)) return;
    const { readIncident, getFeatureFlags } = await import("./flags.js");
    res.json({
      ok: true,
      incident: await readIncident(),
      flags: getFeatureFlags(),
    });
  });

  app.post("/api/ops/incident", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const { writeIncident, readIncident } = await import("./flags.js");
      if (req.body?.clear) {
        await writeIncident(null);
        return res.json({ ok: true, incident: null });
      }
      const message = String(req.body?.message || "").trim();
      if (!message) {
        return res.status(400).json({ ok: false, error: "Provide message or clear:true" });
      }
      const incident = await writeIncident({
        message,
        severity: req.body?.severity,
      });
      res.json({ ok: true, incident: incident || (await readIncident()) });
    } catch (error) {
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** Email all (or filtered) workspace owners — incident / breaking-change blast. */
  app.post("/api/ops/broadcast", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const subject = String(req.body?.subject || "").trim().slice(0, 160);
      const body = String(req.body?.body || "").trim().slice(0, 8000);
      const dryRun = Boolean(req.body?.dryRun);
      if (!subject || body.length < 10) {
        return res.status(400).json({
          ok: false,
          error: "Provide subject and body (10+ chars). Use dryRun:true to preview recipients.",
        });
      }
      const orgs = config.saas.opsMock
        ? listMockOpsOrgs()
        : await listAllOrgsForOps();
      const emails = [
        ...new Set(
          orgs
            .map((o) => String(o.owner_email || "").toLowerCase().trim())
            .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && !e.endsWith("@usely.dev")),
        ),
      ];
      if (dryRun) {
        return res.json({ ok: true, dryRun: true, recipients: emails, count: emails.length });
      }
      if (!emails.length) {
        return res.status(400).json({ ok: false, error: "No owner emails to send to." });
      }
      const { sendEmail } = await import("../email/send.js");
      const html = `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p><p style="color:#888;font-size:12px">Usely ops broadcast · <a href="https://www.usely.dev/status">Status</a></p>`;
      let sent = 0;
      const errors = [];
      for (const to of emails) {
        try {
          await sendEmail({ to, subject, text: body, html });
          sent += 1;
        } catch (error) {
          errors.push({ to, error: error.message });
        }
      }
      res.json({ ok: errors.length === 0, sent, failed: errors.length, errors: errors.slice(0, 10) });
    } catch (error) {
      console.error("ops broadcast failed:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  /** Skip Stripe — create a real setup token so you can walk through /setup. */
  app.post("/api/ops/preview-setup", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const plan = ["basic", "pro", "network"].includes(req.body?.plan)
        ? req.body.plan
        : "pro";
      const rawEmail = String(req.body?.email || "").toLowerCase().trim();
      const email = rawEmail || `preview+${Date.now()}@usely.dev`;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: "Invalid email" });
      }
      const { setupUrl, org } = await finalizeSignup({
        email,
        plan,
        skipEmail: true,
      });
      res.json({
        ok: true,
        preview: true,
        email,
        plan,
        orgId: org.id,
        slug: org.slug,
        setupUrl,
      });
    } catch (error) {
      console.error("ops preview-setup failed:", error.message);
      res.status(500).json({ ok: false, error: error.message || "Failed to create setup link" });
    }
  });
}
