/**
 * Builds the static marketing site for Vercel into public/.
 * The app itself (panel, bot, RCON, signup and contact APIs) runs on Railway —
 * vercel.json redirects /signup, /setup, /admin, and /api there.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "../src/server/site/changelog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public");
const site = path.join(root, "src", "server", "site");
const assets = path.join(root, "assets");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copy = (from, to) => cpSync(path.join(site, from), path.join(out, to));

copy("home.html", "index.html");
copy("pricing.html", "pricing.html");
copy("faq.html", "faq.html");
copy("contact.html", "contact.html");
copy("site.css", "site.css");

writeFileSync(
  path.join(out, "changelog.html"),
  readFileSync(path.join(site, "changelog.html"), "utf8").replace(
    "<!--ENTRIES-->",
    renderEntries(),
  ),
);

cpSync(path.join(assets, "usely-logo.png"), path.join(out, "logo.png"));
cpSync(path.join(assets, "usely-logo.png"), path.join(out, "favicon.ico"));

console.log("Marketing site built to public/");
