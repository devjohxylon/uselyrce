import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../../data/store.js";
import { sanitizeStaffPerms } from "../../modules/admin/access-keys.js";

function keysPath(orgId) {
  return path.join(DATA_DIR, "orgs", String(orgId), "access-keys.json");
}

async function readKeys(orgId) {
  try {
    const raw = await fs.readFile(keysPath(orgId), "utf8");
    const data = JSON.parse(raw);
    return { keys: Array.isArray(data.keys) ? data.keys : [] };
  } catch {
    return { keys: [] };
  }
}

async function writeKeys(orgId, data) {
  const file = keysPath(orgId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function hashKey(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function publicKey(row) {
  return {
    id: row.id,
    label: row.label,
    enabled: row.enabled !== false,
    permissions: sanitizeStaffPerms(row.permissions),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt ?? null,
  };
}

export async function listOrgAccessKeys(orgId) {
  const data = await readKeys(orgId);
  return data.keys.map(publicKey);
}

export async function createOrgAccessKey(orgId, { label, permissions } = {}) {
  const name = String(label ?? "").trim().slice(0, 48) || "Staff";
  const raw = `ask_${crypto.randomBytes(18).toString("base64url")}`;
  const row = {
    id: crypto.randomBytes(8).toString("hex"),
    label: name,
    hash: hashKey(raw),
    enabled: true,
    permissions: sanitizeStaffPerms(permissions),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  const data = await readKeys(orgId);
  data.keys.unshift(row);
  await writeKeys(orgId, data);
  return { key: publicKey(row), secret: raw };
}

export async function updateOrgAccessKey(orgId, id, patch = {}) {
  const data = await readKeys(orgId);
  const row = data.keys.find((k) => k.id === id);
  if (!row) return null;
  if (typeof patch.label === "string" && patch.label.trim()) {
    row.label = patch.label.trim().slice(0, 48);
  }
  if (typeof patch.enabled === "boolean") row.enabled = patch.enabled;
  if (patch.permissions && typeof patch.permissions === "object") {
    row.permissions = sanitizeStaffPerms({ ...row.permissions, ...patch.permissions });
  }
  await writeKeys(orgId, data);
  return publicKey(row);
}

export async function revokeOrgAccessKey(orgId, id) {
  const data = await readKeys(orgId);
  const before = data.keys.length;
  data.keys = data.keys.filter((k) => k.id !== id);
  if (data.keys.length === before) return false;
  await writeKeys(orgId, data);
  return true;
}

export async function authenticateOrgAccessKey(orgId, raw) {
  const password = String(raw ?? "");
  if (!password || !orgId) return null;
  const data = await readKeys(orgId);
  const digest = hashKey(password);
  const found = data.keys.find((k) => k.hash === digest && k.enabled !== false);
  if (!found) return null;
  found.lastUsedAt = new Date().toISOString();
  await writeKeys(orgId, data);
  return {
    role: "staff",
    label: found.label || "Staff",
    keyId: found.id,
    orgId: String(orgId),
    permissions: sanitizeStaffPerms(found.permissions),
  };
}

export async function resolveOrgAccessKey(orgId, keyId) {
  if (!orgId || !keyId) return null;
  const data = await readKeys(orgId);
  const found = data.keys.find((k) => k.id === keyId && k.enabled !== false);
  if (!found) return null;
  return {
    role: "staff",
    label: found.label || "Staff",
    keyId: found.id,
    orgId: String(orgId),
    permissions: sanitizeStaffPerms(found.permissions),
  };
}
