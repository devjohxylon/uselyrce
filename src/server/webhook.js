import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { publishFromWebsite, getBotStatus } from "../services/discordPublish.js";
import { backfillChannel, syncLatestLeaderboard } from "../services/website.js";
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

  // Stripe needs the raw body — mount before express.json
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
        res.status(400).json({ error: error.message });
      }
    },
  );

  app.use(express.json({ limit: "10mb" }));
  // The contact form posts urlencoded so it stays a simple cross-origin request.
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));

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
    const { attachSignupRoutes } = await import("../saas/signup/routes.js");
    attachSignupRoutes(app, client);
    const { attachOpsRoutes } = await import("../saas/ops/routes.js");
    attachOpsRoutes(app, client);
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
      const result = await publishFromWebsite(client, req.body ?? {});
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      console.error("Publish webhook failed:", error);
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/sync/leaderboard", authorize, async (_req, res) => {
    try {
      const messageIds = await syncLatestLeaderboard(client);
      res.json({ ok: true, synced: messageIds.length, messageIds });
    } catch (error) {
      console.error("Leaderboard sync failed:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.post("/sync/backfill", authorize, async (req, res) => {
    try {
      const { channelId, limit = 25 } = req.body ?? {};
      const targetId = channelId || config.channels.kaosActivity;

      if (!targetId) {
        return res.status(400).json({ ok: false, error: "No channel configured for backfill" });
      }

      const channel = client.channels.cache.get(targetId);
      if (!channel?.isTextBased()) {
        return res.status(404).json({ ok: false, error: `Channel ${targetId} not found` });
      }

      const messageIds = await backfillChannel(channel, Math.min(Number(limit) || 25, 100));
      res.json({ ok: true, synced: messageIds.length, messageIds });
    } catch (error) {
      console.error("Backfill failed:", error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  const httpServer = createServer(app);
  createWebSocketServer(httpServer);

  return httpServer;
}
