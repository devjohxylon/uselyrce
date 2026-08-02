/**
 * Single source of truth for the public changelog.
 *
 * Add a new object to the TOP of `entries` when shipping user-visible changes.
 * `text` may contain inline HTML (e.g. <code>) — it is authored, not user input.
 * Both the Vercel build and the Express route render from here.
 */
export const entries = [
  {
    date: "2026-08-01",
    title: "Multi-tenant hardening for launch",
    changes: [
      { type: "fixed", text: "Each workspace’s kits, links, bans, wipe time, and Discord feed channels stay isolated per server — no cross-customer bleed on a shared host." },
      { type: "fixed", text: "Owners can only edit or delete their own WebRCON servers (and set defaults only within their workspace)." },
      { type: "fixed", text: "Checkout retries no longer create duplicate workspaces for the same Stripe subscription." },
      { type: "added", text: "Owner password reset from the panel login screen; setup-email resend lives on the signup page after checkout." },
      { type: "changed", text: "WebRCON rejects private/local hosts; unpaid workspaces no longer stay attached to the live RCON pool." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Status page, RCON alerts, and clearer bans",
    changes: [
      { type: "added", text: "Workspace status at <code>yourslug.usely.dev/status</code> shows that workspace’s Discord and WebRCON health (with a Powered by Usely mark)." },
      { type: "added", text: "Discord alerts when WebRCON drops or comes back (Announcements / Wipes channel), so you’re not guessing from silence." },
      { type: "changed", text: "Compact killfeed lines now include weapon, headshot, and distance." },
      { type: "changed", text: "Bans table labels who issued each ban as <strong>Banned by</strong> (staff key label or owner)." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Wipe countdown Discord posts",
    changes: [
      { type: "added", text: "When a wipe time is set, Usely posts to your Wipes channel (or Announcements) at <strong>24 hours</strong>, <strong>1 hour</strong>, and wipe time — with Discord timestamps so everyone sees local time." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Workspace setup and staff keys",
    changes: [
      { type: "added", text: "Staff key presets — Helper, Moderator, and Admin — so you can grant sensible access in one click, then tweak." },
      { type: "changed", text: "Workspace Setup is a side-by-side Discord + servers layout; Staff keys use permission chips you can click to turn on or off." },
      { type: "changed", text: "Discord role maps for panel login are gone. Staff sign in with access keys on your panel URL; create and revoke them under <strong>Workspace → Staff keys</strong>." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Hardened WebRCON setup",
    changes: [
      { type: "changed", text: "Setup and Workspace → Servers validate host/port/password, test the WebRCON connection, and warn if it doesn't come up — instead of silently saving bad credentials." },
      { type: "fixed", text: "RCON reconnect after a drop keeps the stored password (watchdog no longer fails open with a blank password)." },
      { type: "changed", text: "Marketing examples and demo labels use Usely naming instead of leftover Astral copy." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Clearer SaaS setup guidance",
    changes: [
      { type: "changed", text: "When WebRCON isn't connected, Discord and the panel now point you to <strong>Workspace → Servers</strong> (or your setup link) instead of asking for <code>.env</code> values." },
      { type: "changed", text: "VIP revoke and Discord channel/ticket errors also steer you to panel settings, and leftover Astral labels in bot embeds were renamed to Usely." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Discord slash commands cleanup",
    changes: [
      { type: "changed", text: "Removed legacy Astral website slash commands (<code>/astral-status</code>, <code>/astral-leaderboard</code>, <code>/astral-sync</code>). Rust, linking, and staff commands stay." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Setup includes Discord and WebRCON",
    changes: [
      { type: "changed", text: "After checkout, setup walks you through panel address, inviting the Discord bot, and connecting your first WebRCON server before opening the panel." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Invite the Discord bot from the panel",
    changes: [
      { type: "added", text: "Workspace Servers tab has a one-click <strong>Invite Discord bot</strong> button, plus guild linking that actually saves." },
      { type: "fixed", text: "Adding servers, role maps, and billing checkout from the workspace tab now work end-to-end." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Bot and panel parity",
    changes: [
      { type: "added", text: "VIP kit claims via in-game quick chat, with once-per-wipe and post-wipe lockout." },
      { type: "added", text: "Edit and resync KitManager kits from the Kits tab." },
      { type: "added", text: "Discord wipe stats cards — <code>/stats me</code>, <code>/stats panel</code>, and View My Stats." },
      { type: "changed", text: "Killfeed Discord posts respect feed settings (compact style, filters, and toggles)." },
      { type: "changed", text: "Account linking no longer requires you to be online." },
      { type: "changed", text: "Leaderboard image publishes to Discord on a timer and when you push stats." },
    ],
  },
  {
    date: "2026-07-29",
    title: "Interactive panel demo",
    changes: [
      { type: "added", text: "Preview the real admin panel with mock data at <code>app.usely.dev/demo</code> — nothing is saved." },
      { type: "changed", text: "Homepage CTA opens the interactive demo so you can click through the real UI before signing up." },
    ],
  },
  {
    date: "2026-07-29",
    title: "Admin panel catch-up",
    changes: [
      { type: "added", text: "Live map with player positions and calibration." },
      { type: "added", text: "Player profiles tab with linked Discord and stats history." },
      { type: "added", text: "Discord settings for feeds, VIP, status displays, and command channels." },
      { type: "added", text: "Actions tab for kits, ranks, and events from the panel." },
      { type: "added", text: "Server status, wipe automation, and analytics views." },
      { type: "changed", text: "Panel navigation reorganized around Home, Players, Kits, Community, Server, Actions, and Discord." },
    ],
  },
  {
    date: "2026-07-29",
    title: "Docs, FAQ, contact, and changelog",
    changes: [
      { type: "added", text: "Documentation covering setup, WebRCON, kits, the Discord bot, staff permissions, and troubleshooting." },
      { type: "added", text: "FAQ page covering setup, WebRCON, staff permissions, and billing." },
      { type: "added", text: "Contact page with a form that reaches the team by email." },
      { type: "added", text: "Changelog page listing every user-visible change." },
      { type: "fixed", text: "RCON pool startup no longer fails when loading enabled servers." },
      { type: "added", text: "Terms of Service and Privacy Policy." },
      { type: "added", text: "Status page showing live health of the panel, Discord bot, and RCON connections." },
      { type: "changed", text: "Rebuilt the marketing site layout on a consistent spacing and type scale." },
      { type: "changed", text: "Moved plan cards off the homepage so pricing lives in one place." },
      { type: "fixed", text: "Overlapping text in the Basic plan feature list." },
    ],
  },
  {
    date: "2026-07-29",
    title: "Usely launch",
    changes: [
      { type: "added", text: "Multi-tenant workspaces — connect and manage servers for your own community, isolated from every other customer." },
      { type: "added", text: "Per-workspace panel addresses on <code>*.usely.dev</code>, chosen during setup." },
      { type: "added", text: "Owner accounts with email and password; staff continue to sign in with Discord." },
      { type: "added", text: "Buy-first onboarding: pick a plan, pay, then finish setup from an emailed link." },
      { type: "added", text: "Subscription billing with Basic, Pro, and Network plans." },
      { type: "changed", text: "Rebranded from Astral to Usely." },
      { type: "changed", text: "Multi-server support: switch the active server from the panel header." },
    ],
  },
  {
    date: "2026-07-28",
    title: "Security hardening",
    changes: [
      { type: "changed", text: "Tightened admin panel authentication and RCON privilege boundaries so staff permissions are enforced on every command." },
      { type: "changed", text: "Server credentials are encrypted before storage." },
    ],
  },
  {
    date: "2026-07-26",
    title: "Kit builder and panel improvements",
    changes: [
      { type: "added", text: "Kit builder redesign with item images and a cleaner layout." },
      { type: "added", text: "Live map showing real player positions from RCON polling." },
      { type: "added", text: "Rebuilt staff key creation flow." },
      { type: "changed", text: "Kit catalog now uses the Rust Console Edition item list — PC-only items, scopes, and attachments removed." },
      { type: "fixed", text: "Ban lists now parse Console gamertags, so prior bans show up and stay in sync." },
      { type: "fixed", text: "Sidebar toggle overlap and inconsistent spacing across the panel." },
    ],
  },
];

const TYPE_LABEL = { added: "Added", changed: "Changed", fixed: "Fixed" };

function formatDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function renderEntries() {
  return entries
    .map(
      (entry) => `      <article class="entry">
        <div class="when">
          <time datetime="${entry.date}">${formatDate(entry.date)}</time>
        </div>
        <div class="what">
          <h2>${entry.title}</h2>
          <ul>
${entry.changes
  .map(
    (change) => `            <li><span class="tag ${change.type}">${
      TYPE_LABEL[change.type] ?? change.type
    }</span><span>${change.text}</span></li>`,
  )
  .join("\n")}
          </ul>
        </div>
      </article>`,
    )
    .join("\n");
}
