import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import { listAllOrgsForOps } from "../db/orgs.js";
import { orgPanelUrl } from "../tenancy.js";
import { OPS_MOCK_ORGS } from "./mock-orgs.js";

const OPS_HTML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "ops.html",
);

const COOKIE = "usely_ops";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function configuredCode() {
  return String(config.saas.opsAccessCode || "").trim();
}

function signingSecret() {
  return (
    configuredCode() ||
    config.adminPanel.sessionSecret ||
    "usely-ops"
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
    if (!payload?.ops || !payload?.exp || Date.now() > payload.exp) return null;
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
  return `${secure}; HttpOnly; SameSite=Lax; Path=/`;
}

function setOpsCookie(res) {
  const token = sign({ ops: true, exp: Date.now() + TTL_MS });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Max-Age=${Math.floor(TTL_MS / 1000)}${cookieAttrs()}`,
  );
}

function clearOpsCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Max-Age=0${cookieAttrs()}`);
}

function readOpsCookie(req) {
  return verify(parseCookies(req)[COOKIE]);
}

function codesMatch(input) {
  const expected = configuredCode();
  if (!expected) return false;
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gateHtml({ error = "" } = {}) {
  const err = error ? `<p class="err">${escapeHtml(error)}</p>` : "";
  const configured = Boolean(configuredCode());
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/>
<title>Usely Ops</title>
<link rel="icon" href="/logo.png" type="image/png"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
:root{--bg:#07080a;--bg2:#10131a;--line:rgba(255,255,255,.08);--text:#f3f1ec;--muted:#9aa3b2;--accent:#f0c674;--bad:#f87171;--font:"Space Grotesk",system-ui,sans-serif}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:var(--font);color:var(--text);
background:radial-gradient(700px 400px at 50% -10%,rgba(240,198,116,.08),transparent 55%),var(--bg);padding:1.5rem}
.card{width:min(22rem,100%);border:1px solid var(--line);border-radius:6px;background:var(--bg2);padding:1.75rem}
.eyebrow{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin:0 0 .75rem;font-weight:600}
h1{margin:0 0 .5rem;font-size:1.35rem;font-weight:600}
p{color:var(--muted);line-height:1.5;margin:0 0 1.25rem;font-size:.9rem}
label{display:grid;gap:.35rem;font-size:.8rem;color:var(--muted);margin-bottom:1rem}
input{width:100%;font:inherit;padding:.75rem .85rem;border-radius:4px;border:1px solid var(--line);background:#0a0c10;color:var(--text)}
button{width:100%;font:inherit;font-weight:600;border:0;border-radius:4px;padding:.85rem;cursor:pointer;background:var(--accent);color:#14110b}
.err{color:var(--bad);font-size:.85rem;margin:0 0 .85rem}
.note{font-size:.75rem;color:var(--muted);margin:1rem 0 0}
code{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.85em}
</style></head><body>
<form class="card" method="POST" action="/ops/login">
  <p class="eyebrow">Platform console</p>
  <h1>Usely ops</h1>
  <p>Customer workspaces across the platform — not a game server admin panel.</p>
  ${configured ? "" : `<p class="err">Set USELY_OPS_CODE on Railway, then redeploy.</p>`}
  ${err}
  <label>Access code
    <input type="password" name="code" autocomplete="current-password" autofocus ${configured ? "required" : "disabled"} />
  </label>
  <button type="submit" ${configured ? "" : "disabled"}>Unlock</button>
  <p class="note">Bookmark <code>/ops</code>. Code lives in Railway env <code>USELY_OPS_CODE</code>.</p>
</form>
</body></html>`;
}

/**
 * @returns {boolean} true when authorized
 */
function requireOps(req, res, { html = false } = {}) {
  if (!config.saas.enabled) {
    if (html) {
      res.status(503).type("html").send(gateHtml({ error: "SaaS mode is off on this deployment." }));
    } else {
      res.status(404).end();
    }
    return false;
  }
  if (!configuredCode()) {
    if (html) {
      res.status(503).type("html").send(gateHtml());
    } else {
      res.status(503).json({ ok: false, error: "Ops code not configured" });
    }
    return false;
  }
  if (!readOpsCookie(req)) {
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
    return { orgs: OPS_MOCK_ORGS, mock: true };
  }
  return listAllOrgsForOps().then((orgs) => ({ orgs, mock: false }));
}

export function attachOpsRoutes(app) {
  if (!config.saas.enabled) return;

  app.get("/ops", (req, res) => {
    if (!requireOps(req, res, { html: true })) return;
    res.type("html").sendFile(OPS_HTML);
  });

  app.post("/ops/login", (req, res) => {
    const code = req.body?.code ?? req.body?.accessCode ?? "";
    if (!codesMatch(code)) {
      return res.status(401).type("html").send(gateHtml({ error: "Wrong access code." }));
    }
    setOpsCookie(res);
    res.redirect(302, "/ops");
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
        })),
      });
    } catch (error) {
      console.error("ops orgs failed:", error.message);
      res.status(500).json({ ok: false, error: "Failed to load orgs" });
    }
  });
}
