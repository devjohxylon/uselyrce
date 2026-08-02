import crypto from "crypto";

const MAX_PASSWORD_LEN = 128;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const pw = String(password ?? "");
  if (!pw || pw.length > MAX_PASSWORD_LEN) {
    throw new Error("Password must be 1–128 characters.");
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, SCRYPT);
  return `s2$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password, stored) {
  const pw = String(password ?? "");
  if (!pw || pw.length > MAX_PASSWORD_LEN) return false;
  const parts = String(stored || "").split("$");
  try {
    if (parts[0] !== "s2") return false;
    // New: s2$N$r$p$salt$hash
    if (parts.length === 6) {
      const N = Number(parts[1]);
      const r = Number(parts[2]);
      const p = Number(parts[3]);
      const salt = Buffer.from(parts[4], "base64url");
      const expected = Buffer.from(parts[5], "base64url");
      const actual = crypto.scryptSync(pw, salt, expected.length, { N, r, p, maxmem: SCRYPT.maxmem });
      return crypto.timingSafeEqual(actual, expected);
    }
    // Legacy: s2$salt$hash
    if (parts.length === 3) {
      const salt = Buffer.from(parts[1], "base64url");
      const expected = Buffer.from(parts[2], "base64url");
      const actual = crypto.scryptSync(pw, salt, expected.length);
      return crypto.timingSafeEqual(actual, expected);
    }
    return false;
  } catch {
    return false;
  }
}
