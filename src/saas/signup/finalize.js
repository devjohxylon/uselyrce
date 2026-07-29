import { config } from "../../config.js";
import {
  createAccount,
  createSetupToken,
  getAccountByEmail,
} from "../db/accounts.js";
import { createOrg, updateOrgFields } from "../db/orgs.js";
import { sendEmail, setupEmailHtml } from "../email/send.js";

/**
 * Runs after a successful purchase (Stripe webhook, or instantly in mock mode).
 * Creates the account + org, then emails the setup link.
 */
export async function finalizeSignup({ email, plan, stripeCustomerId, stripeSubscriptionId }) {
  const normalized = String(email).toLowerCase().trim();
  let account = await getAccountByEmail(normalized);
  if (!account) account = await createAccount({ email: normalized });

  const org = await createOrg({
    name: `${normalized.split("@")[0]}'s workspace`,
    ownerAccountId: account.id,
    plan,
  });
  await updateOrgFields(org.id, {
    plan_status: "active",
    ...(stripeCustomerId ? { stripe_customer_id: stripeCustomerId } : {}),
    ...(stripeSubscriptionId ? { stripe_subscription_id: stripeSubscriptionId } : {}),
  });

  const token = await createSetupToken({ accountId: account.id, orgId: org.id });
  const setupUrl = `${config.saas.publicUrl.replace(/\/$/, "")}/setup?token=${token}`;

  await sendEmail({
    to: normalized,
    subject: "Finish setting up your Usely workspace",
    html: setupEmailHtml({ setupUrl, plan }),
    text: `Thanks for subscribing to Usely (${plan} plan). Finish setup: ${setupUrl}`,
  });

  return { account, org, setupUrl };
}
