/**
 * Launch checklist helper: ensure ops access code, verify Stripe webhook + Resend + volume-ish vars.
 * Never prints secret values.
 */
import { spawnSync } from "child_process";
import crypto from "crypto";
import Stripe from "stripe";

const SERVICE = "app";
const WEBHOOK_URL = "https://app.usely.dev/billing/stripe/webhook";

function railwayKv() {
  const r = spawnSync(
    "npx",
    ["--yes", "@railway/cli@latest", "variable", "list", "--service", SERVICE, "--kv"],
    { encoding: "utf8", shell: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "railway list failed");
  const out = {};
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function setVar(key, value, { skipDeploys = false } = {}) {
  const args = [
    "--yes",
    "@railway/cli@latest",
    "variable",
    "set",
    `${key}=${value}`,
    "--service",
    SERVICE,
  ];
  if (skipDeploys) args.push("--skip-deploys");
  const r = spawnSync("npx", args, { encoding: "utf8", shell: true });
  if (r.status !== 0) throw new Error(`set ${key} failed: ${r.stderr || r.stdout}`);
}

function mask(key, value) {
  if (!value) return "(empty)";
  if (key.includes("SECRET") || key.includes("KEY")) {
    if (value.startsWith("sk_live")) return "sk_live";
    if (value.startsWith("sk_test")) return "sk_test";
    if (value.startsWith("whsec_")) return `whsec_ len=${value.length}`;
    if (value.startsWith("re_")) return "re_…";
    return `(set len=${value.length})`;
  }
  return value;
}

async function main() {
  const vars = railwayKv();
  const report = {};

  // Ops access code (platform customer console — not game admin)
  if (!vars.USELY_OPS_CODE?.trim()) {
    const code = crypto.randomBytes(18).toString("base64url");
    setVar("USELY_OPS_CODE", code, { skipDeploys: false });
    report.ops = `USELY_OPS_CODE set (len=${code.length}) — copy from Railway vars`;
  } else {
    report.ops = `USELY_OPS_CODE already set (len=${vars.USELY_OPS_CODE.length})`;
  }

  // Core config sanity
  for (const k of [
    "SAAS_MODE",
    "SAAS_MOCK",
    "ADMIN_PANEL_URL",
    "SAAS_BASE_DOMAIN",
    "DATA_DIR",
    "EMAIL_FROM",
    "SUPPORT_EMAIL",
    "STRIPE_PRICE_BASIC",
    "STRIPE_PRICE_PRO",
    "STRIPE_PRICE_NETWORK",
  ]) {
    report[k] = mask(k, vars[k]);
  }
  report.STRIPE_SECRET_KEY = mask("STRIPE_SECRET_KEY", vars.STRIPE_SECRET_KEY);
  report.STRIPE_WEBHOOK_SECRET = mask("STRIPE_WEBHOOK_SECRET", vars.STRIPE_WEBHOOK_SECRET);
  report.RESEND_API_KEY = mask("RESEND_API_KEY", vars.RESEND_API_KEY);

  // Stripe webhook health
  if (vars.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(vars.STRIPE_SECRET_KEY);
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const ep = endpoints.data.find((e) => e.url === WEBHOOK_URL);
    if (!ep) {
      report.webhook = "MISSING endpoint";
    } else {
      report.webhook = `${ep.id} status=${ep.status} disabled=${ep.disabled}`;
      const attempts = await stripe.events.list({ limit: 5, type: "checkout.session.completed" }).catch(() => null);
      report.recentCheckoutEvents = attempts?.data?.length ?? 0;
    }

    // Verify prices exist
    for (const k of ["STRIPE_PRICE_BASIC", "STRIPE_PRICE_PRO", "STRIPE_PRICE_NETWORK"]) {
      const id = vars[k];
      if (!id) {
        report[`${k}_ok`] = false;
        continue;
      }
      try {
        const p = await stripe.prices.retrieve(id);
        report[`${k}_ok`] = `${p.active} $${(p.unit_amount || 0) / 100}/${p.recurring?.interval}`;
      } catch (e) {
        report[`${k}_ok`] = `FAIL: ${e.message}`;
      }
    }
  }

  // Volume presence from railway status (best-effort)
  const status = spawnSync(
    "npx",
    ["--yes", "@railway/cli@latest", "status"],
    { encoding: "utf8", shell: true },
  );
  report.volumeMentioned = /volume|\/app\/\.data/i.test(status.stdout || "");
  report.dataDir = vars.DATA_DIR || "(empty — should be /app/.data)";

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
