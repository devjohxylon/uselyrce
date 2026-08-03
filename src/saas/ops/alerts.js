import { config } from "../../config.js";
import { captureException } from "../../observability/sentry.js";

/** @type {Map<string, number>} */
const lastSent = new Map();

function cooldownMs(key) {
  if (key.startsWith("rcon:")) return 15 * 60 * 1000;
  if (key.startsWith("discord:")) return 5 * 60 * 1000;
  if (key.startsWith("stripe:")) return 2 * 60 * 1000;
  if (key.startsWith("uptime:")) return 10 * 60 * 1000;
  return 5 * 60 * 1000;
}

function shouldSend(key) {
  const now = Date.now();
  const prev = lastSent.get(key) || 0;
  if (now - prev < cooldownMs(key)) return false;
  lastSent.set(key, now);
  return true;
}

function alertEmail() {
  return (
    String(process.env.OPS_ALERT_EMAIL || "").trim() ||
    config.site.supportForwardTo ||
    null
  );
}

function alertWebhook() {
  return String(process.env.OPS_ALERT_WEBHOOK_URL || "").trim() || null;
}

/**
 * Platform-owner alert (email and/or Discord webhook). Deduped by `key`.
 * @param {{ key: string, title: string, body: string, severity?: "info"|"warning"|"critical" }} opts
 */
export async function notifyOps({ key, title, body, severity = "warning" }) {
  const k = String(key || title || "ops");
  if (!shouldSend(k)) return { ok: true, skipped: "cooldown" };

  const text = `[Usely ${severity}] ${title}\n\n${body}`;
  const results = { email: null, webhook: null };

  const hook = alertWebhook();
  if (hook) {
    try {
      const color =
        severity === "critical" ? 0xe74c3c : severity === "info" ? 0x3498db : 0xf39c12;
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: severity === "critical" ? "@here" : undefined,
          embeds: [
            {
              title: `Usely · ${title}`,
              description: String(body).slice(0, 4000),
              color,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      results.webhook = res.ok ? "ok" : `http_${res.status}`;
    } catch (error) {
      results.webhook = error.message;
      console.error("ops alert webhook failed:", error.message);
    }
  }

  const to = alertEmail();
  if (to) {
    try {
      const { sendEmail } = await import("../email/send.js");
      await sendEmail({
        to,
        subject: `[Usely ${severity}] ${title}`,
        text,
        html: `<p><strong>${escapeHtml(title)}</strong></p><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace">${escapeHtml(body)}</pre>`,
      });
      results.email = "ok";
    } catch (error) {
      results.email = error.message;
      console.error("ops alert email failed:", error.message);
    }
  }

  if (!hook && !to) {
    console.warn(`ops alert (no OPS_ALERT_WEBHOOK_URL / OPS_ALERT_EMAIL): ${title} — ${body}`);
    return { ok: false, skipped: "no_channel", results };
  }

  if (severity === "critical") {
    try {
      captureException(new Error(`ops:${title}`), { extra: { body, key: k } });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, results };
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Wire Discord gateway disconnect / resume alerts. Call once from startBot. */
export function attachDiscordOpsAlerts(client) {
  if (!client || client.__uselyOpsAlerts) return;
  client.__uselyOpsAlerts = true;

  client.on("shardDisconnect", (event, shardId) => {
    console.error("Discord shardDisconnect", shardId, event?.code);
    notifyOps({
      key: "discord:disconnect",
      title: "Discord bot disconnected",
      body: `Shard ${shardId} disconnected (code ${event?.code ?? "?"}). Railway should keep the process up; check /status if this persists.`,
      severity: "critical",
    }).catch(() => {});
  });

  client.on("invalidated", () => {
    console.error("Discord session invalidated");
    notifyOps({
      key: "discord:invalidated",
      title: "Discord session invalidated",
      body: "The bot session was invalidated. Check DISCORD_TOKEN and re-login.",
      severity: "critical",
    }).catch(() => {});
  });

  client.on("shardError", (error, shardId) => {
    console.error("Discord shardError", shardId, error?.message);
    notifyOps({
      key: "discord:shardError",
      title: "Discord shard error",
      body: `Shard ${shardId}: ${error?.message || error}`,
      severity: "warning",
    }).catch(() => {});
  });

  let wasReady = false;
  client.on("ready", () => {
    if (wasReady) {
      notifyOps({
        key: "discord:resume",
        title: "Discord bot back online",
        body: `Logged in as ${client.user?.tag || "bot"}.`,
        severity: "info",
      }).catch(() => {});
    }
    wasReady = true;
  });
}
