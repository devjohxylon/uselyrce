/**
 * Shared nav + footer for the marketing pages.
 *
 * Pages drop `<!--NAV:key-->` and `<!--FOOTER-->` where the chrome belongs;
 * both the Vercel build and the Express route run them through applyShell().
 */
const NAV_LINKS = [
  ["/pricing", "Pricing", "pricing"],
  ["/docs", "Docs", "docs"],
  ["/faq", "FAQ", "faq"],
];

const FOOTER_GROUPS = [
  ["Product", [["/pricing", "Pricing"], ["/docs", "Docs"], ["/changelog", "Changelog"]]],
  ["Support", [["/faq", "FAQ"], ["/contact", "Contact"], ["/admin", "Sign in"]]],
  ["Legal", [["/terms", "Terms"], ["/privacy", "Privacy"]]],
];

function renderNav(active) {
  const links = NAV_LINKS.map(
    ([href, label, key]) =>
      `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`,
  ).join("\n        ");

  return `    <header class="nav">
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
        <span>&copy; ${new Date().getFullYear()} Usely</span>
        <span>Not affiliated with Facepunch Studios or Double Eleven.</span>
      </div>
    </footer>`;
}

export function applyShell(html) {
  return html
    .replace(/^[ \t]*<!--NAV:([a-z]*)-->/m, (_match, active) => renderNav(active))
    .replace(/^[ \t]*<!--FOOTER-->/m, renderFooter());
}
