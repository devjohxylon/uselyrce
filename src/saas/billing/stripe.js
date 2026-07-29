import Stripe from "stripe";
import { config } from "../../config.js";
import { getOrg, getOrgByStripeCustomer, updateStripe } from "../db/orgs.js";

let stripe = null;

function getStripe() {
  if (!config.saas.stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripe) stripe = new Stripe(config.saas.stripeSecretKey);
  return stripe;
}

function priceIdForPlan(plan) {
  const map = {
    basic: config.saas.stripePriceBasic,
    pro: config.saas.stripePricePro,
    network: config.saas.stripePriceNetwork,
  };
  const id = map[plan];
  if (!id) throw new Error(`No Stripe price configured for plan "${plan}"`);
  return id;
}

export async function createCheckoutSession(org, plan = "basic") {
  if (config.saas.mock) {
    await updateStripe(org.id, {
      plan,
      plan_status: "active",
      stripe_customer_id: org.stripe_customer_id || `mock_cus_${org.id}`,
      stripe_subscription_id: `mock_sub_${plan}`,
    });
    return "/admin?billing=success";
  }
  const s = getStripe();
  const price = priceIdForPlan(plan);
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await s.customers.create({
      name: org.name,
      metadata: { org_id: org.id },
    });
    customerId = customer.id;
    await updateStripe(org.id, { stripe_customer_id: customerId });
  }

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${config.saas.publicUrl.replace(/\/$/, "")}/admin?billing=success`,
    cancel_url: `${config.saas.publicUrl.replace(/\/$/, "")}/admin?billing=cancel`,
    metadata: { org_id: org.id, plan },
    subscription_data: { metadata: { org_id: org.id, plan } },
  });
  return session.url;
}

/** Pre-account checkout from the public signup page (buy-first flow). */
export async function createSignupCheckout(email, plan) {
  const s = getStripe();
  const price = priceIdForPlan(plan);
  const base = config.saas.publicUrl.replace(/\/$/, "");
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer_email: email,
    line_items: [{ price, quantity: 1 }],
    success_url: `${base}/signup/sent?email=${encodeURIComponent(email)}`,
    cancel_url: `${base}/pricing`,
    metadata: { signup_email: email, plan },
    subscription_data: { metadata: { signup_email: email, plan } },
  });
  return session.url;
}

export async function createPortalSession(org) {
  if (config.saas.mock) return "/admin";
  const s = getStripe();
  if (!org.stripe_customer_id) throw new Error("No Stripe customer yet — subscribe first.");
  const portal = await s.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${config.saas.publicUrl.replace(/\/$/, "")}/admin`,
  });
  return portal.url;
}

function planFromPriceId(priceId) {
  if (priceId === config.saas.stripePriceBasic) return "basic";
  if (priceId === config.saas.stripePricePro) return "pro";
  if (priceId === config.saas.stripePriceNetwork) return "network";
  return "basic";
}

export async function handleStripeWebhook(rawBody, signature) {
  const s = getStripe();
  if (!config.saas.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  const event = s.webhooks.constructEvent(
    rawBody,
    signature,
    config.saas.stripeWebhookSecret,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.signup_email) {
        const { finalizeSignup } = await import("../signup/finalize.js");
        await finalizeSignup({
          email: session.metadata.signup_email,
          plan: session.metadata.plan || "basic",
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
        });
        break;
      }
      const orgId = session.metadata?.org_id;
      if (!orgId) break;
      await updateStripe(orgId, {
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        plan: session.metadata?.plan || "basic",
        plan_status: "active",
      });
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const org =
        (await getOrg(sub.metadata?.org_id)) ||
        (await getOrgByStripeCustomer(sub.customer));
      if (!org) break;
      const priceId = sub.items?.data?.[0]?.price?.id;
      const statusMap = {
        active: "active",
        trialing: "trialing",
        past_due: "past_due",
        canceled: "canceled",
        unpaid: "past_due",
        incomplete: "inactive",
        incomplete_expired: "canceled",
      };
      await updateStripe(org.id, {
        stripe_subscription_id: sub.id,
        plan: planFromPriceId(priceId),
        plan_status: statusMap[sub.status] || "inactive",
      });
      break;
    }
    default:
      break;
  }

  return { received: true };
}
