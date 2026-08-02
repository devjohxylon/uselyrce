import { config } from "../../config.js";

const API = "https://api.vercel.com/v1/query/web-analytics/visits";

function configured() {
  return Boolean(config.saas.vercelToken && config.saas.vercelProjectId);
}

function rangeMs(days) {
  const until = Date.now();
  const since = until - days * 24 * 60 * 60 * 1000;
  return { since, until };
}

async function vercelQuery(path, params) {
  const url = new URL(`${API}/${path}`);
  url.searchParams.set("projectId", config.saas.vercelProjectId);
  if (config.saas.vercelTeamId) {
    url.searchParams.set("teamId", config.saas.vercelTeamId);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.saas.vercelToken}`,
      Accept: "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      body?.error?.message ||
      body?.message ||
      `Vercel Analytics API ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

function normalizeCount(data) {
  const row = data?.data && !Array.isArray(data.data) ? data.data : data?.data?.[0] || data;
  return {
    pageviews: Number(row?.pageviews ?? row?.pageViews ?? 0) || 0,
    visitors: Number(row?.visitors ?? 0) || 0,
  };
}

function normalizeRows(data, dimKey) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((row) => ({
      key: String(row?.[dimKey] ?? row?.timestamp ?? "(unknown)"),
      pageviews: Number(row?.pageviews ?? row?.pageViews ?? 0) || 0,
      visitors: Number(row?.visitors ?? 0) || 0,
    }))
    .filter((r) => r.key && r.key !== "null" && r.key !== "undefined")
    .sort((a, b) => b.pageviews - a.pageviews || b.visitors - a.visitors);
}

/**
 * Marketing-site traffic from Vercel Web Analytics (www.usely.dev).
 * Returns { ok, configured, ... } — never throws for missing config.
 */
export async function getOpsWebAnalytics({ days = 7 } = {}) {
  if (!configured()) {
    return {
      ok: false,
      configured: false,
      error:
        "Set VERCEL_TOKEN and VERCEL_PROJECT_ID on Railway (optional VERCEL_TEAM_ID). Enable Web Analytics on the www.usely.dev project in Vercel.",
    };
  }

  const windowDays = [7, 14, 30].includes(Number(days)) ? Number(days) : 7;
  const { since, until } = rangeMs(windowDays);

  try {
    const [totals, byDay, byPath, byReferrer, byCountry, byDevice] = await Promise.all([
      vercelQuery("count", { since, until }),
      vercelQuery("aggregate", { since, until, by: ["day"], limit: 40 }),
      vercelQuery("aggregate", { since, until, by: ["requestPath"], limit: 15 }),
      vercelQuery("aggregate", { since, until, by: ["referrerHostname"], limit: 12 }),
      vercelQuery("aggregate", { since, until, by: ["country"], limit: 12 }),
      vercelQuery("aggregate", { since, until, by: ["deviceType"], limit: 8 }),
    ]);

    return {
      ok: true,
      configured: true,
      days: windowDays,
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
      totals: normalizeCount(totals),
      daily: normalizeRows(byDay, "timestamp").sort((a, b) =>
        String(a.key).localeCompare(String(b.key)),
      ),
      pages: normalizeRows(byPath, "requestPath"),
      referrers: normalizeRows(byReferrer, "referrerHostname"),
      countries: normalizeRows(byCountry, "country"),
      devices: normalizeRows(byDevice, "deviceType"),
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error.message || "Failed to load analytics",
      status: error.status || 500,
    };
  }
}
