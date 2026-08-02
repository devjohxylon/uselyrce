import { getDataContext, runWithDataContext } from "./data-path.js";

/** Per-org/server in-memory cache keyed by ALS context. */
export function createTenantCache() {
  const stores = new Map();

  function key() {
    const c = getDataContext();
    return c?.orgId && c?.serverId ? `${c.orgId}:${c.serverId}` : "__legacy__";
  }

  function parseKey(k) {
    if (!k || k === "__legacy__") return null;
    const i = k.indexOf(":");
    if (i <= 0) return null;
    return { orgId: k.slice(0, i), serverId: k.slice(i + 1) };
  }

  function entry() {
    const k = key();
    let e = stores.get(k);
    if (!e) {
      e = { data: null, dirty: false };
      stores.set(k, e);
    }
    return e;
  }

  async function flushDirty() {
    for (const [k, e] of stores) {
      if (!e.dirty || !e.data) continue;
      const ctx = parseKey(k);
      const write = async () => {
        /* caller supplies persist via flushOne */
      };
      void write;
      void ctx;
    }
  }

  return {
    key,
    parseKey,
    entry,
    stores,
    async forEachDirty(fn) {
      for (const [k, e] of stores) {
        if (!e.dirty || !e.data) continue;
        const ctx = parseKey(k);
        if (ctx) {
          await runWithDataContext(ctx, () => fn(e, k));
        } else {
          await fn(e, k);
        }
      }
    },
  };
}
