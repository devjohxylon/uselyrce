import { config } from "../../config.js";
import { sendEmail } from "../../saas/email/send.js";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TOPICS = new Set([
  "Presales question",
  "Setup help",
  "Billing",
  "Bug report",
  "Something else",
]);

// Marketing pages are served from a different host than this API.
const ALLOWED_ORIGIN = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:usely\.dev|localhost)(?::\d+)?$/i;

// Crude flood guard: a handful of messages per IP per hour.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

function allowOrigin(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGIN.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
}

export function attachContactRoute(app) {
  app.options("/api/contact", (req, res) => {
    allowOrigin(req, res);
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(204);
  });

  app.post("/api/contact", async (req, res) => {
    allowOrigin(req, res);
    try {
      const name = String(req.body?.name || "").trim().slice(0, 80);
      const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 160);
      const topic = TOPICS.has(req.body?.topic) ? req.body.topic : "Something else";
      const message = String(req.body?.message || "").trim().slice(0, 4000);

      if (!name) return res.status(400).json({ ok: false, error: "Add your name." });
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, error: "Enter a valid email address." });
      }
      if (message.length < 10) {
        return res.status(400).json({ ok: false, error: "Add a bit more detail." });
      }
      if (rateLimited(req.ip)) {
        return res.status(429).json({
          ok: false,
          error: "Too many messages from this connection. Try again later.",
        });
      }

      await sendEmail({
        to: config.site.supportEmail,
        replyTo: email,
        subject: `[${topic}] ${name}`,
        text: `${name} <${email}>\nTopic: ${topic}\n\n${message}`,
        html:
          `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;<br>` +
          `Topic: ${escapeHtml(topic)}</p>` +
          `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("Contact form failed:", error.message);
      res.status(500).json({
        ok: false,
        error: `Could not send your message. Email ${config.site.supportEmail} instead.`,
      });
    }
  });
}
