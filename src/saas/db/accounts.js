import crypto from "crypto";
import { config } from "../../config.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";

const useMock = () => config.saas.mock;
const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function mintToken() {
  const raw = crypto.randomBytes(24).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export async function createAccount({ email }) {
  if (useMock()) return mockdb.createAccount({ email });
  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .insert({ email: String(email).toLowerCase().trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getAccountByEmail(email) {
  if (useMock()) return mockdb.getAccountByEmail(email);
  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .select("*")
    .eq("email", String(email).toLowerCase().trim())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAccount(accountId) {
  if (useMock()) return mockdb.getAccount(accountId);
  const db = getServiceClient();
  const { data, error } = await db
    .from("accounts")
    .select("*")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setAccountPassword(accountId, passwordHash) {
  if (useMock()) return mockdb.setAccountPassword(accountId, passwordHash);
  const db = getServiceClient();
  const account = await getAccount(accountId);
  const nextVersion = Number(account?.session_version ?? 0) + 1;
  const { data, error } = await db
    .from("accounts")
    .update({ password_hash: passwordHash, session_version: nextVersion })
    .eq("id", accountId)
    .select("*")
    .single();
  if (error) {
    // session_version column may be missing until migration
    const { data: fallback, error: err2 } = await db
      .from("accounts")
      .update({ password_hash: passwordHash })
      .eq("id", accountId)
      .select("*")
      .single();
    if (err2) throw err2;
    return fallback;
  }
  return data;
}

async function invalidateSetupTokens(accountId) {
  if (useMock()) return mockdb.invalidateSetupTokens?.(accountId);
  const db = getServiceClient();
  await db
    .from("setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .is("used_at", null);
}

async function invalidateResetTokens(accountId) {
  if (useMock()) return mockdb.invalidateResetTokens?.(accountId);
  const db = getServiceClient();
  await db
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .is("used_at", null);
}

export async function createSetupToken({ accountId, orgId }) {
  await invalidateSetupTokens(accountId);
  const { raw, hash } = mintToken();
  const row = {
    token: hash,
    account_id: accountId,
    org_id: orgId,
    expires_at: new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  };
  if (useMock()) {
    await mockdb.insertSetupToken({ ...row, token: hash, _raw: raw });
    return raw;
  }
  const db = getServiceClient();
  const { error } = await db.from("setup_tokens").insert(row);
  if (error) throw error;
  return raw;
}

/** Returns the token row only if it is unused and unexpired. */
export async function getValidSetupToken(token) {
  const hash = hashToken(token);
  let row;
  if (useMock()) {
    row = await mockdb.getSetupToken(hash);
  } else {
    const db = getServiceClient();
    const { data, error } = await db
      .from("setup_tokens")
      .select("*")
      .eq("token", hash)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function markSetupTokenUsed(token) {
  const hash = hashToken(token);
  if (useMock()) return mockdb.markSetupTokenUsed(hash);
  const db = getServiceClient();
  const { data, error } = await db
    .from("setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", hash)
    .is("used_at", null)
    .select("token")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** After password set during setup — shorten remaining token lifetime. */
export async function shortenSetupToken(token, ttlMs = 2 * 60 * 60 * 1000) {
  const hash = hashToken(token);
  const expires = new Date(Date.now() + ttlMs).toISOString();
  if (useMock()) return mockdb.shortenSetupToken?.(hash, expires);
  const db = getServiceClient();
  await db
    .from("setup_tokens")
    .update({ expires_at: expires })
    .eq("token", hash)
    .is("used_at", null);
}

export async function createPasswordResetToken(accountId) {
  await invalidateResetTokens(accountId);
  const { raw, hash } = mintToken();
  const row = {
    token: hash,
    account_id: accountId,
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  };
  if (useMock()) {
    await mockdb.insertPasswordResetToken?.({ ...row, _raw: raw });
    return raw;
  }
  const db = getServiceClient();
  const { error } = await db.from("password_reset_tokens").insert(row);
  if (error) throw error;
  return raw;
}

export async function getValidPasswordResetToken(token) {
  const hash = hashToken(token);
  let row;
  if (useMock()) {
    row = await mockdb.getPasswordResetToken?.(hash);
  } else {
    const db = getServiceClient();
    const { data, error } = await db
      .from("password_reset_tokens")
      .select("*")
      .eq("token", hash)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function markPasswordResetTokenUsed(token) {
  const hash = hashToken(token);
  if (useMock()) return mockdb.markPasswordResetTokenUsed?.(hash);
  const db = getServiceClient();
  const { data, error } = await db
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", hash)
    .is("used_at", null)
    .select("token")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
