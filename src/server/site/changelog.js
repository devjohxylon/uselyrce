/**
 * Single source of truth for the public changelog.
 *
 * Add a new object to the TOP of `entries` when shipping user-visible changes.
 * `text` may contain inline HTML (e.g. <code>) — it is authored, not user input.
 * Both the Vercel build and the Express route render from here.
 */
export const entries = [
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
