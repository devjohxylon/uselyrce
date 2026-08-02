import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "./changelog.js";
import { renderFaq } from "./faq.js";
import {
  applyShell,
  PAGES,
  renderAppRobots,
  renderRobots,
  renderSitemap,
} from "./shell.js";
import { attachContactRoute } from "./contact-api.js";
import { attachStatusRoute } from "./status-api.js";
import { baseDomain } from "../../saas/tenancy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "../../../");
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

function isMarketingHost(host) {
  const h = String(host || "").split(":")[0].toLowerCase();
  const base = baseDomain();
  return (
    h === "www.usely.dev" ||
    h === "usely.dev" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    (base && (h === base || h === `www.${base}`))
  );
}

export function attachMarketingSite(app, client) {
  app.get("/", (req, res) => {
    // Org subdomains skip marketing and go straight to their panel.
    if (req.orgFromHost) return res.redirect(302, "/admin");
    res.type("html").send(HOME);
  });

  for (const [route, css] of CSS) {
    app.get(route, (_req, res) => res.type("css").send(css));
  }

  app.get("/fonts/:file", (req, res) => {
    const file = String(req.params.file || "").replace(/[^a-zA-Z0-9._-]/g, "");
    if (!file) return res.status(404).end();
    res.type(file.endsWith(".ttf") ? "font/ttf" : "application/octet-stream");
    res.sendFile(path.join(SITE_ROOT, "assets", "fonts", file), (err) => {
      if (err) res.status(404).end();
    });
  });

  app.get("/og.png", (_req, res) => {
    res.type("png").sendFile(path.join(SITE_ROOT, "assets", "og.png"), (err) => {
      if (err) res.status(404).end();
    });
  });

  for (const [route, html] of HTML) {
    app.get(route, (_req, res) => res.type("html").send(html));
  }

  app.get("/sitemap.xml", (req, res) => {
    if (!isMarketingHost(req.headers.host) && req.orgFromHost) {
      return res.status(404).end();
    }
    res.type("application/xml").send(renderSitemap());
  });
  app.get("/robots.txt", (req, res) => {
    const body =
      isMarketingHost(req.headers.host) && !req.orgFromHost
        ? renderRobots()
        : renderAppRobots();
    res.type("text/plain").send(body);
  });

  app.get("/home", (_req, res) => res.redirect(302, "/"));

  attachContactRoute(app);
  attachStatusRoute(app, client);
}
