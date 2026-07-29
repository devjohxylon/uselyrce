import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "./changelog.js";
import { applyShell } from "./shell.js";
import { attachContactRoute } from "./contact-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => readFileSync(path.join(__dirname, file), "utf8");
const page = (file) => applyShell(read(file));

const HOME = page("home.html");
const CHANGELOG = page("changelog.html").replace("<!--ENTRIES-->", renderEntries());
const PAGES = {
  "/pricing": page("pricing.html"),
  "/docs": page("docs.html"),
  "/faq": page("faq.html"),
  "/contact": page("contact.html"),
  "/terms": page("terms.html"),
  "/privacy": page("privacy.html"),
};
const STYLES = { "/site.css": read("site.css"), "/legal.css": read("legal.css") };

export function attachMarketingSite(app) {
  app.get("/", (req, res) => {
    // Org subdomains skip marketing and go straight to their panel.
    if (req.orgFromHost) return res.redirect(302, "/admin");
    res.type("html").send(HOME);
  });

  for (const [route, css] of Object.entries(STYLES)) {
    app.get(route, (_req, res) => res.type("css").send(css));
  }

  for (const [route, html] of Object.entries(PAGES)) {
    app.get(route, (_req, res) => res.type("html").send(html));
  }

  app.get("/changelog", (_req, res) => res.type("html").send(CHANGELOG));
  app.get("/home", (_req, res) => res.redirect(302, "/"));

  attachContactRoute(app);
}
