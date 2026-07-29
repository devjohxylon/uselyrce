import {
  STAFF_PERMISSIONS,
  OWNER_PERMISSIONS,
  sanitizeStaffPerms,
} from "../../modules/admin/access-keys.js";
import { config } from "../../config.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";

const useMock = () => config.saas.mock;

export { sanitizeStaffPerms };

export async function listRoleMaps(orgId) {
  if (useMock()) return mockdb.listRoleMaps(orgId);
  const db = getServiceClient();
  const { data, error } = await db
    .from("org_role_permissions")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function upsertRoleMap(orgId, { discordRoleId, label, permissions }) {
  if (useMock()) {
    return mockdb.upsertRoleMap(orgId, {
      discordRoleId,
      label,
      permissions: sanitizeStaffPerms(permissions),
    });
  }
  const db = getServiceClient();
  const row = {
    org_id: orgId,
    discord_role_id: String(discordRoleId),
    label: label || null,
    permissions: sanitizeStaffPerms(permissions),
  };
  const { data, error } = await db
    .from("org_role_permissions")
    .upsert(row, { onConflict: "org_id,discord_role_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoleMap(orgId, discordRoleId) {
  if (useMock()) return mockdb.deleteRoleMap(orgId, discordRoleId);
  const db = getServiceClient();
  const { error } = await db
    .from("org_role_permissions")
    .delete()
    .eq("org_id", orgId)
    .eq("discord_role_id", String(discordRoleId));
  if (error) throw error;
}

export function unionPermissions(maps) {
  const out = Object.fromEntries(Object.keys(STAFF_PERMISSIONS).map((k) => [k, false]));
  for (const map of maps) {
    const perms = map.permissions || {};
    for (const key of Object.keys(out)) {
      if (perms[key]) out[key] = true;
    }
  }
  return out;
}

export async function permissionsForMember(orgId, memberRoleIds, { isOwner = false } = {}) {
  if (isOwner) {
    return {
      ...OWNER_PERMISSIONS,
      servers: true,
      billing: true,
    };
  }
  const maps = await listRoleMaps(orgId);
  const matched = maps.filter((m) => memberRoleIds.map(String).includes(String(m.discord_role_id)));
  if (!matched.length) return null;
  return {
    ...unionPermissions(matched),
    keys: false,
    logs: false,
    servers: false,
    billing: false,
  };
}
