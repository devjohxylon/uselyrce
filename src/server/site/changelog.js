/**
 * Single source of truth for the public changelog.
 *
 * Add a new object to the TOP of `entries` when shipping user-visible changes.
 * `text` may contain inline HTML (e.g. <code>) — it is authored, not user input.
 * Both the Vercel build and the Express route render from here.
 */
export const entries = [
  {
    date: "2026-08-02",
    title: "Tighter visual system across site and panel",
    changes: [
      { type: "fixed", text: "Mobile menu Get started button is readable again (dark text on the sky accent)." },
      { type: "fixed", text: "Home status cards reflow on phone instead of crushing into unreadably narrow columns." },
      { type: "changed", text: "Marketing labels, buttons, spacing, and plan cards share one radius and type scale." },
      { type: "changed", text: "Panel status colors, empty states, and touch targets match the same design tokens as the marketing site." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Network plan is 4+ servers",
    changes: [
      { type: "changed", text: "Network is marketed as <code>4+</code> servers — not an up-to-100 soft unlimited." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Launch QA fixes for nav, billing, and first-run setup",
    changes: [
      { type: "fixed", text: "The marketing mobile menu no longer stays stuck open on desktop and phone." },
      { type: "fixed", text: "Billing only offers upgrades you don’t already have, plus clearer cancel/portal copy." },
      { type: "added", text: "Home shows a short finish-setup checklist and a billing warning when payment fails." },
      { type: "fixed", text: "Switching panel tabs no longer briefly shows the previous page’s content." },
      { type: "changed", text: "Discord bot invite asks for specific permissions instead of full Administrator." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Faster site, clearer panel, quieter live map",
    changes: [
      { type: "added", text: "Marketing pages get a mobile menu, skip link, self-hosted fonts, and a proper share image." },
      { type: "changed", text: "The live map only polls player positions while a map tab is open, so idle panels use less RCON." },
      { type: "changed", text: "Kick and ban prompts in the panel use accessible dialogs with keyboard focus." },
      { type: "fixed", text: "Admin, signup, and setup pages tell search engines not to index them." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Ban honesty, plan gates, and smoother setup finish",
    changes: [
      { type: "fixed", text: "The Bans tab no longer reports a successful ban when the game server rejected the command." },
      { type: "changed", text: "Opening Bans loads your saved list immediately — sync from the game server is on demand via Sync." },
      { type: "fixed", text: "Canceled and past-due workspaces can no longer add new WebRCON servers." },
      { type: "fixed", text: "Finishing setup signs you into the panel reliably even if the app restarts mid-hop." },
      { type: "changed", text: "Privacy Policy notes that the marketing site uses Vercel Web Analytics." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Security hardening for multi-tenant panels",
    changes: [
      { type: "fixed", text: "Tenant data stores, scheduled commands, and live panel feeds stay isolated per workspace — no cross-server bleed." },
      { type: "fixed", text: "Public signup and staff tools harden session secrets, Discord game-admin checks, RCON argument safety, and Stripe webhook retries." },
      { type: "changed", text: "Past-due subscriptions no longer keep WebRCON attached until payment succeeds again." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Tighter signup, pricing, and docs copy",
    changes: [
      { type: "changed", text: "Signup, login, pricing, setup, docs, and contact drop leftover workspace jargon and repeated helper lines." },
      { type: "fixed", text: "Panel billing plan limits now match live plans — Pro 2 servers, Network up to 100." },
      { type: "changed", text: "Signup now says <code>Choose your plan</code>; demo links consistently say Preview the panel." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Signup always requires checkout",
    changes: [
      { type: "fixed", text: "Public signup no longer skips Stripe when an ops session cookie is present — checkout is required for every new account." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Tighter docs, changelog, and panel copy",
    changes: [
      { type: "changed", text: "Docs are a full setup and product guide with a sticky table of contents — from checkout and WebRCON through Discord channels, kits, staff keys, and wipe day." },
      { type: "changed", text: "Admin panel and sign-in match the sky-blue marketing theme." },
      { type: "changed", text: "Marketing site theme: graphite + sky-blue accents, sharper motion on load, hover, and scroll." },
      { type: "changed", text: "Changelog, FAQ, pricing, contact, and status each use a distinct layout instead of the same hero template." },
      { type: "changed", text: "Panel labels and fields drop the extra helper paragraphs — titles and placeholders stay." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Staff Discord commands and clearer kit locks",
    changes: [
      { type: "added", text: "New staff Discord commands: <code>/kit</code> (list, give, locks), <code>/player</code> (lookup, tp), and <code>/bans list</code> — with clear embeds." },
      { type: "changed", text: "<code>/rcon</code>, <code>/server</code>, <code>/players</code>, and <code>/automessage list</code> replies now use consistent Usely embeds." },
      { type: "changed", text: "Kit locks in the panel use a simple Start / End flow with duration presets instead of a confusing save toggle." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Kit claim phrases and wipe-day locks",
    changes: [
      { type: "added", text: "Panel kits can use a custom quick-chat claim phrase and an optional Discord role requirement." },
      { type: "added", text: "Kit locks pause claims for a saved list of kits with one on/off switch and an optional end time — useful for boom kits on wipe day." },
    ],
  },
  {
    date: "2026-08-02",
    title: "No more external website stats sync",
    changes: [
      { type: "changed", text: "Leaderboards and server status are no longer pushed to an external community website." },
      { type: "changed", text: "Panel and <code>/rcon pushstats</code> only refresh the Discord leaderboard image." },
      { type: "changed", text: "Channel settings no longer list leftover scrape or activity fields from other bots — only Usely Discord channels." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Full kit catalog in the demo",
    changes: [
      { type: "fixed", text: "The interactive demo’s kit builder now uses the full Rust Console Edition item catalog instead of four sample items." },
    ],
  },
  {
    date: "2026-08-02",
    title: "Clearer Discord link errors",
    changes: [
      { type: "fixed", text: "Linking a Discord server that’s already tied to another workspace now shows a clear message instead of a database error." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Public beta",
    changes: [
      { type: "added", text: "Site-wide beta notice with a direct <strong>Report a bug</strong> link to the contact form." },
      { type: "changed", text: "Contact and legal pages now use <code>support@inbound.usely.dev</code> so mail can be received through Resend and forwarded to the team." },
    ],
  },
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

function formatMonth(ym) {
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function renderEntry(entry) {
  return `        <article class="entry">
          <p class="entry-date"><time datetime="${entry.date}">${formatDate(entry.date)}</time></p>
          <div class="what">
            <h2 class="entry-title">${entry.title}</h2>
            <ul>
${entry.changes
  .map(
    (change) => `              <li><span class="tag ${change.type}">${
      TYPE_LABEL[change.type] ?? change.type
    }</span><span>${change.text}</span></li>`,
  )
  .join("\n")}
            </ul>
          </div>
        </article>`;
}

/** Month groups as a vertical timeline (not an accordion). */
export function renderEntries() {
  /** @type {Map<string, typeof entries>} */
  const byMonth = new Map();
  for (const entry of entries) {
    const ym = entry.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(entry);
  }

  return [...byMonth.entries()]
    .map(
      ([ym, list]) => `      <section class="month">
        <div class="month-label">${formatMonth(ym)}<span>${list.length} update${list.length === 1 ? "" : "s"}</span></div>
        <div class="month-entries">
${list.map(renderEntry).join("\n")}
        </div>
      </section>`,
    )
    .join("\n");
}
