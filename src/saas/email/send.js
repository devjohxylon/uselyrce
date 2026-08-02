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

export function setupEmailHtml({ setupUrl, plan }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#050506;font-family:system-ui,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:2.5rem 1.5rem;color:#f0f2f5">
    <p style="letter-spacing:.14em;font-weight:700;font-size:14px;margin:0 0 1.5rem">USELY</p>
    <h1 style="font-size:22px;margin:0 0 .75rem">Your workspace is ready to set up</h1>
    <p style="color:#9aa0ab;line-height:1.6;margin:0 0 1.5rem">
      Thanks for subscribing to the <strong style="color:#f0f2f5">${plan}</strong> plan.
      Finish setup to pick your panel address, invite the Discord bot, and connect
      your Rust Console servers over WebRCON.
    </p>
    <a href="${setupUrl}"
       style="display:inline-block;background:#e8edf4;color:#0b0c0e;font-weight:600;
              padding:12px 22px;border-radius:4px;text-decoration:none">Finish setup</a>
    <p style="color:#5e646f;font-size:13px;margin:1.75rem 0 0;line-height:1.5">
      This link expires in 7 days. If the button doesn't work, paste this into your
      browser:<br><span style="color:#9aa0ab">${setupUrl}</span>
    </p>
  </div>
</body></html>`;
}

export function resetPasswordEmailHtml({ resetUrl }) {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#050506;font-family:system-ui,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:2.5rem 1.5rem;color:#f0f2f5">
    <p style="letter-spacing:.14em;font-weight:700;font-size:14px;margin:0 0 1.5rem">USELY</p>
    <h1 style="font-size:22px;margin:0 0 .75rem">Reset your password</h1>
    <p style="color:#9aa0ab;line-height:1.6;margin:0 0 1.5rem">
      Someone requested a password reset for your Usely owner account.
      If that was you, use the button below. If not, you can ignore this email.
    </p>
    <a href="${resetUrl}"
       style="display:inline-block;background:#e8edf4;color:#0b0c0e;font-weight:600;
              padding:12px 22px;border-radius:4px;text-decoration:none">Choose a new password</a>
    <p style="color:#5e646f;font-size:13px;margin:1.75rem 0 0;line-height:1.5">
      This link expires in 1 hour.<br><span style="color:#9aa0ab">${resetUrl}</span>
    </p>
  </div>
</body></html>`;
}
