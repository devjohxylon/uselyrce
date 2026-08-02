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

function assetBaseUrl() {
  const configured = trimEnv(config.saas.publicUrl).replace(/\/$/, "");
  if (configured && !/localhost/i.test(configured)) return configured;
  return "https://app.usely.dev";
}

/**
 * Dark Usely-branded transactional layout (matches marketing / panel theme).
 * Table-based for Gmail/Outlook; logo hosted on the app origin.
 */
function emailShell({ title, bodyHtml, ctaLabel, ctaUrl, footnote }) {
  const safeTitle = escapeHtml(title);
  const safeCta = escapeHtml(ctaLabel);
  const safeUrl = escapeHtml(ctaUrl);
  const safeFoot = escapeHtml(footnote);
  const logoUrl = escapeHtml(`${assetBaseUrl()}/logo.png`);
  const font =
    "Space Grotesk,Segoe UI,Helvetica Neue,Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background:#050506;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050506;margin:0;padding:0;">
    <tr>
      <td align="center" style="padding:40px 16px;background:#050506;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#0c0d10;border:1px solid rgba(255,255,255,.1);border-radius:4px;">
          <tr>
            <td style="padding:28px 28px 8px;font-family:${font};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 10px 0 0;vertical-align:middle;">
                    <img src="${logoUrl}" width="28" height="28" alt="Usely" style="display:block;width:28px;height:28px;border-radius:6px;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-family:${font};font-size:12px;font-weight:700;letter-spacing:.18em;color:#d7dde6;">
                    USELY
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px;font-family:${font};color:#f0f2f5;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em;color:#f0f2f5;">${safeTitle}</h1>
              <div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a3aab6;">
                ${bodyHtml}
              </div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
                <tr>
                  <td style="border-radius:4px;background:#e8edf4;">
                    <a href="${safeUrl}" style="display:inline-block;padding:12px 20px;font-family:${font};font-size:14px;font-weight:600;color:#0b0c0e;text-decoration:none;border-radius:4px;">
                      ${safeCta}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#5e646f;">
                ${safeFoot}
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;font-family:${font};font-size:12px;letter-spacing:.04em;color:#5e646f;">
          usely.dev · Rust Console admin
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
    bodyHtml: `<p style="margin:0 0 12px;">Thanks for subscribing to the <strong style="color:#f0f2f5;">${planLabel}</strong> plan.</p>
<p style="margin:0;">Pick your panel address, invite the Discord bot, and connect WebRCON to get online.</p>`,
    ctaLabel: "Finish setup",
    ctaUrl: setupUrl,
    footnote: "This link expires in 7 days. If you didn't expect this email, you can ignore it. Terms and Privacy: https://www.usely.dev/terms · https://www.usely.dev/privacy",
  });
}

export function resetPasswordEmailHtml({ resetUrl }) {
  return emailShell({
    title: "Reset your password",
    bodyHtml: `<p style="margin:0 0 12px;">We got a request to reset the password for your Usely owner account.</p>
<p style="margin:0;">If that was you, choose a new password below. If it wasn't, you can ignore this email.</p>`,
    ctaLabel: "Choose a new password",
    ctaUrl: resetUrl,
    footnote: "This link expires in 1 hour. Terms and Privacy: https://www.usely.dev/terms · https://www.usely.dev/privacy",
  });
}
