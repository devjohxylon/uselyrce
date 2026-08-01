/**
 * Build ops health checklist from org + servers + live probe hints.
 * Never includes secrets.
 */

export function buildHealth(org, servers, { botInGuild = null, discordReady = false } = {}) {
  const checks = [];
  const status = org.plan_status || "inactive";
  const planOk = status === "active" || status === "trialing";
  checks.push({
    id: "plan",
    ok: planOk,
    detail: status,
  });

  const needsBilling = !["inactive", "canceled"].includes(status);
  const hasCustomer = Boolean(org.stripe_customer_id);
  const hasSub = Boolean(org.stripe_subscription_id);
  const billingOk = !needsBilling || (hasCustomer && hasSub);
  checks.push({
    id: "billing",
    ok: billingOk,
    detail: needsBilling
      ? [
          hasCustomer ? "customer" : "no customer",
          hasSub ? "subscription" : "no subscription",
        ].join(", ")
      : "not required",
  });

  const guildId = org.discord_guild_id || null;
  checks.push({
    id: "guild",
    ok: Boolean(guildId),
    detail: guildId || "not linked",
  });

  if (!guildId) {
    checks.push({ id: "bot", ok: false, detail: "guild not linked" });
  } else if (!discordReady) {
    checks.push({ id: "bot", ok: null, detail: "Discord client not ready" });
  } else if (botInGuild == null) {
    checks.push({ id: "bot", ok: null, detail: "unknown" });
  } else {
    checks.push({
      id: "bot",
      ok: Boolean(botInGuild),
      detail: botInGuild ? "bot in guild" : "bot not in guild",
    });
  }

  const list = Array.isArray(servers) ? servers : [];
  checks.push({
    id: "servers",
    ok: list.length > 0,
    detail: list.length ? `${list.length} server(s)` : "none",
  });

  const enabled = list.filter((s) => s.enabled !== false);
  if (enabled.length === 0) {
    checks.push({
      id: "rcon",
      ok: list.length === 0 ? false : true,
      detail: list.length === 0 ? "no servers" : "no enabled servers",
    });
  } else {
    const connected = enabled.filter((s) => s.rcon?.connected).length;
    const attached = enabled.filter((s) => s.rcon?.attached).length;
    checks.push({
      id: "rcon",
      ok: connected === enabled.length,
      detail: `${connected}/${enabled.length} connected (${attached} attached)`,
    });
  }

  const hardFail =
    status === "past_due" ||
    status === "unpaid" ||
    !checks.find((c) => c.id === "servers")?.ok ||
    (enabled.length > 0 && enabled.every((s) => !s.rcon?.connected));

  const anyFail = checks.some((c) => c.ok === false);
  const anyWarn = checks.some((c) => c.ok == null);

  let overall = "ok";
  if (hardFail) overall = "down";
  else if (anyFail || anyWarn) overall = "degraded";

  return { overall, checks };
}

export function serializeServerForOps(server, poolStatus) {
  const attached = Boolean(poolStatus?.enabled);
  const connected = Boolean(poolStatus?.connected);
  return {
    id: server.id,
    name: server.name,
    enabled: server.enabled !== false,
    host: server.rcon_host ?? server.host ?? null,
    port: server.rcon_port ?? server.port ?? null,
    hasPassword: Boolean(server.hasPassword ?? server.rcon_password_enc),
    rcon: {
      attached,
      connected,
      lastError: poolStatus?.lastError ?? null,
      connectedAt: poolStatus?.connectedAt ?? null,
    },
  };
}
