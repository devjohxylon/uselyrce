import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import { readSaasCookie } from "../auth/discord-session.js";
import { listAllOrgsForOps } from "../db/orgs.js";
import { orgPanelUrl } from "../tenancy.js";

const OPS_HTML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "ops.html",
);

function isOpsEmail(email) {
  if (!email || !config.saas.opsEmails.size) return false;
  return config.saas.opsEmails.has(String(email).toLowerCase().trim());
}

function requireOps(req, res) {
  if (!config.saas.enabled) {
    res.status(404).end();
    return null;
  }
  const cookie = readSaasCookie(req);
  if (!cookie?.email || !isOpsEmail(cookie.email)) {
    res.status(404).end();
    return null;
  }
  return cookie;
}

function summarize(orgs) {
  const activeStatuses = new Set(["active", "trialing"]);
  return {
    orgCount: orgs.length,
    serverCount: orgs.reduce((n, o) => n + (Number(o.server_count) || 0), 0),
    activeSubs: orgs.filter((o) => activeStatuses.has(o.plan_status)).length,
  };
}

export function attachOpsRoutes(app) {
  if (!config.saas.enabled) return;

  app.get("/ops", (req, res) => {
    if (!requireOps(req, res)) return;
    res.type("html").sendFile(OPS_HTML);
  });

  app.get("/api/ops/summary", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const orgs = await listAllOrgsForOps();
      res.json({ ok: true, ...summarize(orgs) });
    } catch (error) {
      console.error("ops summary failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load summary" });
    }
  });

  app.get("/api/ops/orgs", async (req, res) => {
    if (!requireOps(req, res)) return;
    try {
      const orgs = await listAllOrgsForOps();
      res.json({
        ok: true,
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
        })),
      });
    } catch (error) {
      console.error("ops orgs failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load orgs" });
    }
  });
}
