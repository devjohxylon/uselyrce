import { EmbedBuilder } from "discord.js";
import { config } from "../../config.js";
import { getSettings, saveSettings } from "../../data/store.js";
import { wipeEmbed } from "../../utils/format.js";
import { resolveChannelId } from "../../saas/tenant-channels.js";
import { forEachAttachedTenant } from "../../saas/tenant-context.js";
import { maybeAutoRunWipe } from "./wipe-runner.js";

/** @type {Map<string, { name: string|null, at: number }>} */
const wipeRenameByKey = new Map();
let wipeTimer = null;
let discordClient = null;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Ordered oldest-threshold first so catch-up posts 24h before 1h. */
const COUNTDOWN_MILESTONES = [
  {
    id: "24h",
    ms: DAY,
    title: "Wipe in 24 hours",
    content: "Wipe is about **24 hours** away. Finish bases, move loot, and get ready.",
  },
  {
    id: "1h",
    ms: HOUR,
    title: "Wipe in 1 hour",
    content: "Wipe is about **1 hour** away. Log off when you're done — map wipe is coming.",
  },
  {
    id: "wipe",
    ms: 0,
    title: "Wipe time",
    content: "It's wipe time. Good luck — see you on the new map.",
  },
];

export async function getWipeAt() {
  const settings = await getSettings();
  return settings.wipeAt || config.wipe.at || null;
}

export async function setWipeAt(isoOrNull) {
  const settings = await getSettings();
  if (!isoOrNull) {
    delete settings.wipeAt;
    delete settings.wipeCountdownPosted;
  } else {
    const d = new Date(isoOrNull);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid datetime" };
    const next = d.toISOString();
    if (settings.wipeAt !== next) {
      settings.wipeCountdownPosted = { wipeAt: next, milestones: [] };
    }
    settings.wipeAt = next;
  }
  await saveSettings(settings);
  return { ok: true, wipeAt: settings.wipeAt || null };
}

export function formatWipeCountdown(wipeAt) {
  if (!wipeAt) return { label: "Wipe TBA", remainingMs: null, past: false };
  const target = new Date(wipeAt).getTime();
  const remainingMs = target - Date.now();
  if (remainingMs <= 0) return { label: "Wiped", remainingMs: 0, past: true };

  const totalMins = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;

  let label = "Wipe ";
  if (days > 0) label += `${days}d ${hours}h`;
  else if (hours > 0) label += `${hours}h ${mins}m`;
  else label += `${mins}m`;

  return { label, remainingMs, past: false };
}

export async function buildWipePayload() {
  const wipeAt = await getWipeAt();
  const countdown = formatWipeCountdown(wipeAt);
  return {
    type: "wipe_status",
    source: "usely",
    wipeAt,
    label: countdown.label,
    remainingMs: countdown.remainingMs,
    past: countdown.past,
    updatedAt: new Date().toISOString(),
  };
}

async function renameWipeChannel(client, force = false, renameKey = "legacy") {
  const channelId = resolveChannelId("wipeStatus");
  if (!channelId || !client) return;

  const wipeAt = await getWipeAt();
  const { label } = formatWipeCountdown(wipeAt);
  const name = label.slice(0, 90);
  const prev = wipeRenameByKey.get(renameKey) || { name: null, at: 0 };
  if (!force && name === prev.name) return;

  const now = Date.now();
  if (!force && now - prev.at < config.rcon.statusUpdateMs) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  await channel.setName(name).catch(() => {});
  wipeRenameByKey.set(renameKey, { name, at: now });
}

function milestoneDue(milestone, countdown) {
  if (milestone.id === "wipe") {
    return Boolean(countdown.past || (countdown.remainingMs != null && countdown.remainingMs <= 0));
  }
  if (countdown.remainingMs == null) return false;
  return countdown.remainingMs <= milestone.ms;
}

async function maybePostWipeCountdown(client, wipeAt, countdown) {
  if (!client || !wipeAt) return;
  const channelId = resolveChannelId("wipes") || resolveChannelId("announcements");
  if (!channelId) return;

  const settings = await getSettings();
  let state = settings.wipeCountdownPosted;
  if (!state || state.wipeAt !== wipeAt) {
    state = { wipeAt, milestones: [] };
  }
  const posted = new Set(state.milestones || []);
  const due = COUNTDOWN_MILESTONES.filter((m) => !posted.has(m.id) && milestoneDue(m, countdown));
  if (!due.length) {
    if (settings.wipeCountdownPosted?.wipeAt !== wipeAt) {
      settings.wipeCountdownPosted = state;
      await saveSettings(settings);
    }
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return;

  const unix = Math.floor(new Date(wipeAt).getTime() / 1000);

  for (const m of due) {
    const embedData = wipeEmbed({
      title: m.title,
      content: `${m.content}\n\nCountdown: <t:${unix}:R>`,
      wipeAt,
    });
    const embed = EmbedBuilder.from(embedData);
    try {
      await channel.send({ embeds: [embed] });
      posted.add(m.id);
    } catch (error) {
      console.warn(`Wipe countdown post (${m.id}) failed:`, error.message);
      break;
    }
  }

  settings.wipeCountdownPosted = { wipeAt, milestones: [...posted] };
  await saveSettings(settings);
}

async function syncOneWipe(client, { force = false, renameKey = "legacy" } = {}) {
  const payload = await buildWipePayload();
  await renameWipeChannel(client, force, renameKey);
  await maybePostWipeCountdown(client, payload.wipeAt, {
    remainingMs: payload.remainingMs,
    past: payload.past,
  }).catch((error) => {
    console.warn("Wipe countdown posts failed:", error.message);
  });
  await maybeAutoRunWipe(client).catch((error) => {
    console.warn("Scheduled wipe automation failed:", error.message);
  });
  return payload;
}

export async function syncWipeStatus(client = discordClient, { force = false } = {}) {
  if (config.saas?.enabled) {
    let last = null;
    await forEachAttachedTenant(async (t) => {
      last = await syncOneWipe(client, {
        force,
        renameKey: `${t.orgId}:${t.serverId}`,
      });
    });
    return last;
  }
  return syncOneWipe(client, { force });
}

export function startWipeScheduler(client) {
  discordClient = client;
  if (wipeTimer) return;
  syncWipeStatus(client, { force: true }).catch(() => {});
  wipeTimer = setInterval(() => {
    import("../../saas/ops/flags.js")
      .then(({ featureDisabled }) => {
        if (featureDisabled("wipe")) return;
        return syncWipeStatus(client);
      })
      .catch(() => {});
  }, 60_000);
}

export function stopWipeScheduler() {
  if (wipeTimer) clearInterval(wipeTimer);
  wipeTimer = null;
}
