import { config } from "../../config.js";
import { encryptSecret, decryptSecret } from "../crypto.js";
import { assertCanAddServer, isPlanLive } from "../billing/plans.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";
import { getOrg } from "./orgs.js";

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

  const existing = await listServers(orgId);
  assertCanAddServer(org, existing.length);

  if (useMock()) {
    if (!password) throw new Error("RCON password required");
    return publicServer(await mockdb.insertServer(orgId, { name, host, port }));
  }

  const db = getServiceClient();
  const row = {
    org_id: orgId,
    name: String(name).trim(),
    rcon_host: String(host).trim(),
    rcon_port: Number(port),
    rcon_password_enc: encryptSecret(password),
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

export async function updateServer(serverId, patch) {
  const updates = {};
  if (patch.name != null) updates.name = String(patch.name).trim();
  if (patch.host != null) updates.rcon_host = String(patch.host).trim();
  if (patch.port != null) updates.rcon_port = Number(patch.port);
  if (patch.enabled != null) updates.enabled = Boolean(patch.enabled);

  if (useMock()) {
    return publicServer(await mockdb.patchServer(serverId, updates));
  }

  if (patch.password) updates.rcon_password_enc = encryptSecret(patch.password);

  const db = getServiceClient();
  const { data, error } = await db
    .from("servers")
    .update(updates)
    .eq("id", serverId)
    .select("*")
    .single();
  if (error) throw error;
  return publicServer(data);
}

export async function deleteServer(serverId) {
  if (useMock()) return mockdb.removeServer(serverId);
  const db = getServiceClient();
  const { error } = await db.from("servers").delete().eq("id", serverId);
  if (error) throw error;
}

/** Decrypted credentials for the RCON pool (service only). */
export async function listAllEnabledForPool() {
  // Mock servers are fake endpoints — never attach real RCON sockets to them.
  if (useMock()) return [];
  const db = getServiceClient();
  const { data, error } = await db
    .from("servers")
    .select("*, orgs!inner(id, plan_status, plan)")
    .eq("enabled", true);
  if (error) throw error;

  return (data || [])
    .filter((row) => isPlanLive(row.orgs.plan_status) || row.orgs.plan_status === "inactive")
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
