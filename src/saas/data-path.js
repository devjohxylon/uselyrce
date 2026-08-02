import { AsyncLocalStorage } from "async_hooks";
import path from "path";
import { DATA_DIR } from "../data/data-dir.js";

const ctx = new AsyncLocalStorage();

export function getDataContext() {
  return ctx.getStore() || null;
}

export function runWithDataContext({ orgId, serverId }, fn) {
  return ctx.run({ orgId, serverId }, fn);
}

/** Namespaced path when org+server context is set; otherwise legacy DATA_DIR root. */
export function resolveDataFile(fileName) {
  const c = getDataContext();
  if (c?.orgId && c?.serverId) {
    return path.join(DATA_DIR, "orgs", c.orgId, "servers", c.serverId, fileName);
  }
  return path.join(DATA_DIR, fileName);
}

export function orgServerDataDir(orgId, serverId) {
  return path.join(DATA_DIR, "orgs", orgId, "servers", serverId);
}
