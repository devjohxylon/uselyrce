import { getAuditLog, saveAuditLog } from "../../data/store.js";
import { createTenantCache } from "../../saas/tenant-cache.js";

const cache = createTenantCache();

function markDirty() {
  cache.entry().dirty = true;
}

async function load() {
  const e = cache.entry();
  if (!e.data) {
    e.data = await getAuditLog();
    if (!e.data.entries) e.data.entries = [];
  }
  return e.data;
}

async function persist() {
  const e = cache.entry();
  if (!e.dirty || !e.data) return;
  await saveAuditLog(e.data);
  e.dirty = false;
}

setInterval(() => {
  cache.forEachDirty(async (e) => {
    if (!e.dirty || !e.data) return;
    await saveAuditLog(e.data);
    e.dirty = false;
  }).catch(() => {});
}, 30000);

export async function logAction(action, details = {}) {
  const data = await load();
  
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    timestamp: new Date().toISOString(),
    action,
    admin: details.admin || "System",
    target: details.target || null,
    details: details.extra || null,
    ip: details.ip || null,
  };
  
  data.entries.unshift(entry);
  
  data.entries = data.entries.slice(0, 10000);
  
  markDirty();
  return entry;
}

export async function getAuditEntries(filters = {}) {
  const data = await load();
  let entries = [...data.entries];
  
  if (filters.admin) {
    entries = entries.filter(e => 
      e.admin.toLowerCase().includes(filters.admin.toLowerCase())
    );
  }
  
  if (filters.action) {
    entries = entries.filter(e => 
      e.action.toLowerCase().includes(filters.action.toLowerCase())
    );
  }
  
  if (filters.target) {
    entries = entries.filter(e => 
      e.target && e.target.toLowerCase().includes(filters.target.toLowerCase())
    );
  }
  
  if (filters.startDate) {
    entries = entries.filter(e => new Date(e.timestamp) >= new Date(filters.startDate));
  }
  
  if (filters.endDate) {
    entries = entries.filter(e => new Date(e.timestamp) <= new Date(filters.endDate));
  }
  
  return entries.slice(0, filters.limit || 100);
}

export async function clearOldEntries(daysToKeep = 90) {
  const data = await load();
  const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
  
  const before = data.entries.length;
  data.entries = data.entries.filter(e => new Date(e.timestamp).getTime() > cutoff);
  
  if (before !== data.entries.length) {
    markDirty();
    await persist();
  }
  
  return before - data.entries.length;
}
