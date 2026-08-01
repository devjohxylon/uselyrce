/**
 * Create Usely Stripe products/prices + webhook, push IDs to Railway.
 * Never prints secret values.
 */
import { spawnSync } from "child_process";
import Stripe from "stripe";

const SERVICE = "app";
const WEBHOOK_URL = "https://app.usely.dev/billing/stripe/webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

const PLANS = [
  {
    env: "STRIPE_PRICE_BASIC",
    name: "Usely Basic",
    description: "1 Rust Console server — admin panel + Discord bot",
    amount: 2000,
    lookup: "usely_basic_monthly",
  },
  {
    env: "STRIPE_PRICE_PRO",
    name: "Usely Pro",
    description: "2 Rust Console servers — admin panel + Discord bot",
    amount: 4900,
    lookup: "usely_pro_monthly",
  },
  {
    env: "STRIPE_PRICE_NETWORK",
    name: "Usely Network",
    description: "Multi-server network — admin panel + Discord bot",
    amount: 9900,
    lookup: "usely_network_monthly",
  },
];

function railwayKv() {
  const r = spawnSync(
    "npx",
    ["--yes", "@railway/cli@latest", "variable", "list", "--service", SERVICE, "--kv"],
    { encoding: "utf8", shell: true },
  );
  if (r.status !== 0) {
    throw new Error(`railway variable list failed: ${r.stderr || r.stdout}`);
  }
  const out = {};
  for (const line of (r.stdout || "").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

function setVar(key, value, { skipDeploys = true } = {}) {
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
  if (r.status !== 0) {
    // fallback: stdin style used by older CLI
    const r2 = spawnSync(
      "npx",
      [
        "--yes",
        "@railway/cli@latest",
        "variable",
        "set",
        key,
        "--service",
        SERVICE,
        ...(skipDeploys ? ["--skip-deploys"] : []),
      ],
      { input: value, encoding: "utf8", shell: true },
    );
    if (r2.status !== 0) {
      throw new Error(`Failed to set ${key}: ${r2.stderr || r.stderr || r.stdout}`);
    }
  }
}

async function findOrCreateProduct(stripe, plan) {
  const existing = await stripe.products.search({
    query: `name:"${plan.name}"`,
    limit: 1,
  }).catch(() => null);
  if (existing?.data?.[0]) return existing.data[0];

  const listed = await stripe.products.list({ limit: 100, active: true });
  const hit = listed.data.find((p) => p.name === plan.name);
  if (hit) return hit;

  return stripe.products.create({
    name: plan.name,
    description: plan.description,
    tax_code: "txcd_10103001",
    metadata: { usely_plan: plan.lookup },
  });
}

async function findOrCreatePrice(stripe, product, plan) {
  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const hit = prices.data.find(
    (p) =>
      p.type === "recurring" &&
      p.recurring?.interval === "month" &&
      p.unit_amount === plan.amount &&
      p.currency === "usd",
  );
  if (hit) return hit;

  return stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: plan.amount,
    recurring: { interval: "month" },
    lookup_key: plan.lookup,
    transfer_lookup_key: true,
    tax_behavior: "exclusive",
    metadata: { usely_plan: plan.lookup },
  });
}

async function findOrCreateWebhook(stripe) {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find((e) => e.url === WEBHOOK_URL);
  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: WEBHOOK_EVENTS,
      description: "Usely SaaS billing",
    });
  } else {
    endpoint = await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: WEBHOOK_EVENTS,
      disabled: false,
    });
  }
  // secret only returned on create; if updating, keep existing Railway secret unless missing
  return endpoint;
}

async function main() {
  const vars = railwayKv();
  const secret = vars.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set on Railway service app");
  }
  const mode = secret.startsWith("sk_live")
    ? "live"
    : secret.startsWith("sk_test")
      ? "test"
      : "unknown";
  console.log(`Using Stripe mode: ${mode}`);

  const stripe = new Stripe(secret);
  const priceIds = {};

  for (const plan of PLANS) {
    const product = await findOrCreateProduct(stripe, plan);
    const price = await findOrCreatePrice(stripe, product, plan);
    priceIds[plan.env] = price.id;
    console.log(`${plan.name}: ${price.id} ($${plan.amount / 100}/mo)`);
  }

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find((e) => e.url === WEBHOOK_URL);
  let webhookSecret = vars.STRIPE_WEBHOOK_SECRET?.trim() || "";

  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({
      url: WEBHOOK_URL,
      enabled_events: WEBHOOK_EVENTS,
      description: "Usely SaaS billing",
    });
    webhookSecret = endpoint.secret;
    console.log(`Created webhook endpoint ${endpoint.id}`);
  } else {
    await stripe.webhookEndpoints.update(endpoint.id, {
      enabled_events: WEBHOOK_EVENTS,
      disabled: false,
    });
    console.log(`Updated webhook endpoint ${endpoint.id}`);
    if (!webhookSecret) {
      console.log(
        "Webhook already existed — signing secret is only shown on create.",
      );
      console.log(
        "If checkout works but webhooks fail, delete the endpoint in Stripe and re-run this script.",
      );
    }
  }

  for (const [key, value] of Object.entries(priceIds)) {
    setVar(key, value, { skipDeploys: true });
    console.log(`Set ${key}`);
  }
  if (webhookSecret) {
    setVar("STRIPE_WEBHOOK_SECRET", webhookSecret, { skipDeploys: true });
    console.log("Set STRIPE_WEBHOOK_SECRET");
  }

  // Trigger one deploy with the last var so Railway picks everything up
  setVar("STRIPE_PRICE_BASIC", priceIds.STRIPE_PRICE_BASIC, { skipDeploys: false });
  console.log("Redeploy triggered.");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
