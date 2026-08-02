import { config } from "../../config.js";
import {
  createAccount,
  createSetupToken,
  getAccountByEmail,
} from "../db/accounts.js";
import {
  createOrg,
  getOrgByStripeCustomer,
  getOrgByStripeSubscription,
  updateOrgFields,
} from "../db/orgs.js";
import { sendEmail, setupEmailHtml } from "../email/send.js";

async function issueSetupLink({ account, org, plan, skipEmail }) {
  const token = await createSetupToken({ accountId: account.id, orgId: org.id });
  const setupUrl = `${config.saas.publicUrl.replace(/\/$/, "")}/setup?token=${token}`;

  if (!skipEmail) {
    await sendEmail({
      to: account.email,
      subject: "Finish setting up your Usely workspace",
      html: setupEmailHtml({ setupUrl, plan: plan || org.plan || "basic" }),
      text: `Thanks for subscribing to Usely (${plan || org.plan || "basic"} plan). Finish setup: ${setupUrl}`,
    });
  }

  return { account, org, setupUrl };
}

/**
 * Runs after a successful purchase (Stripe webhook, or instantly in mock mode).
 * Idempotent on Stripe customer / subscription ids so webhook retries are safe.
 */
export async function finalizeSignup({
  email,
  plan,
  stripeCustomerId,
  stripeSubscriptionId,
  skipEmail = false,
}) {
  const normalized = String(email).toLowerCase().trim();
  let account = await getAccountByEmail(normalized);
  if (!account) account = await createAccount({ email: normalized });

  let org =
    (stripeSubscriptionId && (await getOrgByStripeSubscription(stripeSubscriptionId))) ||
    (stripeCustomerId && (await getOrgByStripeCustomer(stripeCustomerId))) ||
    null;

  if (org) {
    await updateOrgFields(org.id, {
      plan: plan || org.plan || "basic",
      plan_status: "active",
      ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
      ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
    });
    org = { ...org, plan: plan || org.plan, plan_status: "active" };
    // Already finished (or mid-setup with a password): never create duplicate orgs/emails.
    if (account.password_hash) {
      return { account, org, setupUrl: null, existing: true };
    }
    return { ...(await issueSetupLink({ account, org, plan, skipEmail })), existing: true };
  }

  org = await createOrg({
    name: `${normalized.split("@")[0]}'s workspace`,
    ownerAccountId: account.id,
    plan,
  });
  await updateOrgFields(org.id, {
    plan_status: "active",
    ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
  });
  org = { ...org, plan_status: "active" };

  return { ...(await issueSetupLink({ account, org, plan, skipEmail })), existing: false };
}
