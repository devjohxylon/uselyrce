import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../../config.js";
import { sendEmail } from "./send.js";

function trimEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Verify Resend/Svix webhook signature.
 * https://resend.com/docs/webhooks/verify-webhooks-requests
 */
export function verifyResendWebhook({ rawBody, headers, secret }) {
  const whSecret = trimEnv(secret);
  if (!whSecret) {
    const err = new Error("RESEND_WEBHOOK_SECRET is not configured");
    err.code = "NO_SECRET";
    throw err;
  }

  const id = headers.id;
  const timestamp = headers.timestamp;
  const signatureHeader = headers.signature;
  if (!id || !timestamp || !signatureHeader) {
    const err = new Error("Missing Svix signature headers");
    err.code = "BAD_HEADERS";
    throw err;
  }

  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 60 * 5) {
    const err = new Error("Webhook timestamp out of range");
    err.code = "STALE";
    throw err;
  }

  const key = whSecret.startsWith("whsec_")
    ? Buffer.from(whSecret.slice(6), "base64")
    : Buffer.from(whSecret, "utf8");

  const payload = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", key).update(payload).digest("base64");
  const candidates = String(signatureHeader)
    .split(" ")
    .map((part) => part.replace(/^v1,/, "").trim())
    .filter(Boolean);

  const ok = candidates.some((sig) => {
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(sig);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });

  if (!ok) {
    const err = new Error("Invalid webhook signature");
    err.code = "BAD_SIG";
    throw err;
  }

  return JSON.parse(rawBody);
}

async function fetchReceivedEmail(emailId) {
  const apiKey = trimEnv(config.saas.resendApiKey);
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "User-Agent": "usely/1.0 (+https://usely.dev)",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fetch received email failed (${res.status}): ${body}`);
  }
  return res.json();
}

/** Forward an inbound Resend email to SUPPORT_FORWARD_TO (your real inbox). */
export async function forwardInboundEmail(eventData) {
  const forwardTo =
    trimEnv(config.site.supportForwardTo) || trimEnv(process.env.SUPPORT_FORWARD_TO);
  if (!forwardTo) {
    console.warn(
      "Inbound email received but SUPPORT_FORWARD_TO is unset — view it in the Resend dashboard.",
    );
    return { forwarded: false, reason: "no_forward_to" };
  }

  const emailId = eventData.email_id;
  const metaFrom = eventData.from || "unknown";
  const metaTo = Array.isArray(eventData.to) ? eventData.to.join(", ") : String(eventData.to || "");
  const subject = eventData.subject || "(no subject)";
  const replyTo = metaFrom.includes("<")
    ? metaFrom.match(/<([^>]+)>/)?.[1] || metaFrom
    : metaFrom;

  let html = "";
  let text = "";
  try {
    const full = await fetchReceivedEmail(emailId);
    html = full.html || "";
    text = full.text || "";
  } catch (error) {
    console.error("Could not load inbound body:", error.message);
    text = `(Could not load body from Resend: ${error.message})`;
  }

  const preface =
    `Inbound support email\n` +
    `From: ${metaFrom}\n` +
    `To: ${metaTo}\n` +
    `Subject: ${subject}\n` +
    `Resend id: ${emailId}\n\n`;

  await sendEmail({
    to: forwardTo,
    replyTo,
    subject: `[Usely support] ${subject}`,
    text: preface + (text || "(empty)"),
    html:
      `<div style="font-family:system-ui,sans-serif;font-size:13px;color:#5e646f;margin:0 0 1rem">` +
      `<strong>From</strong> ${escapeHtml(metaFrom)}<br>` +
      `<strong>To</strong> ${escapeHtml(metaTo)}` +
      `</div>` +
      (html || `<pre style="white-space:pre-wrap">${escapeHtml(text || "(empty)")}</pre>`),
  });

  return { forwarded: true, to: forwardTo };
}

export async function handleResendInboundWebhook(req, res) {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? {});

    const secret = config.saas.resendWebhookSecret || process.env.RESEND_WEBHOOK_SECRET;
    let event;
    try {
      event = verifyResendWebhook({
        rawBody,
        headers: {
          id: req.get("svix-id"),
          timestamp: req.get("svix-timestamp"),
          signature: req.get("svix-signature"),
        },
        secret,
      });
    } catch (error) {
      if (config.saas.mock && error.code === "NO_SECRET") {
        event = JSON.parse(rawBody);
      } else {
        console.error("Resend webhook verify failed:", error.message);
        return res.status(401).json({ ok: false, error: "Invalid signature" });
      }
    }

    if (event?.type === "email.received" && event.data) {
      const result = await forwardInboundEmail(event.data);
      console.log(
        `Inbound email ${event.data.email_id} from=${event.data.from} forwarded=${result.forwarded}`,
      );
      return res.json({ ok: true, ...result });
    }

    res.json({ ok: true, ignored: true });
  } catch (error) {
    console.error("Resend inbound webhook failed:", error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}
