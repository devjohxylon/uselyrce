import crypto from "crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function keyBytes() {
  const raw = config.saas.rconEncryptionKey;
  if (!raw) throw new Error("RCON_ENCRYPTION_KEY is not configured");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("RCON_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return buf;
}

/** @returns {string} base64url iv.tag.ciphertext */
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(payload) {
  const parts = String(payload || "").split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted secret format");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv(ALGO, keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
