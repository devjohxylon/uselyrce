import { config } from "../config.js";
import { getOrgBySlug } from "./db/orgs.js";

const RESERVED_SLUGS = new Set([
  "www", "admin", "app", "api", "mail", "smtp", "dev", "staging", "status",
  "docs", "blog", "cdn", "assets", "help", "support", "billing", "usely", "ops",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

export function baseDomain() {
  if (config.saas.baseDomain) return config.saas.baseDomain;
  try {
    return new URL(config.saas.publicUrl).hostname;
  } catch {
    return "localhost";
  }
}

export function slugProblem(slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!SLUG_RE.test(s)) {
    return "Use 3-32 lowercase letters, numbers, or hyphens (no leading/trailing hyphen).";
  }
  if (RESERVED_SLUGS.has(s)) return "That name is reserved.";
  return null;
}

export async function isSlugAvailable(slug) {
  if (slugProblem(slug)) return false;
  const existing = await getOrgBySlug(String(slug).toLowerCase().trim());
  return !existing;
}

/** astral.usely.dev -> "astral"; usely.dev / admin.usely.dev (reserved) -> null */
export function orgSlugFromHost(hostHeader) {
  const host = String(hostHeader || "").toLowerCase().split(":")[0];
  const base = baseDomain();
  if (!host.endsWith(`.${base}`)) return null;
  const sub = host.slice(0, -(base.length + 1));
  if (!sub || sub.includes(".") || RESERVED_SLUGS.has(sub)) return null;
  return sub;
}

export async function resolveOrgFromHost(hostHeader) {
  const slug = orgSlugFromHost(hostHeader);
  if (!slug) return null;
  return getOrgBySlug(slug);
}

/** Full panel URL for an org, e.g. http://astral.localhost:3847/admin */
export function orgPanelUrl(org) {
  const u = new URL(config.saas.publicUrl);
  const port = u.port ? `:${u.port}` : "";
  return `${u.protocol}//${org.slug}.${baseDomain()}${port}/admin`;
}
