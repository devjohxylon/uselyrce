import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { publishToDiscord, getBotStatus } from "../services/discordPublish.js";
import { attachAdminPanel } from "./admin/api.js";
import { createWebSocketServer } from "./websocket.js";
import { attachMarketingSite } from "./site/routes.js";

const ASSETS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);
const LOGO_SVG = path.join(ASSETS_DIR, "usely-mark.svg");
const LOGO_PNG = path.join(ASSETS_DIR, "usely-logo.png");


function authorize(req, res, next) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;

  if (!token || token !== config.webhook.secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

export async function createWebhookServer(client) {
  const app = express();

  // Stripe / Resend need the raw body — mount before express.json
  app.post(
    "/billing/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      if (!config.saas?.enabled) {
        return res.status(404).json({ error: "SaaS mode disabled" });
      }
      try {
        const { handleStripeWebhook } = await import("../saas/billing/stripe.js");
        const result = await handleStripeWebhook(
          req.body,
          req.get("stripe-signature"),
        );
        res.json(result);
      } catch (error) {
        console.error("Stripe webhook failed:", error.message);
        const { captureException } = await import("../observability/sentry.js");
        captureException(error);
        import("../saas/ops/alerts.js")
          .then(({ notifyOps }) =>
            notifyOps({
              key: "stripe:webhook",
              title: "Stripe webhook failed",
              body: error.message,
              severity: "critical",
            }),
          )
          .catch(() => {});
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/webhooks/resend",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const { handleResendInboundWebhook } = await import("../saas/email/inbound.js");
      return handleResendInboundWebhook(req, res);
    },
  );

  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  });

  // Holding page when MAINTENANCE_MODE=1 (keeps /health, Stripe, Resend, /api/status).
  const { maintenanceMiddleware } = await import("../saas/ops/maintenance.js");
  app.use(maintenanceMiddleware);

  app.use(express.json({ limit: "1mb" }));
  // The contact form posts urlencoded so it stays a simple cross-origin request.
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

  const { requireSameOrigin } = await import("../saas/csrf.js");
  app.use(requireSameOrigin);

  // Per-org subdomain tenancy: myserver.usely.dev serves that org's panel.
  if (config.saas?.enabled) {
    const { resolveOrgFromHost } = await import("../saas/tenancy.js");
    app.use(async (req, _res, next) => {
      try {
        req.orgFromHost = await resolveOrgFromHost(req.headers.host);
      } catch {
        req.orgFromHost = null;
      }
      next();
    });
    const { sentryRequestContext } = await import("../observability/sentry.js");
    app.use(sentryRequestContext);
    const { attachSignupRoutes } = await import("../saas/signup/routes.js");
    attachSignupRoutes(app, client);
    const { attachOpsRoutes } = await import("../saas/ops/routes.js");
    attachOpsRoutes(app, client);
  } else {
    const { sentryRequestContext } = await import("../observability/sentry.js");
    app.use(sentryRequestContext);
  }

  app.get("/logo.svg", (_req, res) => {
    res.type("image/svg+xml").sendFile(LOGO_SVG);
  });
  app.get(["/logo.png", "/favicon.ico"], (_req, res) => {
    res.type("image/png").sendFile(LOGO_PNG);
  });

  attachMarketingSite(app, client);
  await attachAdminPanel(app, client);

  app.get("/health", async (_req, res) => {
    const { getPersistenceHealth } = await import("../data/store.js");
    const persistence = getPersistenceHealth();
    res.json({
      ok: persistence.ok,
      discordReady: client.isReady(),
      persistence,
    });
  });

  app.get("/status", authorize, async (_req, res) => {
    res.json(await getBotStatus(client));
  });

  app.post("/publish", authorize, async (req, res) => {
    try {
      const result = await publishToDiscord(client, req.body ?? {});
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      console.error("Publish webhook failed:", error);
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.use((req, res) => {
    if (req.accepts("html")) {
      res.status(404).type("html").send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Not found — Usely</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#e8eef5;font-family:system-ui,sans-serif}
a{color:#7ec8f5}</style></head><body><div style="text-align:center;padding:2rem">
<h1 style="font-weight:600;margin:0 0 .5rem">Page not found</h1>
<p style="color:#9aa0ab">That URL isn’t part of Usely.</p>
<p><a href="/">Back to usely.dev</a></p></div></body></html>`);
      return;
    }
    res.status(404).json({ ok: false, error: "Not found" });
  });

  const { attachSentryExpress } = await import("../observability/sentry.js");
  attachSentryExpress(app);

  const httpServer = createServer(app);
  createWebSocketServer(httpServer, client);

  return httpServer;
}
