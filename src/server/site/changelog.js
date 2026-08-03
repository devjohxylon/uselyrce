/**
 * Single source of truth for the public changelog.
 *
 * Keep this short: major capabilities and real bug fixes only.
 * Skip copy polish, design tweaks, ops tooling, and “we renamed a label” noise.
 * Both the Vercel build and the Express route render from here.
 */
export const entries = [
  {
    date: "2026-08-02",
    title: "Billing and ban fixes",
    changes: [
      { type: "fixed", text: "The Bans tab no longer reports success when the game server rejected the ban." },
      { type: "fixed", text: "Canceled and past-due plans can no longer add WebRCON servers or stay connected." },
      { type: "fixed", text: "Public signup always requires Stripe checkout — no accidental free workspaces." },
      { type: "changed", text: "Network plan is for networks of 4+, capped at 20 connected servers." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Kits, wipe countdown, and status",
    changes: [
      { type: "added", text: "Kit claim phrases, optional Discord role gates, and wipe-day kit locks." },
      { type: "added", text: "Staff Discord commands for kits, player lookup/TP, and ban list." },
      { type: "added", text: "Wipe countdown posts at 24 hours, 1 hour, and wipe time in Discord." },
      { type: "added", text: "Status page for panel, Discord, and WebRCON — plus alerts when WebRCON drops." },
      { type: "added", text: "Staff access key presets (Helper, Moderator, Admin) with click-to-toggle permissions." },
    ],
  },
  {
    date: "2026-08-01",
    title: "Workspace isolation and safer setup",
    changes: [
      { type: "fixed", text: "Each workspace’s kits, bans, wipe time, and Discord feeds stay isolated — no cross-customer bleed." },
      { type: "fixed", text: "Checkout retries no longer create duplicate workspaces for the same subscription." },
      { type: "fixed", text: "WebRCON reconnect keeps the saved password after a drop." },
      { type: "changed", text: "Setup tests your WebRCON connection before saving, and rejects private/local hosts." },
      { type: "added", text: "Owner password reset from the panel login screen." },
    ],
  },
  {
    date: "2026-07-29",
    title: "Usely launch",
    changes: [
      { type: "added", text: "Multi-tenant workspaces with your own <code>*.usely.dev</code> panel address." },
      { type: "added", text: "Owner email login, staff Discord login, and staff access keys." },
      { type: "added", text: "Stripe billing — Basic, Pro, and Network — with buy-first setup by email." },
      { type: "added", text: "Admin panel: live map, kits, players, bans, wipe tools, Discord feeds, and invite-the-bot from Servers." },
      { type: "added", text: "Interactive demo at <code>app.usely.dev/demo</code> so you can click through before paying." },
      { type: "added", text: "Docs, FAQ, contact, status, Terms, and Privacy." },
    ],
  },
  {
    date: "2026-07-26",
    title: "Kit builder and Console bans",
    changes: [
      { type: "added", text: "Kit builder with Rust Console Edition items and images." },
      { type: "fixed", text: "Ban lists parse Console gamertags so prior bans show up and stay in sync." },
      { type: "changed", text: "Server credentials are encrypted before storage; staff permissions are enforced on every command." },
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
