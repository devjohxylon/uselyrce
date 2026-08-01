import crypto from "crypto";
import { config } from "../../config.js";

const COOKIE = "usely_ops";
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

function configuredCode() {
  return String(config.saas.opsAccessCode || "").trim();
}

function signingSecret() {
  return (
    configuredCode() ||
    config.adminPanel.sessionSecret ||
    "usely-ops"
  );
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", signingSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.ops || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.get?.("cookie") ?? req.headers?.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        return i === -1 ? [p, ""] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
      }),
  );
}

function cookieAttrs() {
  const secure =
    process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production"
      ? "; Secure"
      : "";
  return `${secure}; HttpOnly; SameSite=Lax; Path=/`;
}

export function opsCodeConfigured() {
  return Boolean(configuredCode());
}

export function codesMatch(input) {
  const expected = configuredCode();
  if (!expected) return false;
  const a = Buffer.from(String(input || ""));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hasOpsSession(req) {
  return Boolean(verify(parseCookies(req)[COOKIE]));
}

export function setOpsCookie(res) {
  const token = sign({ ops: true, exp: Date.now() + TTL_MS });
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token}; Max-Age=${Math.floor(TTL_MS / 1000)}${cookieAttrs()}`,
  );
}

export function clearOpsCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; Max-Age=0${cookieAttrs()}`);
}
