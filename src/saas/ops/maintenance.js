import { getFeatureFlags } from "./flags.js";

const ALWAYS_ALLOW =
  /^\/(health|billing\/stripe\/webhook|api\/webhooks\/resend|api\/status|logo\.(svg|png)|favicon\.ico)(\?|$)/i;

/**
 * When MAINTENANCE_MODE=1, serve a holding page for HTML and 503 for APIs.
 * Keeps health, Stripe, Resend, and status probes open.
 */
export function maintenanceMiddleware(req, res, next) {
  const flags = getFeatureFlags();
  if (!flags.maintenanceMode) return next();
  if (ALWAYS_ALLOW.test(req.path)) return next();
  // Ops must stay reachable so you can clear incident / inspect.
  if (req.path === "/ops" || req.path.startsWith("/ops/") || req.path.startsWith("/api/ops")) {
    return next();
  }

  if (req.path.startsWith("/api/") || req.path.startsWith("/admin/api") || req.path.startsWith("/billing/")) {
    return res.status(503).json({
      ok: false,
      error: "maintenance",
      message: flags.maintenanceMessage,
    });
  }

  const accept = String(req.get("accept") || "");
  const wantsJson = accept.includes("application/json") && !accept.includes("text/html");
  if (wantsJson) {
    return res.status(503).json({
      ok: false,
      error: "maintenance",
      message: flags.maintenanceMessage,
    });
  }

  res.status(503).type("html").send(maintenanceHtml(flags.maintenanceMessage));
}

function maintenanceHtml(message) {
  const safe = String(message)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Maintenance — Usely</title>
<link rel="icon" href="/logo.png" type="image/png"/>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e8eef5;
font-family:"Space Grotesk",system-ui,sans-serif;padding:1.5rem}
.card{max-width:28rem;text-align:center}
h1{font-size:1.5rem;font-weight:700;margin:0 0 .75rem;letter-spacing:-.02em}
p{color:#9aa0ab;line-height:1.55;margin:0 0 1.25rem}
a{color:#7ec8f5}
</style></head><body><div class="card">
<img src="/logo.png" alt="" width="48" height="48" style="margin-bottom:1rem"/>
<h1>We’ll be right back</h1>
<p>${safe}</p>
<p><a href="https://www.usely.dev/status">Status</a> · <a href="https://www.usely.dev/contact">Contact</a></p>
</div></body></html>`;
}
