/**
 * Shared <head>, nav, and footer for the marketing pages.
 *
 * Pages drop `<!--HEAD:key-->`, `<!--NAV:key-->`, and `<!--FOOTER-->` where the
 * chrome belongs; both the Vercel build and the Express route run them through
 * applyShell(). Page metadata lives here so titles, descriptions, canonicals,
 * and the sitemap all come from one place.
 */
import { faqJsonLd } from "./faq.js";

export const SITE_URL = "https://www.usely.dev";
const APP_URL = "https://app.usely.dev";

/**
 * `changefreq`/`priority` feed the sitemap. `nav` is the highlighted nav key.
 * Pages with `index: false` stay out of the sitemap.
 */
export const PAGES = {
  home: {
    path: "/",
    file: "home.html",
    out: "index.html",
    title: "Usely — Rust Console admin panel and Discord bot",
    description:
      "Usely is a hosted admin panel and Discord bot for Rust Console Edition. Manage players, kits, bans, and RCON from your browser. Plans from $20/month.",
    priority: "1.0",
    changefreq: "weekly",
  },
  pricing: {
    path: "/pricing",
    file: "pricing.html",
    out: "pricing.html",
    title: "Pricing — Usely",
    description:
      "Usely pricing: $20/month for one Rust Console server, $49 for two, $99 for more. Every plan includes the admin panel and Discord bot.",
    nav: "pricing",
    priority: "0.9",
    changefreq: "monthly",
  },
  docs: {
    path: "/docs",
    file: "docs.html",
    out: "docs.html",
    title: "Docs — Usely",
    description:
      "How to set up Usely in detail: checkout, setup, WebRCON, Discord channels and feeds, kits, staff keys, wipe day, and billing.",
    nav: "docs",
    priority: "0.8",
    changefreq: "monthly",
  },
  faq: {
    path: "/faq",
    file: "faq.html",
    out: "faq.html",
    title: "FAQ — Usely",
    description:
      "Answers to common Usely questions about setup, WebRCON, Discord staff access, kits, billing, and multi-server support.",
    nav: "faq",
    priority: "0.7",
    changefreq: "monthly",
    jsonLd: faqJsonLd,
  },
  changelog: {
    path: "/changelog",
    file: "changelog.html",
    out: "changelog.html",
    title: "Changelog — Usely",
    description:
      "What's new in Usely — every user-visible change to the Rust Console admin panel, the Discord bot, and this site.",
    priority: "0.6",
    changefreq: "weekly",
  },
  status: {
    path: "/status",
    file: "status.html",
    out: "status.html",
    title: "Status — Usely",
    description: "Live availability of the Usely admin panel, Discord bot, and RCON connections.",
    priority: "0.4",
    changefreq: "always",
  },
  contact: {
    path: "/contact",
    file: "contact.html",
    out: "contact.html",
    title: "Contact — Usely",
    description:
      "Get in touch with the Usely team about setup, WebRCON, billing, or whether Usely fits your Rust Console community.",
    priority: "0.5",
    changefreq: "yearly",
  },
  terms: {
    path: "/terms",
    file: "terms.html",
    out: "terms.html",
    title: "Terms of Service — Usely",
    description: "The terms that govern your use of Usely.",
    extraCss: "/legal.css",
    priority: "0.3",
    changefreq: "yearly",
  },
  privacy: {
    path: "/privacy",
    file: "privacy.html",
    out: "privacy.html",
    title: "Privacy Policy — Usely",
    description: "What data Usely collects, why, who processes it, and how to have it deleted.",
    extraCss: "/legal.css",
    priority: "0.3",
    changefreq: "yearly",
  },
};

const NAV_LINKS = [
  ["/pricing", "Pricing", "pricing"],
  ["/docs", "Docs", "docs"],
  ["/faq", "FAQ", "faq"],
];

const FOOTER_GROUPS = [
  ["Product", [["/pricing", "Pricing"], ["/docs", "Docs"], ["/changelog", "Changelog"]]],
  ["Support", [["/faq", "FAQ"], ["/contact", "Contact"], ["/status", "Status"], ["/admin", "Sign in"], [`${APP_URL}/demo`, "Preview the panel"]]],
  ["Legal", [["/terms", "Terms"], ["/privacy", "Privacy"]]],
];

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const ORG_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Usely",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description:
    "Hosted admin panel and Discord bot for Rust Console Edition servers, with player management, a kit builder, and WebRCON access.",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "20.00",
    highPrice: "99.00",
    priceCurrency: "USD",
    offerCount: 3,
    url: `${SITE_URL}/pricing`,
    offers: [
      { "@type": "Offer", name: "Basic", price: "20.00", priceCurrency: "USD", url: `${SITE_URL}/signup?plan=basic` },
      { "@type": "Offer", name: "Pro", price: "49.00", priceCurrency: "USD", url: `${SITE_URL}/signup?plan=pro` },
      { "@type": "Offer", name: "Network", price: "99.00", priceCurrency: "USD", url: `${SITE_URL}/signup?plan=network` },
    ],
  },
});

function renderHead(key) {
  const meta = PAGES[key];
  if (!meta) throw new Error(`Unknown page key in <!--HEAD:${key}-->`);

  const canonical = `${SITE_URL}${meta.path}`;
  const image = `${SITE_URL}/og.png`;
  const jsonLd = [key === "home" ? ORG_JSON_LD : null, meta.jsonLd?.()].filter(Boolean);

  return `  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${meta.title}</title>
  <meta name="description" content="${escapeAttr(meta.description)}" />
  <link rel="canonical" href="${canonical}" />
  <meta name="theme-color" content="#070809" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Usely" />
  <meta property="og:title" content="${escapeAttr(meta.title)}" />
  <meta property="og:description" content="${escapeAttr(meta.description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(meta.title)}" />
  <meta name="twitter:description" content="${escapeAttr(meta.description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="icon" href="/logo.png" type="image/png" />
  <link rel="stylesheet" href="/site.css" />${
    meta.extraCss ? `\n  <link rel="stylesheet" href="${meta.extraCss}" />` : ""
  }${jsonLd.map((data) => `\n  <script type="application/ld+json">${data}</script>`).join("")}`;
}

function renderNav(active) {
  const links = NAV_LINKS.map(
    ([href, label, key]) =>
      `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("\n        ");

  const drawerLinks = [
    ...NAV_LINKS.map(([href, label, key]) => [href, label, key]),
    ["/contact", "Contact", "contact"],
    ["/admin", "Sign in", null],
    ["/signup", "Get started", null],
  ]
    .map(
      ([href, label, key]) =>
        `<a href="${href}"${key === active ? ' aria-current="page"' : ""}${label === "Get started" ? ' class="btn btn-primary"' : ""}>${label}</a>`,
    )
    .join("\n      ");

  return `    <a class="skip-link" href="#main">Skip to content</a>
    <p class="beta-bar" role="status">
      <span><strong>Beta</strong> Usely is early — features ship fast and things may change.</span>
      <a href="/contact?topic=bug">Report a bug</a>
    </p>
    <header class="nav">
      <a class="brand" href="/"><img src="/logo.png" alt="" width="24" height="24" />USELY</a>
      <nav class="nav-links" aria-label="Primary">
        ${links}
        <a class="btn btn-ghost" href="/admin">Sign in</a>
        <a class="btn btn-primary" href="/signup">Get started</a>
      </nav>
      <button type="button" class="nav-menu-btn" id="navMenuBtn" aria-expanded="false" aria-controls="navDrawer" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </header>
    <div class="nav-drawer-backdrop" id="navDrawerBackdrop" hidden></div>
    <nav class="nav-drawer" id="navDrawer" aria-label="Mobile" hidden>
      <button type="button" class="nav-drawer-close" id="navDrawerClose" aria-label="Close menu">&times;</button>
      ${drawerLinks}
    </nav>
    <main id="main">`;
}

function renderFooter() {
  const groups = FOOTER_GROUPS.map(
    ([title, links]) => `        <div class="foot-group">
          <p class="foot-heading">${title}</p>
${links.map(([href, label]) => `          <a href="${href}">${label}</a>`).join("\n")}
        </div>`,
  ).join("\n");

  return `    </main>
    <footer>
      <div class="foot-cols">
        <div class="foot-brand">
          <a class="brand" href="/"><img src="/logo.png" alt="" width="24" height="24" />USELY</a>
          <p>Admin panel and Discord bot for Rust Console Edition servers.</p>
        </div>
${groups}
      </div>
      <div class="foot-bar">
        <span>&copy; ${new Date().getFullYear()} Usely · Beta</span>
        <span>Not affiliated with Facepunch Studios or Double Eleven.</span>
      </div>
    </footer>`;
}

function renderNavMenuScript() {
  return `  <script>
    (function () {
      var btn = document.getElementById("navMenuBtn");
      var drawer = document.getElementById("navDrawer");
      var backdrop = document.getElementById("navDrawerBackdrop");
      var closeBtn = document.getElementById("navDrawerClose");
      if (!btn || !drawer || !backdrop) return;
      var lastFocus = null;
      function setOpen(open) {
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        drawer.hidden = !open;
        backdrop.hidden = !open;
        document.body.classList.toggle("nav-open", open);
        if (open) {
          lastFocus = document.activeElement;
          var first = drawer.querySelector("a");
          if (first) first.focus();
        } else if (lastFocus) {
          lastFocus.focus();
        }
      }
      btn.addEventListener("click", function () {
        setOpen(btn.getAttribute("aria-expanded") !== "true");
      });
      closeBtn?.addEventListener("click", function () { setOpen(false); });
      backdrop.addEventListener("click", function () { setOpen(false); });
      drawer.addEventListener("click", function (e) {
        if (e.target.closest("a")) setOpen(false);
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
          e.preventDefault();
          setOpen(false);
        }
      });
    })();
  </script>`;
}

/** Exclusive accordion: opening one <details> inside [data-acc] closes siblings. */
function renderAccScript() {
  return `  <script>
    document.querySelectorAll("[data-acc]").forEach(function (root) {
      root.addEventListener("toggle", function (e) {
        var d = e.target;
        if (!(d instanceof HTMLDetailsElement) || !d.open) return;
        root.querySelectorAll("details[open]").forEach(function (other) {
          if (other !== d) other.open = false;
        });
      }, true);
    });
  </script>`;
}

/** Scroll reveals for [data-reveal] blocks. */
function renderRevealScript() {
  return `  <script>
    (function () {
      var nodes = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
      if (!nodes.length) return;
      if (!("IntersectionObserver" in window)) {
        nodes.forEach(function (n) { n.classList.add("is-in"); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      nodes.forEach(function (n) { io.observe(n); });
    })();
  </script>`;
}

/** Vercel Web Analytics — only loads on www (script is served after Analytics is enabled). */
function renderAnalytics() {
  return `  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>`;
}

export function applyShell(html) {
  return html
    .replace(/^[ \t]*<!--HEAD:([a-z]+)-->/m, (_m, key) => renderHead(key))
    .replace(/^[ \t]*<!--NAV:([a-z]*)-->/m, (_m, active) => renderNav(active))
    .replace(/^[ \t]*<!--FOOTER-->/m, renderFooter())
    .replace(
      /<\/body>/i,
      `${renderNavMenuScript()}\n${renderAccScript()}\n${renderRevealScript()}\n${renderAnalytics()}\n</body>`,
    );
}

export function renderSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.values(PAGES)
    .filter((meta) => meta.index !== false)
    .map(
      (meta) => `  <url>
    <loc>${SITE_URL}${meta.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${meta.changefreq}</changefreq>
    <priority>${meta.priority}</priority>
  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/** Marketing host (www) robots — allow public pages, block app paths. */
export function renderRobots() {
  return `User-agent: *
Allow: /

Disallow: /admin
Disallow: /signup
Disallow: /setup
Disallow: /demo
Disallow: /api/
Disallow: /ops

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/** App host robots — nothing customer-facing should be indexed. */
export function renderAppRobots() {
  return `User-agent: *
Disallow: /
`;
}

export { APP_URL };
