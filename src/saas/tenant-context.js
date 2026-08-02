import { runWithDataContext, getDataContext } from "./data-path.js";
import { runWithServer, getActiveServerId, listAttachedTenants } from "./rcon/pool.js";
import { loadTenantChannels } from "./tenant-channels.js";
import { loadFeedSettings } from "../modules/admin/feed-settings.js";
import { loadStatusSettings } from "../modules/admin/status-settings.js";

/**
 * Run fn with org+server ALS for JSON store + RCON targeting.
 * Prefetches channel/feed caches so sync feed paths work.
 */
export async function withTenant({ orgId, serverId }, fn) {
  if (!orgId || !serverId) return fn();
  return runWithDataContext({ orgId, serverId }, () =>
    runWithServer(serverId, async () => {
      await Promise.all([
        loadTenantChannels().catch(() => {}),
        loadFeedSettings().catch(() => {}),
        loadStatusSettings().catch(() => {}),
      ]);
      return fn();
    }),
  );
}

/** Extract RCE.js server identifier from common event shapes. */
export function eventServerId(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    payload.server?.identifier ||
    payload.server?.id ||
    payload.identifier ||
    payload.serverId ||
    null
  );
}

/**
 * Wrap an RCON event handler so store/feeds use the emitting server's namespace.
 * @param {(payload: any) => any} handler
 * @param {(serverId: string) => string|null|undefined} resolveOrgId
 */
export function tenantEventHandler(handler, resolveOrgId) {
  return (payload) => {
    const serverId = eventServerId(payload) || getActiveServerId();
    const orgId = serverId ? resolveOrgId(serverId) : null;
    if (orgId && serverId) {
      return withTenant({ orgId, serverId }, () => handler(payload));
    }
    return handler(payload);
  };
}

/** Run fn for every attached SaaS tenant (wipe scheduler, etc.). */
export async function forEachAttachedTenant(fn) {
  const tenants = listAttachedTenants();
  for (const t of tenants) {
    if (!t.orgId || !t.serverId) continue;
    await withTenant({ orgId: t.orgId, serverId: t.serverId }, () => fn(t));
  }
}

export { getDataContext };
