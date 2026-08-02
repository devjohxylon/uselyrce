import { promises as fs } from "fs";
import path from "path";
import { config } from "../../config.js";
import { DATA_DIR } from "../../data/store.js";

const OUTBOX = path.join(DATA_DIR, "mock-outbox.json");

async function writeToOutbox(message) {
  let box = [];
  try {
    box = JSON.parse(await fs.readFile(OUTBOX, "utf8"));
  } catch {
    // fresh outbox
  }
  box.push({ ...message, at: new Date().toISOString() });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(OUTBOX, JSON.stringify(box, null, 2), "utf8");
}

function trimEnv(value) {
  return String(value || "")
    .trim()
    // Common Railway paste mistakes: wrapping quotes
    .replace(/^['"]|['"]$/g, "");
}

function parseFrom(raw) {
  const from = trimEnv(raw) || "Usely <onboarding@usely.dev>";
  // Allow "Name <email@domain>" or bare email
  const angled = from.match(/^(.*)<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, "");
    const email = angled[2].trim();
    return name ? `${name} <${email}>` : email;
  }
  return from;
}

function friendlyResendError(status, bodyText) {
  let parsed = null;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    /* plain text */
  }
  const msg = String(parsed?.message || bodyText || "").trim();
  if (/not verified|domain is not verified/i.test(msg)) {
    return `Resend says the from-domain is not verified. EMAIL_FROM must use the exact domain shown as Verified in Resend (status ${status}).`;
  }
  if (/only send testing emails|resend\.dev/i.test(msg)) {
    return `Resend is still in test mode for that from-address. Verify usely.dev (or your sending subdomain) and set EMAIL_FROM to that domain.`;
  }
  if (/invalid.*api.?key|unauthorized|401/i.test(msg) || status === 401) {
    return `Resend rejected the API key (HTTP ${status}). Re-copy RESEND_API_KEY from the same Resend account that owns the domain.`;
  }
  if (/invalid_from|Invalid `from`/i.test(msg) || status === 422) {
    return `Invalid EMAIL_FROM format. Use: Usely <onboarding@usely.dev>`;
  }
  if (status === 403 && /1010|Access denied|User-Agent/i.test(msg + bodyText)) {
    return `Resend blocked the request (403). Redeploy if you have not pulled the User-Agent fix yet.`;
  }
  return msg ? `Resend error (${status}): ${msg}` : `Resend error (HTTP ${status})`;
}

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (config.saas.mock) {
    await writeToOutbox({ to, subject, html, text, replyTo });
    console.log(`MOCK EMAIL → ${to} | ${subject}`);
    if (text) console.log(`  ${text}`);
    return { mock: true };
  }

  const apiKey = trimEnv(config.saas.resendApiKey);
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — cannot send email in live SaaS mode.",
    );
  }

  const from = parseFrom(config.saas.emailFrom);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      // Resend blocks requests with no User-Agent (403 / error 1010).
      "User-Agent": "usely/1.0 (+https://usely.dev)",
    },
    body: JSON.stringify({
      from,
      to: [String(to).trim()],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed from=${from} to=${to} status=${res.status} body=${body}`);
    const err = new Error(friendlyResendError(res.status, body));
    err.code = "RESEND_FAILED";
    err.status = res.status;
    err.detail = body;
    throw err;
  }
  return res.json();
}

/** Ops/debug helper — returns sanitized config + a live Resend probe result. */
export function getEmailConfigPublic() {
  const from = parseFrom(config.saas.emailFrom);
  const key = trimEnv(config.saas.resendApiKey);
  return {
    from,
    hasApiKey: Boolean(key),
    apiKeyPrefix: key ? `${key.slice(0, 6)}…` : null,
    mock: Boolean(config.saas.mock),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared transactional layout — table-based for Gmail/Outlook. */
function emailShell({ title, bodyHtml, ctaLabel, ctaUrl, footnote }) {
  const safeTitle = escapeHtml(title);
  const safeCta = escapeHtml(ctaLabel);
  const safeUrl = escapeHtml(ctaUrl);
  const safeFoot = escapeHtml(footnote);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#eef0f3;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0f3;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e5eb;border-radius:8px;">
          <tr>
            <td style="padding:32px 32px 28px;font-family:Segoe UI,Helvetica Neue,Helvetica,Arial,sans-serif;color:#12141a;">
              <p style="margin:0 0 20px;font-size:12px;font-weight:700;letter-spacing:.16em;color:#6b7280;">USELY</p>
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:650;color:#0b0c0e;">${safeTitle}</h1>
              <div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">
                ${bodyHtml}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:6px;background:#111318;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;font-family:Segoe UI,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                      ${safeCta}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9aa0ab;">
                ${safeFoot}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:Segoe UI,Helvetica Neue,Helvetica,Arial,sans-serif;font-size:12px;color:#9aa0ab;">
          Usely · Rust Console admin
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function setupEmailHtml({ setupUrl, plan }) {
  const planLabel = escapeHtml(plan || "basic");
  return emailShell({
    title: "Finish setting up your workspace",
    bodyHtml: `<p style="margin:0 0 12px;">Thanks for subscribing to the <strong style="color:#12141a;">${planLabel}</strong> plan.</p>
<p style="margin:0;">Open the link below to pick your panel address, invite the Discord bot, and connect WebRCON.</p>`,
    ctaLabel: "Finish setup",
    ctaUrl: setupUrl,
    footnote: "This link expires in 7 days. If the button doesn’t work, copy it from your browser’s address bar after opening the email in a new tab, or reply to this message for help.",
  });
}

export function resetPasswordEmailHtml({ resetUrl }) {
  return emailShell({
    title: "Reset your password",
    bodyHtml: `<p style="margin:0 0 12px;">We got a request to reset the password for your Usely owner account.</p>
<p style="margin:0;">If that was you, choose a new password below. If it wasn’t, you can ignore this email.</p>`,
    ctaLabel: "Choose a new password",
    ctaUrl: resetUrl,
    footnote: "This link expires in 1 hour.",
  });
}
