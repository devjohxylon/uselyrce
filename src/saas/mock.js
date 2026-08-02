/**
 * Local mock backend for SAAS_MOCK=true: no Supabase, no Discord OAuth,
 * no Stripe. State persists to .data/mock-saas.json so panel edits survive
 * dev-server restarts.
 */
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { DATA_DIR } from "../data/store.js";

const FILE = path.join(DATA_DIR, "mock-saas.json");

export const MOCK_USER = {
  discordUserId: "100000000000000001",
  username: "MockOwner",
};

const FULL_STAFF_PERMS = {
  overview: true,
  players: true,
  kick: true,
  ban: true,
  teleport: true,
  broadcast: true,
  rcon: false,
  stats: true,
  statsReset: false,
  warps: true,
  links: true,
  automessages: true,
  schedule: true,
  kits: true,
  serverCommands: true,
  reports: true,
};

function seedData() {
  const now = new Date().toISOString();
  const ownerAccount = {
    id: "mock-acct-owner",
    email: "owner@example.com",
    password_hash: null,
    created_at: now,
  };
  return {
    accounts: [ownerAccount],
    setupTokens: [],
    passwordResetTokens: [],
    orgs: [
      {
        id: "mock-org-1",
        name: "Usely Demo",
        slug: "demo",
        owner_discord_id: MOCK_USER.discordUserId,
        owner_account_id: ownerAccount.id,
        discord_guild_id: null,
        default_server_id: "mock-server-1",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        plan: "pro",
        plan_status: "trialing",
        created_at: now,
      },
    ],
    servers: [
      {
        id: "mock-server-1",
        org_id: "mock-org-1",
        name: "Main",
        rcon_host: "203.0.113.10",
        rcon_port: 28016,
        rcon_password_enc: "mock",
        enabled: true,
        created_at: now,
      },
    ],
    roleMaps: [
      {
        id: "mock-role-1",
        org_id: "mock-org-1",
        discord_role_id: "200000000000000001",
        label: "Mod (example)",
        permissions: FULL_STAFF_PERMS,
        created_at: now,
      },
    ],
  };
}

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    cache = seedData();
    await save();
  }
  cache.accounts ||= [];
  cache.setupTokens ||= [];
  return cache;
}

async function save() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(cache, null, 2), "utf8");
}

function id(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

// ——— orgs ———

export async function createOrg({ name, ownerDiscordId, ownerAccountId, plan = "basic" }) {
  const db = await load();
  const org = {
    id: id("mock-org"),
    name: String(name).trim(),
    slug: `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}-${crypto.randomBytes(3).toString("hex")}`,
    owner_discord_id: ownerDiscordId ? String(ownerDiscordId) : null,
    owner_account_id: ownerAccountId || null,
    discord_guild_id: null,
    default_server_id: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan,
    plan_status: "inactive",
    created_at: new Date().toISOString(),
  };
  db.orgs.push(org);
  await save();
  return org;
}

export async function getOrg(orgId) {
  const db = await load();
  return db.orgs.find((o) => o.id === orgId) || null;
}

export async function getOrgByGuildId(guildId) {
  if (!guildId) return null;
  const db = await load();
  return db.orgs.find((o) => o.discord_guild_id === String(guildId)) || null;
}

export async function listOrgsOwnedBy(discordUserId) {
  const db = await load();
  return db.orgs.filter((o) => o.owner_discord_id === String(discordUserId));
}

export async function listOrgsByGuildIds(guildIds) {
  if (!guildIds?.length) return [];
  const db = await load();
  const set = new Set(guildIds.map(String));
  return db.orgs.filter((o) => o.discord_guild_id && set.has(o.discord_guild_id));
}

export async function updateOrg(orgId, fields) {
  const db = await load();
  const org = db.orgs.find((o) => o.id === orgId);
  if (!org) throw new Error("Org not found");
  Object.assign(org, fields);
  await save();
  return org;
}

export async function getOrgByStripeCustomer(customerId) {
  const db = await load();
  return db.orgs.find((o) => o.stripe_customer_id === customerId) || null;
}

export async function getOrgByStripeSubscription(subscriptionId) {
  const db = await load();
  return db.orgs.find((o) => o.stripe_subscription_id === subscriptionId) || null;
}

export async function getOrgBySlug(slug) {
  const db = await load();
  return db.orgs.find((o) => o.slug === String(slug)) || null;
}

export async function listOrgsOwnedByAccount(accountId) {
  const db = await load();
  return db.orgs.filter((o) => o.owner_account_id === accountId);
}

export async function listAllOrgsForOps() {
  const db = await load();
  return db.orgs
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map((org) => {
      const account = org.owner_account_id
        ? db.accounts.find((a) => a.id === org.owner_account_id)
        : null;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        plan_status: org.plan_status,
        created_at: org.created_at,
        owner_email: account?.email || null,
        server_count: db.servers.filter((s) => s.org_id === org.id).length,
      };
    });
}

// ——— accounts + setup tokens ———

export async function createAccount({ email }) {
  const db = await load();
  const account = {
    id: id("mock-acct"),
    email: String(email).toLowerCase().trim(),
    password_hash: null,
    created_at: new Date().toISOString(),
  };
  db.accounts.push(account);
  await save();
  return account;
}

export async function getAccountByEmail(email) {
  const db = await load();
  const e = String(email).toLowerCase().trim();
  return db.accounts.find((a) => a.email === e) || null;
}

export async function getAccount(accountId) {
  const db = await load();
  return db.accounts.find((a) => a.id === accountId) || null;
}

export async function setAccountPassword(accountId, passwordHash) {
  const db = await load();
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("Account not found");
  account.password_hash = passwordHash;
  await save();
  return account;
}

export async function insertSetupToken(row) {
  const db = await load();
  db.setupTokens.push(row);
  await save();
  return row;
}

export async function getSetupToken(token) {
  const db = await load();
  return db.setupTokens.find((t) => t.token === token) || null;
}

export async function markSetupTokenUsed(token) {
  const db = await load();
  const row = db.setupTokens.find((t) => t.token === token);
  if (row) {
    row.used_at = new Date().toISOString();
    await save();
  }
}

export async function insertPasswordResetToken(row) {
  const db = await load();
  if (!db.passwordResetTokens) db.passwordResetTokens = [];
  db.passwordResetTokens.push(row);
  await save();
  return row;
}

export async function getPasswordResetToken(token) {
  const db = await load();
  return (db.passwordResetTokens || []).find((t) => t.token === token) || null;
}

export async function markPasswordResetTokenUsed(token) {
  const db = await load();
  const row = (db.passwordResetTokens || []).find((t) => t.token === token);
  if (row) {
    row.used_at = new Date().toISOString();
    await save();
  }
}

// ——— servers ———

export async function listServers(orgId) {
  const db = await load();
  return db.servers.filter((s) => s.org_id === orgId);
}

export async function getServerRow(serverId) {
  const db = await load();
  return db.servers.find((s) => s.id === serverId) || null;
}

export async function insertServer(orgId, { name, host, port }) {
  const db = await load();
  const server = {
    id: id("mock-server"),
    org_id: orgId,
    name: String(name).trim(),
    rcon_host: String(host).trim(),
    rcon_port: Number(port),
    rcon_password_enc: "mock",
    enabled: true,
    created_at: new Date().toISOString(),
  };
  db.servers.push(server);
  const org = db.orgs.find((o) => o.id === orgId);
  if (org && !org.default_server_id) org.default_server_id = server.id;
  await save();
  return server;
}

export async function patchServer(serverId, updates) {
  const db = await load();
  const server = db.servers.find((s) => s.id === serverId);
  if (!server) throw new Error("Server not found");
  Object.assign(server, updates);
  await save();
  return server;
}

export async function removeServer(serverId) {
  const db = await load();
  db.servers = db.servers.filter((s) => s.id !== serverId);
  for (const org of db.orgs) {
    if (org.default_server_id === serverId) org.default_server_id = null;
  }
  await save();
}

// ——— role maps ———

export async function listRoleMaps(orgId) {
  const db = await load();
  return db.roleMaps.filter((m) => m.org_id === orgId);
}

export async function upsertRoleMap(orgId, { discordRoleId, label, permissions }) {
  const db = await load();
  let map = db.roleMaps.find(
    (m) => m.org_id === orgId && m.discord_role_id === String(discordRoleId),
  );
  if (map) {
    map.label = label || null;
    map.permissions = permissions;
  } else {
    map = {
      id: id("mock-role"),
      org_id: orgId,
      discord_role_id: String(discordRoleId),
      label: label || null,
      permissions,
      created_at: new Date().toISOString(),
    };
    db.roleMaps.push(map);
  }
  await save();
  return map;
}

export async function deleteRoleMap(orgId, discordRoleId) {
  const db = await load();
  db.roleMaps = db.roleMaps.filter(
    (m) => !(m.org_id === orgId && m.discord_role_id === String(discordRoleId)),
  );
  await save();
}
