import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR } from "../../data/store.js";

function parseBool(name, fallback = false) {
  const value = String(process.env[name] || "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

/** Runtime feature / kill switches (env + optional ops overlay). */
export function getFeatureFlags() {
  return {
    maintenanceMode: parseBool("MAINTENANCE_MODE", false),
    maintenanceMessage:
      String(process.env.MAINTENANCE_MESSAGE || "").trim() ||
      "Usely is briefly down for maintenance. Billing webhooks and health checks stay up — try again shortly.",
    disableKits: parseBool("DISABLE_KITS", false),
    disableWipeScheduler: parseBool("DISABLE_WIPE_SCHEDULER", false),
    disableSlashCommands: parseBool("DISABLE_SLASH_COMMANDS", false),
    maxRconConnections: Math.max(
      1,
      Number(process.env.MAX_RCON_CONNECTIONS || "40") || 40,
    ),
  };
}

export function featureDisabled(name) {
  const flags = getFeatureFlags();
  if (name === "kits") return flags.disableKits;
  if (name === "wipe") return flags.disableWipeScheduler;
  if (name === "slash") return flags.disableSlashCommands;
  return false;
}

const INCIDENT_FILE = () => path.join(DATA_DIR, "incident.json");

/**
 * @returns {Promise<{ message: string, severity: string, updatedAt: string } | null>}
 */
export async function readIncident() {
  const fromEnv = String(process.env.STATUS_INCIDENT_MESSAGE || "").trim();
  if (fromEnv) {
    return {
      message: fromEnv,
      severity: String(process.env.STATUS_INCIDENT_SEVERITY || "warning").trim() || "warning",
      updatedAt: new Date().toISOString(),
      source: "env",
    };
  }
  try {
    const raw = JSON.parse(await fs.readFile(INCIDENT_FILE(), "utf8"));
    const message = String(raw?.message || "").trim();
    if (!message) return null;
    return {
      message,
      severity: String(raw.severity || "warning").trim() || "warning",
      updatedAt: raw.updatedAt || new Date().toISOString(),
      source: "file",
    };
  } catch {
    return null;
  }
}

/** @param {{ message: string, severity?: string } | null} incident */
export async function writeIncident(incident) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!incident || !String(incident.message || "").trim()) {
    try {
      await fs.unlink(INCIDENT_FILE());
    } catch {
      /* none */
    }
    return null;
  }
  const payload = {
    message: String(incident.message).trim().slice(0, 2000),
    severity: ["info", "warning", "critical"].includes(incident.severity)
      ? incident.severity
      : "warning",
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(INCIDENT_FILE(), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}
