/**
 * Sample ops orgs for USELY_OPS_MOCK — in-memory, mutable for fix-button demos.
 * Never touches Supabase / Stripe / Discord.
 */

import { buildHealth, serializeServerForOps } from "./health.js";

function seed() {
  return {
    astral: {
      org: {
        id: "ops-mock-1",
        name: "Astral Rust",
        slug: "astral",
        plan: "pro",
        plan_status: "active",
        created_at: "2026-06-12T14:22:00.000Z",
        owner_email: "owner@astral.example",
        owner_discord_id: "1001",
        discord_guild_id: "guild-astral",
        stripe_customer_id: "cus_mock_astral",
        stripe_subscription_id: "sub_mock_astral",
        default_server_id: "ops-srv-a1",
      },
      botInGuild: true,
      servers: [
        mockSrv("ops-srv-a1", "Main", "10.0.0.1", 28016, true, true),
        mockSrv("ops-srv-a2", "Build", "10.0.0.2", 28016, true, true),
        mockSrv("ops-srv-a3", "Events", "10.0.0.3", 28016, true, true),
      ],
    },
    nightfall: {
      org: {
        id: "ops-mock-2",
        name: "Nightfall Network",
        slug: "nightfall",
        plan: "network",
        plan_status: "trialing",
        created_at: "2026-07-01T09:10:00.000Z",
        owner_email: "admin@nightfall.example",
        owner_discord_id: "1002",
        discord_guild_id: "guild-nightfall",
        stripe_customer_id: "cus_mock_night",
        stripe_subscription_id: "sub_mock_night",
        default_server_id: "ops-srv-n1",
      },
      botInGuild: true,
      servers: [
        mockSrv("ops-srv-n1", "US East", "10.1.0.1", 28016, true, true),
        mockSrv("ops-srv-n2", "US West", "10.1.0.2", 28016, true, false),
        mockSrv("ops-srv-n3", "EU", "10.1.0.3", 28016, true, true),
      ],
    },
    copper: {
      org: {
        id: "ops-mock-3",
        name: "Copper Basin",
        slug: "copper",
        plan: "basic",
        plan_status: "active",
        created_at: "2026-07-18T18:40:00.000Z",
        owner_email: "hello@copper.example",
        owner_discord_id: null,
        discord_guild_id: null,
        stripe_customer_id: "cus_mock_copper",
        stripe_subscription_id: "sub_mock_copper",
        default_server_id: "ops-srv-c1",
      },
      botInGuild: false,
      servers: [mockSrv("ops-srv-c1", "Only", "10.2.0.1", 28016, true, true)],
    },
    dustbowl: {
      org: {
        id: "ops-mock-4",
        name: "Dustbowl Duo",
        slug: "dustbowl",
        plan: "basic",
        plan_status: "past_due",
        created_at: "2026-07-22T11:05:00.000Z",
        owner_email: "bills@dustbowl.example",
        owner_discord_id: "1004",
        discord_guild_id: "guild-dust",
        stripe_customer_id: "cus_mock_dust",
        stripe_subscription_id: "sub_mock_dust",
        default_server_id: "ops-srv-d1",
      },
      botInGuild: true,
      servers: [
        mockSrv("ops-srv-d1", "Alpha", "10.3.0.1", 28016, true, false),
        mockSrv("ops-srv-d2", "Beta", "10.3.0.2", 28016, true, false),
      ],
    },
    ghosttown: {
      org: {
        id: "ops-mock-5",
        name: "Ghost Town",
        slug: "ghosttown",
        plan: "pro",
        plan_status: "canceled",
        created_at: "2026-05-03T20:00:00.000Z",
        owner_email: "old@ghost.example",
        owner_discord_id: null,
        discord_guild_id: null,
        stripe_customer_id: null,
        stripe_subscription_id: null,
        default_server_id: null,
      },
      botInGuild: false,
      servers: [],
    },
  };
}

function mockSrv(id, name, host, port, attached, connected) {
  return {
    id,
    name,
    enabled: true,
    rcon_host: host,
    rcon_port: port,
    hasPassword: true,
    _attached: attached,
    _connected: connected,
    _lastError: connected ? null : "Not connected to the game server (websocket down).",
  };
}

/** @type {ReturnType<typeof seed>|null} */
let state = null;

function ensure() {
  if (!state) state = seed();
  return state;
}

function listRow(entry) {
  const { org, servers } = entry;
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    plan_status: org.plan_status,
    created_at: org.created_at,
    owner_email: org.owner_email,
    server_count: servers.length,
  };
}

export function listMockOpsOrgs() {
  return Object.values(ensure())
    .map(listRow)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function packServers(servers) {
  return servers.map((s) =>
    serializeServerForOps(s, {
      enabled: Boolean(s._attached),
      connected: Boolean(s._connected),
      lastError: s._lastError || null,
      connectedAt: s._connected ? "2026-08-01T12:00:00.000Z" : null,
    }),
  );
}

export function getMockOpsDetail(slug) {
  const entry = ensure()[String(slug || "").toLowerCase()];
  if (!entry) return null;
  const servers = packServers(entry.servers);
  const health = buildHealth(entry.org, servers, {
    botInGuild: entry.botInGuild,
    discordReady: true,
  });
  return {
    org: { ...entry.org },
    servers,
    health,
    mock: true,
  };
}

export function applyMockOpsFix(slug, action, { serverId, guildId } = {}) {
  const key = String(slug || "").toLowerCase();
  const entry = ensure()[key];
  if (!entry) {
    const err = new Error("Org not found");
    err.status = 404;
    throw err;
  }

  switch (action) {
    case "reconnect_rcon": {
      const srv = entry.servers.find((s) => s.id === serverId);
      if (!srv) {
        const err = new Error("Server not found");
        err.status = 404;
        throw err;
      }
      srv._attached = true;
      srv._connected = true;
      srv._lastError = null;
      return { result: { reconnected: serverId } };
    }
    case "reconnect_all_rcon": {
      for (const srv of entry.servers.filter((s) => s.enabled !== false)) {
        srv._attached = true;
        srv._connected = true;
        srv._lastError = null;
      }
      return { result: { reconnected: entry.servers.length } };
    }
    case "refresh_stripe": {
      if (entry.org.plan_status === "past_due") {
        entry.org.plan_status = "active";
      }
      if (!entry.org.stripe_customer_id) {
        entry.org.stripe_customer_id = `cus_mock_${key}`;
      }
      if (!entry.org.stripe_subscription_id) {
        entry.org.stripe_subscription_id = `sub_mock_${key}`;
      }
      return {
        result: {
          plan: entry.org.plan,
          plan_status: entry.org.plan_status,
        },
      };
    }
    case "clear_guild": {
      entry.org.discord_guild_id = null;
      entry.botInGuild = false;
      return { result: { guildId: null } };
    }
    case "relink_guild": {
      const id = String(guildId || "").trim();
      if (!id) {
        const err = new Error("guildId required");
        err.status = 400;
        throw err;
      }
      entry.org.discord_guild_id = id;
      entry.botInGuild = true;
      return { result: { guildId: id } };
    }
    default: {
      const err = new Error(`Unknown action: ${action}`);
      err.status = 400;
      throw err;
    }
  }
}
