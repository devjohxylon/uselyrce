export const PLAN_LIMITS = {
  basic: 1,
  pro: 2,
  // Marketed as "4+" — soft cap for multi-server networks
  network: 20,
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
  return status === "active" || status === "trialing";
}

export function assertCanAddServer(org, currentCount) {
  const status = org.plan_status;
  const live = isPlanLive(status);
  // inactive = pre-checkout / ops preview onboarding — allow a single server only.
  const onboarding = status === "inactive";

  if (!live && !onboarding) {
    const err = new Error("Active subscription required to add a server.");
    err.code = "PLAN_REQUIRED";
    throw err;
  }
  if (onboarding && currentCount >= 1) {
    const err = new Error("Active subscription required to add more servers.");
    err.code = "PLAN_REQUIRED";
    throw err;
  }

  const max = maxServersForPlan(org.plan || "basic");
  if (currentCount >= max) {
    const err = new Error(
      `Plan "${org.plan}" allows ${max} server(s). Upgrade to add more.`,
    );
    err.code = "SERVER_LIMIT";
    throw err;
  }
}
