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

function gatePage({ title, body, href, cta }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="robots" content="noindex"/><title>${title} — Usely Ops</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;
background:#050506;color:#f0f2f5;padding:1.5rem}
.card{max-width:26rem;border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:1.75rem;background:#0c0d10}
h1{font-size:1.25rem;margin:0 0 .75rem;font-weight:600}
p{color:#9aa0ab;line-height:1.55;margin:0 0 1.25rem}
a{display:inline-block;background:#e8edf4;color:#0b0c0e;font-weight:600;text-decoration:none;
padding:.7rem 1rem;border-radius:4px}
code{color:#d7dde6}
</style></head><body><div class="card">
<h1>${title}</h1><p>${body}</p>
<a href="${href}">${cta}</a>
</div></body></html>`;
}

/**
 * @returns {object|null} cookie when authorized; otherwise response already sent
 */
function requireOps(req, res, { html = false } = {}) {
  if (!config.saas.enabled) {
    if (html) {
      res
        .status(503)
        .type("html")
        .send(gatePage({
          title: "Ops unavailable",
          body: "SaaS mode is not enabled on this deployment.",
          href: "/",
          cta: "← Home",
        }));
    } else {
      res.status(404).end();
    }
    return null;
  }

  if (!config.saas.opsEmails.size) {
    if (html) {
      res
        .status(503)
        .type("html")
        .send(gatePage({
          title: "Ops not configured",
          body: "Set <code>USELY_OPS_EMAILS</code> on Railway to your owner email, then redeploy.",
          href: "/admin",
          cta: "Open panel login",
        }));
    } else {
      res.status(404).end();
    }
    return null;
  }

  const cookie = readSaasCookie(req);
  if (!cookie?.email) {
    if (html) {
      res.redirect(302, "/admin?next=%2Fops");
    } else {
      res.status(401).json({ ok: false, error: "Sign in required" });
    }
    return null;
  }

  if (!isOpsEmail(cookie.email)) {
    if (html) {
      res
        .status(403)
        .type("html")
        .send(gatePage({
          title: "Not an ops account",
          body: `Signed in as <code>${String(cookie.email).replace(/[<>&]/g, "")}</code>, which is not in <code>USELY_OPS_EMAILS</code>. Sign in with your ops email instead.`,
          href: "/admin?next=%2Fops",
          cta: "Switch account",
        }));
    } else {
      res.status(403).json({ ok: false, error: "Forbidden" });
    }
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
    if (!requireOps(req, res, { html: true })) return;
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
