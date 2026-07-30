import { config } from "../../config.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";

const useMock = () => config.saas.mock;

function slugify(name) {
  const base = String(name || "org")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createOrg({ name, ownerDiscordId, ownerAccountId, plan = "basic" }) {
  if (useMock()) return mockdb.createOrg({ name, ownerDiscordId, ownerAccountId, plan });
  const db = getServiceClient();
  const row = {
    name: String(name).trim(),
    slug: slugify(name),
    owner_discord_id: ownerDiscordId ? String(ownerDiscordId) : null,
    owner_account_id: ownerAccountId || null,
    plan,
    plan_status: "inactive",
  };
  const { data, error } = await db.from("orgs").insert(row).select("*").single();
  if (error) throw error;
  return data;
}

export async function getOrg(orgId) {
  if (useMock()) return mockdb.getOrg(orgId);
  const db = getServiceClient();
  const { data, error } = await db.from("orgs").select("*").eq("id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrgByGuildId(guildId) {
  if (useMock()) return mockdb.getOrgByGuildId(guildId);
  if (!guildId) return null;
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .eq("discord_guild_id", String(guildId))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOrgsOwnedBy(discordUserId) {
  if (useMock()) return mockdb.listOrgsOwnedBy(discordUserId);
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .eq("owner_discord_id", String(discordUserId))
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listOrgsByGuildIds(guildIds) {
  if (useMock()) return mockdb.listOrgsByGuildIds(guildIds);
  if (!guildIds?.length) return [];
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .in("discord_guild_id", guildIds.map(String));
  if (error) throw error;
  return data || [];
}

export async function setGuild(orgId, guildId) {
  if (useMock()) return mockdb.updateOrg(orgId, { discord_guild_id: guildId ? String(guildId) : null });
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .update({ discord_guild_id: guildId ? String(guildId) : null })
    .eq("id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function setDefaultServer(orgId, serverId) {
  if (useMock()) return mockdb.updateOrg(orgId, { default_server_id: serverId || null });
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .update({ default_server_id: serverId || null })
    .eq("id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateStripe(orgId, fields) {
  if (useMock()) return mockdb.updateOrg(orgId, fields);
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .update(fields)
    .eq("id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getOrgByStripeCustomer(customerId) {
  if (useMock()) return mockdb.getOrgByStripeCustomer(customerId);
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrgBySlug(slug) {
  if (useMock()) return mockdb.getOrgBySlug(slug);
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .eq("slug", String(slug))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOrgsOwnedByAccount(accountId) {
  if (useMock()) return mockdb.listOrgsOwnedByAccount(accountId);
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select("*")
    .eq("owner_account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Platform ops: all orgs with owner email + server count.
 * Never includes RCON credentials or encryption material.
 */
export async function listAllOrgsForOps() {
  if (useMock()) return mockdb.listAllOrgsForOps();
  const db = getServiceClient();
  const { data, error } = await db
    .from("orgs")
    .select(
      "id, name, slug, plan, plan_status, created_at, owner_account_id, accounts(email), servers(count)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data || []).map((row) => {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
    const serverCountRaw = Array.isArray(row.servers) ? row.servers[0]?.count : 0;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      plan_status: row.plan_status,
      created_at: row.created_at,
      owner_email: account?.email || null,
      server_count: Number(serverCountRaw) || 0,
    };
  });
}

/** Generic field update (updateStripe already accepts arbitrary fields). */
export { updateStripe as updateOrgFields };
