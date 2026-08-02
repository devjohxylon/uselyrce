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

function pickMetrics(row) {
  if (!row || typeof row !== "object") return { pageviews: 0, visitors: 0 };
  const pageviews =
    Number(
      row.pageviews ??
        row.pageViews ??
        row.views ??
        row.total ??
        row.count ??
        0,
    ) || 0;
  const visitors =
    Number(row.visitors ?? row.uniqueVisitors ?? row.users ?? row.visitorCount ?? 0) || 0;
  return { pageviews, visitors };
}

function normalizeCount(data) {
  const d = data?.data;
  if (d && typeof d === "object" && !Array.isArray(d)) return pickMetrics(d);
  if (Array.isArray(d) && d[0]) return pickMetrics(d[0]);
  return pickMetrics(data);
}

function normalizeRows(data, dimKey) {
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((row) => {
      const metrics = pickMetrics(row);
      return {
        key: String(row?.[dimKey] ?? row?.timestamp ?? "(unknown)"),
        pageviews: metrics.pageviews,
        visitors: metrics.visitors,
      };
    })
    .filter((r) => r.key && r.key !== "null" && r.key !== "undefined")
    .sort((a, b) => b.pageviews - a.pageviews || b.visitors - a.visitors);
}

function sumMetrics(rows) {
  return (rows || []).reduce(
    (acc, r) => {
      acc.pageviews += Number(r.pageviews) || 0;
      acc.visitors += Number(r.visitors) || 0;
      return acc;
    },
    { pageviews: 0, visitors: 0 },
  );
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
    const [totalsRes, byDay, byPath, byReferrer, byCountry, byDevice] = await Promise.all([
      vercelQuery("count", { since, until }),
      vercelQuery("aggregate", { since, until, by: ["day"], limit: 40 }),
      vercelQuery("aggregate", { since, until, by: ["requestPath"], limit: 15 }),
      vercelQuery("aggregate", { since, until, by: ["referrerHostname"], limit: 12 }),
      vercelQuery("aggregate", { since, until, by: ["country"], limit: 12 }),
      vercelQuery("aggregate", { since, until, by: ["deviceType"], limit: 8 }),
    ]);

    const daily = normalizeRows(byDay, "timestamp").sort((a, b) =>
      String(a.key).localeCompare(String(b.key)),
    );
    const pages = normalizeRows(byPath, "requestPath");
    let totals = normalizeCount(totalsRes);
    if (!totals.pageviews && !totals.visitors) {
      const fromDaily = sumMetrics(daily);
      const fromPages = sumMetrics(pages);
      totals = fromDaily.pageviews || fromDaily.visitors ? fromDaily : fromPages;
    }

    return {
      ok: true,
      configured: true,
      days: windowDays,
      since: new Date(since).toISOString(),
      until: new Date(until).toISOString(),
      totals,
      daily,
      pages,
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
