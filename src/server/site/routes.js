import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "./changelog.js";
import { renderFaq } from "./faq.js";
import { applyShell, PAGES, renderRobots, renderSitemap } from "./shell.js";
import { attachContactRoute } from "./contact-api.js";
import { attachStatusRoute } from "./status-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(path.join(__dirname, file), "utf8");

/** Placeholders resolved once at boot — the pages are static after that. */
function render(file) {
  return applyShell(read(file))
    .replace("<!--ENTRIES-->", () => renderEntries())
    .replace("<!--FAQ-->", () => renderFaq());
}

const HOME = render(PAGES.home.file);
const HTML = new Map(
  Object.values(PAGES)
    .filter((meta) => meta.path !== "/")
    .map((meta) => [meta.path, render(meta.file)]),
);
const CSS = new Map([
  ["/site.css", read("site.css")],
  ["/legal.css", read("legal.css")],
]);

export function attachMarketingSite(app, client) {
  app.get("/", (req, res) => {
    // Org subdomains skip marketing and go straight to their panel.
    if (req.orgFromHost) return res.redirect(302, "/admin");
    res.type("html").send(HOME);
  });

  for (const [route, css] of CSS) {
    app.get(route, (_req, res) => res.type("css").send(css));
  }

  for (const [route, html] of HTML) {
    app.get(route, (_req, res) => res.type("html").send(html));
  }

  app.get("/sitemap.xml", (_req, res) => res.type("application/xml").send(renderSitemap()));
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send(renderRobots()));

  app.get("/home", (_req, res) => res.redirect(302, "/"));

  attachContactRoute(app);
  attachStatusRoute(app, client);
}
