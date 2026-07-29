import crypto from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../config.js";
import {
  getAccount,
  getAccountByEmail,
  getValidSetupToken,
  markSetupTokenUsed,
  setAccountPassword,
} from "../db/accounts.js";
import { getOrg, updateOrgFields } from "../db/orgs.js";
import { hashPassword } from "../auth/passwords.js";
import { setSaasSessionCookie } from "../auth/discord-session.js";
import { baseDomain, isSlugAvailable, orgPanelUrl, slugProblem } from "../tenancy.js";
import { finalizeSignup } from "./finalize.js";

const SITE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../server/site",
);
const SIGNUP_HTML = readFileSync(path.join(SITE_DIR, "signup.html"), "utf8");
const SETUP_HTML = readFileSync(path.join(SITE_DIR, "setup.html"), "utf8");

// One-time hop tokens so the session cookie gets set on the org's own
// subdomain after setup (cookies don't cross hosts on localhost).
const exchangeTokens = new Map(); // token -> { accountId, email, exp }
const EXCHANGE_TTL_MS = 5 * 60 * 1000;

export function createExchangeToken({ accountId, email }) {
  const token = crypto.randomBytes(24).toString("base64url");
  exchangeTokens.set(token, { accountId, email, exp: Date.now() + EXCHANGE_TTL_MS });
  return token;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function attachSignupRoutes(app) {
  if (!config.saas.enabled) return;

  app.get("/signup", (_req, res) => res.type("html").send(SIGNUP_HTML));
  app.get("/setup", (_req, res) => res.type("html").send(SETUP_HTML));

  app.get("/signup/sent", (_req, res) => {
    res.type("html").send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Check your email — Usely</title>
      <style>body{font-family:"Space Grotesk",system-ui,sans-serif;background:#050506;color:#f0f2f5;display:grid;place-items:center;min-height:100vh;margin:0}
      a{color:#d7dde6}</style></head><body><div style="max-width:26rem;padding:2rem;text-align:center">
      <h1 style="font-weight:600">Check your email</h1>
      <p style="color:#9aa0ab;line-height:1.6">Payment received. We emailed you a setup link — open it to pick your panel address and password.</p>
      <p><a href="/">← usely.dev</a></p></div></body></html>`);
  });

  app.post("/api/signup/checkout", async (req, res) => {
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      const plan = ["basic", "pro", "network"].includes(req.body?.plan)
        ? req.body.plan
        : "basic";
      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ ok: false, error: "Enter a valid email address." });
      }

      if (config.saas.mock) {
        const { setupUrl } = await finalizeSignup({ email, plan });
        return res.json({ ok: true, mock: true, setupUrl });
      }

      const { createSignupCheckout } = await import("../billing/stripe.js");
      const url = await createSignupCheckout(email, plan);
      res.json({ ok: true, url });
    } catch (error) {
      console.error("Signup checkout failed:", error.message);
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/setup/info", async (req, res) => {
    const row = await getValidSetupToken(String(req.query.token || ""));
    if (!row) return res.status(404).json({ ok: false, error: "Invalid or expired link" });
    const [account, org] = await Promise.all([
      getAccount(row.account_id),
      getOrg(row.org_id),
    ]);
    if (!account || !org) return res.status(404).json({ ok: false, error: "Invalid link" });
    res.json({
      ok: true,
      email: account.email,
      plan: org.plan,
      hasPassword: Boolean(account.password_hash),
      baseDomain: baseDomain(),
    });
  });

  app.get("/api/setup/slug", async (req, res) => {
    const slug = String(req.query.slug || "").toLowerCase().trim();
    const problem = slugProblem(slug);
    if (problem) return res.json({ available: false, reason: problem, baseDomain: baseDomain() });
    const available = await isSlugAvailable(slug);
    res.json({
      available,
      reason: available ? null : "That address is taken.",
      baseDomain: baseDomain(),
    });
  });

  app.post("/api/setup/complete", async (req, res) => {
    try {
      const row = await getValidSetupToken(String(req.body?.token || ""));
      if (!row) return res.status(400).json({ ok: false, error: "Invalid or expired link" });

      const orgName = String(req.body?.orgName || "").trim();
      const slug = String(req.body?.slug || "").toLowerCase().trim();
      const password = req.body?.password;
      if (!orgName) return res.status(400).json({ ok: false, error: "Workspace name required" });
      const problem = slugProblem(slug);
      if (problem) return res.status(400).json({ ok: false, error: problem });
      if (!(await isSlugAvailable(slug))) {
        return res.status(409).json({ ok: false, error: "That address is taken." });
      }

      const account = await getAccount(row.account_id);
      if (!account) return res.status(400).json({ ok: false, error: "Account missing" });
      if (!account.password_hash) {
        if (!password || String(password).length < 8) {
          return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
        }
        await setAccountPassword(account.id, hashPassword(password));
      }

      const org = await updateOrgFields(row.org_id, { name: orgName, slug });
      await markSetupTokenUsed(row.token);

      const hop = createExchangeToken({ accountId: account.id, email: account.email });
      const redirect = `${orgPanelUrl(org).replace(/\/admin$/, "")}/admin/auth/exchange?t=${hop}`;
      res.json({ ok: true, redirect, panelUrl: orgPanelUrl(org) });
    } catch (error) {
      console.error("Setup completion failed:", error.message);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  app.get("/admin/auth/exchange", (req, res) => {
    const token = String(req.query.t || "");
    const entry = exchangeTokens.get(token);
    exchangeTokens.delete(token);
    if (!entry || entry.exp < Date.now()) {
      return res.redirect(302, "/admin");
    }
    setSaasSessionCookie(res, {
      accountId: entry.accountId,
      email: entry.email,
      username: entry.email.split("@")[0],
    });
    res.redirect(302, "/admin");
  });
}
