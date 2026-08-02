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

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (config.saas.mock) {
    await writeToOutbox({ to, subject, html, text, replyTo });
    console.log(`MOCK EMAIL → ${to} | ${subject}`);
    if (text) console.log(`  ${text}`);
    return { mock: true };
  }

  if (!config.saas.resendApiKey) {
    throw new Error(
      "RESEND_API_KEY is not configured — cannot send email in live SaaS mode.",
    );
  }

  const from = config.saas.emailFrom || "Usely <onboarding@usely.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.saas.resendApiKey}`,
      "Content-Type": "application/json",
      // Resend blocks requests with no User-Agent (403 / error 1010).
      "User-Agent": "usely/1.0 (+https://usely.dev)",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend send failed from=${from} to=${to} status=${res.status} body=${body}`);
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
  return res.json();
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
