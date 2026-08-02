import crypto from "crypto";
import { config } from "../../config.js";
import * as mockdb from "../mock.js";
import { getServiceClient } from "./client.js";

const useMock = () => config.saas.mock;
const SETUP_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  const { data, error } = await db
    .from("accounts")
    .update({ password_hash: passwordHash })
    .eq("id", accountId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createSetupToken({ accountId, orgId }) {
  const row = {
    token: crypto.randomBytes(24).toString("base64url"),
    account_id: accountId,
    org_id: orgId,
    expires_at: new Date(Date.now() + SETUP_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  };
  if (useMock()) {
    await mockdb.insertSetupToken(row);
    return row.token;
  }
  const db = getServiceClient();
  const { error } = await db.from("setup_tokens").insert(row);
  if (error) throw error;
  return row.token;
}

/** Returns the token row only if it is unused and unexpired. */
export async function getValidSetupToken(token) {
  let row;
  if (useMock()) {
    row = await mockdb.getSetupToken(String(token));
  } else {
    const db = getServiceClient();
    const { data, error } = await db
      .from("setup_tokens")
      .select("*")
      .eq("token", String(token))
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function markSetupTokenUsed(token) {
  if (useMock()) return mockdb.markSetupTokenUsed(String(token));
  const db = getServiceClient();
  const { error } = await db
    .from("setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", String(token));
  if (error) throw error;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createPasswordResetToken(accountId) {
  const row = {
    token: crypto.randomBytes(24).toString("base64url"),
    account_id: accountId,
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    used_at: null,
  };
  if (useMock()) {
    await mockdb.insertPasswordResetToken?.(row);
    return row.token;
  }
  const db = getServiceClient();
  const { error } = await db.from("password_reset_tokens").insert(row);
  if (error) throw error;
  return row.token;
}

export async function getValidPasswordResetToken(token) {
  let row;
  if (useMock()) {
    row = await mockdb.getPasswordResetToken?.(String(token));
  } else {
    const db = getServiceClient();
    const { data, error } = await db
      .from("password_reset_tokens")
      .select("*")
      .eq("token", String(token))
      .maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function markPasswordResetTokenUsed(token) {
  if (useMock()) return mockdb.markPasswordResetTokenUsed?.(String(token));
  const db = getServiceClient();
  const { error } = await db
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", String(token));
  if (error) throw error;
}
