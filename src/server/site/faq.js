/**
 * FAQ content. Renders both the accordion markup and the FAQPage structured
 * data, so the two can't drift apart. `a` may contain inline HTML.
 */
export const groups = [
  {
    id: "getting-started",
    label: "Getting started",
    items: [
      {
        q: "What is Usely?",
        a: "Usely is a hosted admin panel and Discord bot for Rust Console Edition servers. You connect your server's WebRCON details once, then manage players, kits, bans, and broadcasts from your browser instead of typing raw console commands.",
      },
      {
        q: "Is Usely in beta?",
        a: "Yes — public beta. New features ship often, and the occasional rough edge is expected. If something breaks, <a href=\"/contact?topic=bug\">report a bug</a> with your panel address and what you were doing.",
      },
      {
        q: "How do I get set up?",
        a: "Pick a plan and pay. We email you a setup link where you choose your panel address, create a password, invite the Discord bot, and enter your WebRCON host, port, and password. Once the connection is live, the panel starts showing your players.",
      },
      {
        q: "What do I need from my host?",
        a: "Your server's WebRCON IP, port, and password. Any host that exposes WebRCON for Rust Console Edition works — we connect over the same interface the game console uses.",
      },
      {
        q: "Do I need to install anything on my server?",
        a: "No. There are no plugins, mods, or files to upload. Usely connects to your existing WebRCON endpoint from our side, so nothing changes on the server itself.",
      },
    ],
  },
  {
    id: "using-the-panel",
    label: "Using the panel",
    items: [
      {
        q: "What can I do from the panel?",
        a: "See who is online, kick and ban players, review your ban list, send server broadcasts, check which players have linked Discord accounts, build kits, and run any RCON command directly.",
      },
      {
        q: "How does the kit builder work?",
        a: "Select items from the Rust Console item list to assemble a kit, then save it. Players claim kits in-game through the quick chat phrases you configure in the panel — you never edit JSON by hand.",
      },
      {
        q: "What does the Discord bot do?",
        a: "It runs the Discord side of your community: live population channels, kill feeds, VIP tools, and slash commands. Panel staff access is separate — that uses access keys from your workspace.",
      },
      {
        q: "Can I give my moderators access without sharing my login?",
        a: "Yes. From <strong>Workspace → Staff keys</strong>, create a key with the permissions you want and send it to them. They sign in on your panel URL with that key. Revoke the key anytime. Billing and key management stay on the owner account.",
      },
      {
        q: "Can I manage more than one server?",
        a: "Pro supports two connected servers and Network supports more. Each server is a separate WebRCON connection, and you switch which one you're managing from the panel header.",
      },
    ],
  },
  {
    id: "accounts-billing",
    label: "Accounts and billing",
    items: [
      {
        q: "What is my panel address?",
        a: "Every workspace gets its own subdomain, like <code>myserver.usely.dev</code>, which you choose during setup. That address is where you and your staff sign in.",
      },
      {
        q: "Why do owners use email and staff use keys?",
        a: "The owner account controls billing and server credentials. Staff get their own access keys with limited permissions — quick to create, easy to revoke, and never tied to Discord roles.",
      },
      {
        q: "Can I change plans or cancel?",
        a: "Yes. Plans are monthly with no contract — upgrade, downgrade, or cancel whenever you want. If you downgrade below your current server count, disconnect the extra servers first.",
      },
      {
        q: "Is my RCON password safe?",
        a: "Server credentials are encrypted before they're stored, and each workspace's data is isolated from every other workspace. Only your own account and the staff you authorize can reach your servers.",
      },
    ],
  },
];

export function renderFaq() {
  const nav = groups
    .map((g) => `        <a href="#${g.id}">${g.label}</a>`)
    .join("\n");

  let n = 0;
  const body = groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          n += 1;
          const num = String(n).padStart(2, "0");
          return `        <details class="faq-card">
          <summary><span class="faq-num">${num}</span><span class="faq-q">${item.q}</span></summary>
          <div class="faq-a"><p>${item.a}</p></div>
        </details>`;
        })
        .join("\n");

      return `      <section class="faq-section" id="${group.id}">
        <h2>${group.label}</h2>
${items}
      </section>`;
    })
    .join("\n\n");

  return `      <nav class="faq-nav" aria-label="FAQ topics">
        <p class="label">Topics</p>
${nav}
      </nav>
      <div class="faq-main" data-acc>
${body}
      </div>`;
}

/** Google's FAQPage rich result. Tags are stripped from answers. */
export function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a.replace(/<[^>]+>/g, ""),
        },
      })),
    ),
  });
}
