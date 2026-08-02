/**
 * Server-built fixtures for /demo — shapes match real /admin/api responses
 * so the panel UI can render without a live RCON session.
 */
import { getChannelConfig } from "../../modules/admin/channel-settings.js";
import { getFeedSettingsForPanel } from "../../modules/admin/feed-settings.js";
import { getCommandSettingsForPanel } from "../../modules/admin/command-settings.js";
import { getStatusSettingsForPanel } from "../../modules/admin/status-settings.js";
import { getVipSettingsForPanel } from "../../modules/admin/vip-settings.js";
import { getWipeAutomationConfig } from "../../modules/rcon/wipe-runner.js";
import { OWNER_PERMISSIONS } from "../../modules/admin/access-keys.js";
import { STAFF_PERMISSIONS } from "../../modules/admin/access-keys.js";
import { listRustItems } from "../../data/rust-items.js";

const PLAYERS = [
  { ign: "GhostNova", platform: "Xbox", ping: 42 },
  { ign: "IronWarden", platform: "PlayStation", ping: 67 },
  { ign: "SaltMine42", platform: "Xbox", ping: 91 },
  { ign: "Kayce", platform: "PlayStation", ping: 38 },
  { ign: "RustedCrown", platform: "Xbox", ping: 55 },
];

const PERMS = {
  ...OWNER_PERMISSIONS,
  servers: true,
  billing: true,
};

function hourlyData() {
  const out = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000);
    const hour = d.toISOString().slice(0, 13);
    out.push({
      hour,
      peak: 18 + Math.round(20 * Math.sin(i / 3) + 15),
      samples: 12,
    });
  }
  return out;
}

export async function buildDemoFixtures() {
  const wipeAt = new Date(Date.now() + 3 * 86400000).toISOString();
  const wipeAutomation = await getWipeAutomationConfig();

  const discordChannels = [
    { id: "111000000000000001", name: "killfeed", type: "text", parent: "Game" },
    { id: "111000000000000002", name: "chat", type: "text", parent: "Game" },
    { id: "111000000000000003", name: "joins", type: "text", parent: "Game" },
    { id: "111000000000000004", name: "pop｜100", type: "voice", parent: "Status" },
    { id: "111000000000000005", name: "wipe｜3d", type: "voice", parent: "Status" },
    { id: "111000000000000006", name: "leaderboard", type: "text", parent: "Game" },
  ];
  const discordRoles = [
    { id: "200000000000000001", name: "VIP", color: "#e8c06a" },
    { id: "200000000000000002", name: "Mod", color: "#7eb8e8" },
  ];

  const channelsPayload = {
    channels: await getChannelConfig(),
    discordChannels,
    discordRoles,
    ...(await getFeedSettingsForPanel()),
    ...(await getCommandSettingsForPanel()),
    ...(await getStatusSettingsForPanel()),
    ...(await getVipSettingsForPanel()),
  };

  // Seed a few demo channel picks so dropdowns look live.
  for (const ch of channelsPayload.channels) {
    if (ch.key === "killfeed") {
      ch.value = discordChannels[0].id;
      ch.source = "panel";
    }
    if (ch.key === "popStatus") {
      ch.value = discordChannels[3].id;
      ch.source = "panel";
    }
  }

  const online = PLAYERS.map((p) => ({
    ...p,
    link:
      p.ign === "GhostNova" || p.ign === "Kayce"
        ? { discordId: "100000000000000001", ign: p.ign }
        : null,
  }));

  const profiles = PLAYERS.map((p) => ({
    ign: p.ign,
    tags: p.ign === "IronWarden" ? ["vip"] : [],
    noteCount: p.ign === "GhostNova" ? 1 : 0,
    warningCount: 0,
  }));

  const session = {
    ok: true,
    authed: true,
    saas: true,
    role: "owner",
    label: "Demo Owner",
    permissions: PERMS,
    orgId: "demo-org",
    org: {
      id: "demo-org",
      name: "Usely Demo",
      plan: "pro",
      planStatus: "active",
      guildId: null,
      maxServers: 2,
    },
    serverId: "demo-server-1",
    servers: [
      {
        id: "demo-server-1",
        name: "Main",
        rcon_host: "203.0.113.10",
        rcon_port: 28016,
        enabled: true,
      },
      {
        id: "demo-server-2",
        name: "Softcore",
        rcon_host: "203.0.113.11",
        rcon_port: 28016,
        enabled: true,
      },
    ],
    staffPermissionDefaults: STAFF_PERMISSIONS,
    botInviteUrl: "https://discord.com/api/oauth2/authorize?client_id=0&permissions=8&scope=bot%20applications.commands",
  };

  const overview = {
    ok: true,
    server: {
      hostname: "Usely Demo | Trio | Monthly",
      players: online.length,
      maxPlayers: 100,
      queued: 2,
      joining: 1,
      fps: 58,
      uptime: 148320,
      map: "Procedural Map",
      gameTime: "14:32",
      entities: 18420,
      restarting: false,
    },
    onlinePlayers: online,
    stats: { totalKills: 1842, wipe: "July 2026" },
    bot: { ready: true, uptimeSeconds: 902400, user: "Usely#0000" },
    wipe: { wipeAt, localInput: wipeAt.slice(0, 16) },
    rcon: {
      enabled: true,
      connected: true,
      host: "203.0.113.10",
      port: 28016,
      connectedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    health: [
      { id: "rcon", label: "RCON", status: "ok", detail: "Connected" },
      { id: "discord", label: "Discord", status: "ok", detail: "Ready" },
      { id: "volume", label: "Data", status: "ok", detail: "Persisted" },
    ],
  };

  return {
    session,
    overview,
    players: { ok: true, online, links: online.filter((p) => p.link).map((p) => p.link) },
    "players/search": { ok: true, results: [] },
    channels: { ok: true, ...channelsPayload },
    "server-commands": {
      ok: true,
      ...channelsPayload,
      online: online.map((p) => p.ign),
      ranks: [],
      events: [],
    },
    wipe: { ok: true, wipeAt },
    "wipe/automation": { ok: true, ...wipeAutomation },
    stats: {
      ok: true,
      category: "kills",
      rows: [
        { rank: 1, name: "GhostNova", value: "214" },
        { rank: 2, name: "Kayce", value: "190" },
        { rank: 3, name: "IronWarden", value: "156" },
        { rank: 4, name: "RustedCrown", value: "134" },
        { rank: 5, name: "SaltMine42", value: "98" },
      ],
      summary: { wipe: "July 2026", totalKills: 1842 },
    },
    links: {
      ok: true,
      links: [
        { discordId: "100000000000000001", ign: "GhostNova", username: "ghostnova" },
        { discordId: "100000000000000002", ign: "Kayce", username: "kayce" },
      ],
    },
    warps: {
      ok: true,
      warps: {
        outpost: { x: 120, y: 12, z: -40 },
        bandit: { x: -80, y: 8, z: 210 },
      },
    },
    automessages: {
      ok: true,
      messages: [
        {
          id: "m1",
          text: "Welcome — link Discord in #links",
          intervalMinutes: 30,
          enabled: true,
        },
        {
          id: "m2",
          text: "Wipe Thursday 6pm UTC. Kits reset at wipe.",
          intervalMinutes: 60,
          enabled: true,
        },
      ],
    },
    schedule: {
      ok: true,
      jobs: [
        {
          id: "j1",
          label: "Night restart",
          command: "restart 300",
          cron: "0 6 * * *",
          enabled: true,
          lastRun: null,
        },
      ],
    },
    kits: {
      ok: true,
      kits: [
        {
          id: "starter",
          label: "Starter",
          cooldownMinutes: 60,
          claimPhrase: "starter kit",
          claimRoleId: "",
          items: [
            { item: "rock", amount: 1 },
            { item: "torch", amount: 1 },
          ],
        },
        {
          id: "boom",
          label: "Boom",
          cooldownMinutes: 180,
          claimPhrase: "boom kit|need boom",
          claimRoleId: "",
          items: [
            { item: "explosive.timed", amount: 2 },
            { item: "ammo.rocket.basic", amount: 4 },
          ],
        },
        {
          id: "vip",
          label: "VIP",
          cooldownMinutes: 120,
          claimPhrase: "",
          claimRoleId: "",
          items: [{ item: "metal.facemask", amount: 1 }],
        },
      ],
      kitLocks: {
        enabled: false,
        until: null,
        kitIds: ["boom"],
      },
      discordRoles: [
        { id: "role-vip", name: "VIP", color: "#c9a227" },
        { id: "role-member", name: "Member", color: "#888888" },
      ],
      serverKits: [],
      serverOk: true,
      serverError: null,
    },
    items: {
      ok: true,
      ...listRustItems(),
    },
    keys: {
      ok: true,
      keys: [
        {
          id: "k1",
          label: "Mods",
          enabled: true,
          permissions: STAFF_PERMISSIONS,
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        },
      ],
    },
    reports: {
      ok: true,
      groupMax: 3,
      combat: [
        {
          at: new Date().toISOString(),
          killer: "GhostNova",
          victim: "SaltMine42",
          weapon: "Assault Rifle",
          headshot: true,
        },
      ],
      groups: [
        {
          id: "g1",
          teamId: "4821",
          size: 4,
          max: 3,
          members: ["Alpha", "Bravo", "Charlie", "Delta"],
          at: new Date().toISOString(),
        },
      ],
    },
    logs: {
      ok: true,
      entries: [
        {
          at: new Date().toISOString(),
          action: "broadcast",
          by: "Demo Owner",
          detail: { message: "Welcome" },
        },
      ],
    },
    audit: {
      ok: true,
      entries: [
        {
          at: new Date(Date.now() - 600000).toISOString(),
          action: "login",
          by: "Demo Owner",
          detail: {},
        },
      ],
    },
    bans: {
      ok: true,
      bans: [
        {
          ign: "CheaterX",
          reason: "Esp",
          bannedAt: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    },
    events: {
      ok: true,
      events: [
        {
          id: "e1",
          name: "Auto restart",
          command: "restart 300",
          enabled: true,
          schedule: { type: "daily", time: "06:00" },
          nextRunAt: new Date(Date.now() + 86400000).toISOString(),
          runCount: 12,
        },
        {
          id: "e2",
          name: "Airdrop",
          command: "event.run airdrop",
          enabled: true,
          schedule: { type: "interval", minutes: 90 },
          nextRunAt: new Date(Date.now() + 3600000).toISOString(),
          runCount: 4,
        },
      ],
    },
    analytics: {
      ok: true,
      peak24h: 67,
      avg24h: 28,
      avgFps: 55,
      activePlayers: 42,
      topWeapons: [
        { weapon: "Assault Rifle", kills: 312 },
        { weapon: "Custom SMG", kills: 198 },
      ],
      hourlyData: hourlyData(),
      performanceData: Array.from({ length: 24 }, (_, i) => ({
        fps: 50 + (i % 8),
        at: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
      })),
    },
    map: {
      ok: true,
      seed: 12345,
      size: 4250,
      imageUrl: null,
      players: PLAYERS.map((p, i) => ({
        ign: p.ign,
        x: -800 + i * 350,
        z: 200 - i * 180,
      })),
    },
    profiles: { ok: true, profiles },
    saas: {
      servers: {
        ok: true,
        servers: session.servers,
      },
      roles: {
        ok: true,
        roles: [
          {
            id: "r1",
            discord_role_id: "200000000000000002",
            label: "Mod",
            permissions: STAFF_PERMISSIONS,
          },
        ],
      },
      billing: {
        ok: true,
        plan: "pro",
        planStatus: "active",
        portalUrl: null,
      },
    },
  };
}

export function profileFixture(ign) {
  const hit = PLAYERS.find((p) => p.ign.toLowerCase() === String(ign).toLowerCase());
  const name = hit?.ign || ign;
  return {
    ok: true,
    profile: {
      ign: name,
      tags: name === "IronWarden" ? ["vip"] : [],
      notes:
        name === "GhostNova"
          ? [
              {
                id: "n1",
                text: "Trusted regular",
                author: "Demo Owner",
                timestamp: new Date().toISOString(),
              },
            ]
          : [],
      warnings: [],
      stats: { kills: 214, deaths: 88, kd: 2.43, playtime: 92000 },
      online: hit || null,
      link:
        name === "GhostNova" || name === "Kayce"
          ? { discordId: "100000000000000001", username: "ghostnova" }
          : null,
      createdAt: new Date().toISOString(),
    },
    banHistory: [],
  };
}
