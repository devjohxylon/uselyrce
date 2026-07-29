/**
 * FAQ content. Renders both the accordion markup and the FAQPage structured
 * data, so the two can't drift apart. `a` may contain inline HTML.
 */
export const groups = [
  {
    label: "Getting started",
    items: [
      {
        q: "What is Usely?",
        a: "Usely is a hosted admin panel and Discord bot for Rust Console Edition servers. You connect your server's WebRCON details once, then manage players, kits, bans, and broadcasts from your browser instead of typing raw console commands.",
      },
      {
        q: "How do I get set up?",
        a: "Pick a plan and pay. We email you a setup link where you choose your panel address, create a password, and enter your WebRCON host, port, and password. Once the connection is live, the panel starts showing your players.",
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
        a: "It runs the Discord side of your community: live population channels, kill feeds, and the other standard RCE bot tooling. It also lets your staff sign into the panel with Discord instead of a shared password.",
      },
      {
        q: "Can I give my moderators access without sharing my login?",
        a: "Yes. Staff sign in with Discord, and you map Discord roles to permissions — so a role can be allowed to kick and ban but blocked from RCON or billing. You keep the owner account to yourself.",
      },
      {
        q: "Can I manage more than one server?",
        a: "Pro supports two connected servers and Network supports more. Each server is a separate WebRCON connection, and you switch which one you're managing from the panel header.",
      },
    ],
  },
  {
    label: "Accounts and billing",
    items: [
      {
        q: "What is my panel address?",
        a: "Every workspace gets its own subdomain, like <code>astral.usely.dev</code>, which you choose during setup. That address is where you and your staff sign in.",
      },
      {
        q: "Why do owners use email and staff use Discord?",
        a: "The owner account controls billing and server credentials, so it isn't tied to a Discord account that could be lost or compromised. Staff access is meant to be quick to grant and revoke, which is exactly what Discord roles are good at.",
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
  let first = true;
  return groups
    .map((group) => {
      const items = group.items
        .map((item) => {
          const open = first ? " open" : "";
          first = false;
          return `        <details${open}>
          <summary>${item.q}</summary>
          <p>${item.a}</p>
        </details>`;
        })
        .join("\n\n");

      return `      <div class="faq-group">
        <p class="label">${group.label}</p>

${items}
      </div>`;
    })
    .join("\n\n");
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
