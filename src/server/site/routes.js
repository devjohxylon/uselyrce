import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = readFileSync(path.join(__dirname, "home.html"), "utf8");
const PRICING = readFileSync(path.join(__dirname, "pricing.html"), "utf8");

export function attachMarketingSite(app) {
  app.get("/", (req, res) => {
    // Org subdomains skip marketing and go straight to their panel.
    if (req.orgFromHost) return res.redirect(302, "/admin");
    res.type("html").send(HOME);
  });

  app.get("/pricing", (_req, res) => {
    res.type("html").send(PRICING);
  });

  app.get("/home", (_req, res) => res.redirect(302, "/"));
}
