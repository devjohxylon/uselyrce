/**
 * Seed Astral as the first SaaS org from current .env + optional role IDs.
 * Usage (after SAAS_MODE deps are set, migration applied):
 *   node scripts/seed-astral-org.js
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const encKey = process.env.RCON_ENCRYPTION_KEY;
const ownerId = process.env.ASTRAL_OWNER_DISCORD_ID || process.env.ADMIN_USER_IDS?.split(",")[0];

if (!url || !key || !encKey) {
  console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RCON_ENCRYPTION_KEY");
  process.exit(1);
}
if (!ownerId) {
  console.error("Set ASTRAL_OWNER_DISCORD_ID or ADMIN_USER_IDS");
  process.exit(1);
}

function encryptSecret(plain) {
  const keyBuf = Buffer.from(encKey, "base64");
  if (keyBuf.length !== 32) throw new Error("RCON_ENCRYPTION_KEY must be 32-byte base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

const db = createClient(url, key, { auth: { persistSession: false } });

const { data: existing } = await db.from("orgs").select("id").eq("slug", "astral").maybeSingle();
if (existing) {
  console.log("Astral org already exists:", existing.id);
  process.exit(0);
}

const { data: org, error: orgErr } = await db
  .from("orgs")
  .insert({
    name: "Astral Vanilla+",
    slug: "astral",
    owner_discord_id: String(ownerId).trim(),
    discord_guild_id: process.env.GUILD_ID || null,
    plan: "network",
    plan_status: "active",
  })
  .select("*")
  .single();
if (orgErr) throw orgErr;
console.log("Created org", org.id);

if (process.env.RCON_HOST && process.env.RCON_PASSWORD) {
  const { data: server, error: srvErr } = await db
    .from("servers")
    .insert({
      org_id: org.id,
      name: process.env.RCON_SERVER_NAME || "Astral",
      rcon_host: process.env.RCON_HOST.split(":")[0],
      rcon_port: Number(process.env.RCON_PORT || 0),
      rcon_password_enc: encryptSecret(process.env.RCON_PASSWORD),
      enabled: true,
    })
    .select("*")
    .single();
  if (srvErr) throw srvErr;
  await db.from("orgs").update({ default_server_id: server.id }).eq("id", org.id);
  console.log("Created server", server.id);
}

const staffRoles = (process.env.ROLE_STAFF_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const fullPerms = {
  overview: true,
  players: true,
  kick: true,
  ban: true,
  teleport: true,
  broadcast: true,
  rcon: true,
  stats: true,
  statsReset: true,
  warps: true,
  links: true,
  automessages: true,
  schedule: true,
  kits: true,
  serverCommands: true,
  reports: true,
};

for (const roleId of staffRoles) {
  const { error } = await db.from("org_role_permissions").upsert({
    org_id: org.id,
    discord_role_id: roleId,
    label: "Staff",
    permissions: fullPerms,
  }, { onConflict: "org_id,discord_role_id" });
  if (error) console.warn("Role map failed", roleId, error.message);
  else console.log("Mapped staff role", roleId);
}

console.log("Done. Set SAAS_MODE=true and restart.");
