import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "./changelog.js";
import { attachContactRoute } from "./contact-api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = (file) => readFileSync(path.join(__dirname, file), "utf8");

const HOME = page("home.html");
const PRICING = page("pricing.html");
const FAQ = page("faq.html");
const CONTACT = page("contact.html");
const CHANGELOG = page("changelog.html").replace("<!--ENTRIES-->", renderEntries());
const SITE_CSS = page("site.css");

export function attachMarketingSite(app) {
  app.get("/", (req, res) => {
    // Org subdomains skip marketing and go straight to their panel.
    if (req.orgFromHost) return res.redirect(302, "/admin");
    res.type("html").send(HOME);
  });

  app.get("/site.css", (_req, res) => {
    res.type("css").send(SITE_CSS);
  });

  app.get("/pricing", (_req, res) => res.type("html").send(PRICING));
  app.get("/faq", (_req, res) => res.type("html").send(FAQ));
  app.get("/contact", (_req, res) => res.type("html").send(CONTACT));
  app.get("/changelog", (_req, res) => res.type("html").send(CHANGELOG));

  app.get("/home", (_req, res) => res.redirect(302, "/"));

  attachContactRoute(app);
}
