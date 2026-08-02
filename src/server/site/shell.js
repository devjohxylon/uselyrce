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
    "@type": "Offer",
    price: "20.00",
    priceCurrency: "USD",
    url: `${SITE_URL}/pricing`,
  },
});

function renderHead(key) {
  const meta = PAGES[key];
  if (!meta) throw new Error(`Unknown page key in <!--HEAD:${key}-->`);

  const canonical = `${SITE_URL}${meta.path}`;
  const image = `${SITE_URL}/logo.png`;
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
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeAttr(meta.title)}" />
  <meta name="twitter:description" content="${escapeAttr(meta.description)}" />
  <meta name="twitter:image" content="${image}" />
  <link rel="icon" href="/logo.png" type="image/png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/site.css" />${
    meta.extraCss ? `\n  <link rel="stylesheet" href="${meta.extraCss}" />` : ""
  }${jsonLd.map((data) => `\n  <script type="application/ld+json">${data}</script>`).join("")}`;
}

function renderNav(active) {
  const links = NAV_LINKS.map(
    ([href, label, key]) =>
      `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("\n        ");

  return `    <p class="beta-bar" role="status">
      <span><strong>Beta</strong> Usely is early — features ship fast and things may change.</span>
      <a href="/contact?topic=bug">Report a bug</a>
    </p>
    <header class="nav">
      <a class="brand" href="/"><img src="/logo.png" alt="" />USELY</a>
      <nav class="nav-links">
        ${links}
        <a class="btn btn-ghost" href="/admin">Sign in</a>
        <a class="btn btn-primary" href="/signup">Get started</a>
      </nav>
    </header>`;
}

function renderFooter() {
  const groups = FOOTER_GROUPS.map(
    ([title, links]) => `        <div class="foot-group">
          <h2>${title}</h2>
${links.map(([href, label]) => `          <a href="${href}">${label}</a>`).join("\n")}
        </div>`,
  ).join("\n");

  return `    <footer>
      <div class="foot-cols">
        <div class="foot-brand">
          <a class="brand" href="/"><img src="/logo.png" alt="" />USELY</a>
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
    .replace(/<\/body>/i, `${renderAccScript()}\n${renderRevealScript()}\n${renderAnalytics()}\n</body>`);
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

export function renderRobots() {
  return `User-agent: *
Allow: /

# The app itself is per-customer and has nothing to index.
Disallow: /admin
Disallow: /signup
Disallow: /setup
Disallow: /demo
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
Host: ${SITE_URL.replace("https://", "")}
`;
}

export { APP_URL };
