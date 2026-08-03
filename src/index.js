// Sentry must load first via `node --import ./src/observability/sentry.js` (see npm start).
import { setupProcessHandlers, captureException, isSentryEnabled } from "./observability/sentry.js";
import { startBot } from "./bot.js";

setupProcessHandlers();

if (isSentryEnabled()) {
  console.log("Sentry error monitoring enabled");
} else {
  console.warn("Sentry off — set SENTRY_DSN on Railway and enable email/Slack alerts in Sentry");
}

const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
if (onRailway || process.env.NODE_ENV === "production") {
  if (!String(process.env.SUPPORT_FORWARD_TO || "").trim()) {
    console.warn("SUPPORT_FORWARD_TO unset — contact form may not reach you");
  }
  if (
    !String(process.env.OPS_ALERT_EMAIL || "").trim() &&
    !String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim()
  ) {
    console.warn("Set OPS_ALERT_WEBHOOK_URL or OPS_ALERT_EMAIL for Discord/bot/RCON/Stripe paging");
  }
  const stripeKey = String(process.env.STRIPE_SECRET_KEY || "");
  if (stripeKey.startsWith("sk_test") && process.env.ALLOW_STRIPE_TEST !== "true") {
    console.warn("STRIPE_SECRET_KEY looks like test mode — checkout will refuse on prod until sk_live_ is set");
  }
}

startBot().catch((error) => {
  if (String(error.message).includes("disallowed intents")) {
    console.error(`
Usely failed: Discord blocked privileged intents.

Fix in Discord Developer Portal (https://discord.com/developers/applications):
  1. Open your app → Bot
  2. Under "Privileged Gateway Intents", turn ON:
     • MESSAGE CONTENT INTENT
     • SERVER MEMBERS INTENT
  3. Click Save Changes
  4. Run: npm.cmd start

Also re-invite the bot if you added new permissions recently.
`);
  } else {
    console.error("Usely failed to start:", error);
    captureException(error);
  }
  process.exit(1);
});
