export const PLAN_LIMITS = {
  basic: 1,
  pro: 5,
  network: 15,
};

export const PLAN_PRICES_USD = {
  basic: 20,
  pro: 49,
  network: 99,
};

export function maxServersForPlan(plan) {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.basic;
}

export function isPlanLive(status) {
  return status === "active" || status === "trialing" || status === "past_due";
}

export function assertCanAddServer(org, currentCount) {
  if (!isPlanLive(org.plan_status) && org.plan_status !== "inactive") {
    // inactive orgs may still be in setup before first checkout — allow 0→1 only during onboarding
  }
  const max = maxServersForPlan(org.plan || "basic");
  if (!isPlanLive(org.plan_status) && currentCount >= 1) {
    const err = new Error("Active subscription required to add more servers.");
    err.code = "PLAN_REQUIRED";
    throw err;
  }
  if (currentCount >= max) {
    const err = new Error(
      `Plan "${org.plan}" allows ${max} server(s). Upgrade to add more.`,
    );
    err.code = "SERVER_LIMIT";
    throw err;
  }
}
