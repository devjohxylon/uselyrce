import { config } from "../../config.js";
import { encryptSecret, decryptSecret } from "../crypto.js";
import { assertCanAddServer, isPlanLive } from "../billing/plans.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";
import { getOrg } from "./orgs.js";
import { normalizeRconEndpoint } from "../rcon/endpoint.js";

const useMock = () => config.saas.mock;

function publicServer(row) {
  if (!row) return null;
  const { rcon_password_enc, ...rest } = row;
  return {
    ...rest,
    hasPassword: Boolean(rcon_password_enc),
  };
}

export async function listServers(orgId) {
  if (useMock()) return (await mockdb.listServers(orgId)).map(publicServer);
  const db = getServiceClient();
  const { data, error } = await db
    .from("servers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(publicServer);
}

export async function getServer(serverId) {
  if (useMock()) return publicServer(await mockdb.getServerRow(serverId));
  const db = getServiceClient();
  const { data, error } = await db.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (error) throw error;
  return publicServer(data);
}

export async function getServerRaw(serverId) {
  if (useMock()) return mockdb.getServerRow(serverId);
  const db = getServiceClient();
  const { data, error } = await db.from("servers").select("*").eq("id", serverId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createServer(orgId, { name, host, port, password }) {
  const org = await getOrg(orgId);
  if (!org) throw new Error("Org not found");

  const endpoint = await normalizeRconEndpoint({ name, host, port, password });

  const existing = await listServers(orgId);
  assertCanAddServer(org, existing.length);

  if (useMock()) {
    return publicServer(
      await mockdb.insertServer(orgId, {
        name: endpoint.name,
        host: endpoint.host,
        port: endpoint.port,
      }),
    );
  }

  const db = getServiceClient();
  const row = {
    org_id: orgId,
    name: endpoint.name,
    rcon_host: endpoint.host,
    rcon_port: endpoint.port,
    rcon_password_enc: encryptSecret(endpoint.password),
    enabled: true,
  };
  const { data, error } = await db.from("servers").insert(row).select("*").single();
  if (error) throw error;

  if (!org.default_server_id) {
    const { setDefaultServer } = await import("./orgs.js");
    await setDefaultServer(orgId, data.id);
  }

  return publicServer(data);
}

export async function assertServerOwnedByOrg(orgId, serverId) {
  const raw = await getServerRaw(serverId);
  if (!raw || raw.org_id !== orgId) {
    const err = new Error("Server not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  return raw;
}

export async function updateServer(orgId, serverId, patch) {
  const raw = await assertServerOwnedByOrg(orgId, serverId);
  const updates = {};

  if (patch.host != null || patch.port != null || patch.password) {
    const endpoint = await normalizeRconEndpoint({
      name: patch.name != null ? patch.name : raw.name,
      host: patch.host != null ? patch.host : raw.rcon_host,
      port: patch.port != null ? patch.port : raw.rcon_port,
      password: patch.password || decryptSecret(raw.rcon_password_enc),
    });
    if (patch.name != null) updates.name = endpoint.name;
    if (patch.host != null) updates.rcon_host = endpoint.host;
    if (patch.port != null) updates.rcon_port = endpoint.port;
    if (patch.password) updates.rcon_password_enc = encryptSecret(endpoint.password);
  } else if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name || name.length > 64) {
      const err = new Error("Enter a server display name (max 64 characters).");
      err.code = "RCON_INVALID";
      throw err;
    }
    updates.name = name;
  }

  if (patch.enabled != null) updates.enabled = Boolean(patch.enabled);

  if (!Object.keys(updates).length) {
    return publicServer(raw);
  }

  if (useMock()) {
    return publicServer(await mockdb.patchServer(serverId, updates));
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("servers")
    .update(updates)
    .eq("id", serverId)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return publicServer(data);
}

export async function deleteServer(orgId, serverId) {
  await assertServerOwnedByOrg(orgId, serverId);
  if (useMock()) return mockdb.removeServer(serverId);
  const db = getServiceClient();
  const { error } = await db.from("servers").delete().eq("id", serverId).eq("org_id", orgId);
  if (error) throw error;
}

/** Decrypted credentials for the RCON pool (service only). */
export async function listAllEnabledForPool() {
  // Mock servers are fake endpoints — never attach real RCON sockets to them.
  if (useMock()) return [];
  const db = getServiceClient();
  const { data, error } = await db
    .from("servers")
    // Disambiguate: orgs↔servers has two FKs (servers.org_id and orgs.default_server_id).
    .select("*, orgs!servers_org_id_fkey!inner(id, plan_status, plan)")
    .eq("enabled", true);
  if (error) throw error;

  return (data || [])
    .filter((row) => isPlanLive(row.orgs.plan_status))
    .map((row) => ({
      id: row.id,
      orgId: row.org_id,
      name: row.name,
      host: row.rcon_host,
      port: row.rcon_port,
      password: decryptSecret(row.rcon_password_enc),
      planStatus: row.orgs.plan_status,
    }));
}

export function withCredentials(rawRow) {
  return {
    id: rawRow.id,
    orgId: rawRow.org_id,
    name: rawRow.name,
    host: rawRow.rcon_host,
    port: rawRow.rcon_port,
    password: decryptSecret(rawRow.rcon_password_enc),
  };
}
