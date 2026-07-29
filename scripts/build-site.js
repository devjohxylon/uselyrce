/**
 * Builds the static marketing site for Vercel into public/.
 * The app itself (panel, bot, RCON, signup and contact APIs) runs on Railway —
 * vercel.json redirects /signup, /setup, /admin, and /api there.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "../src/server/site/changelog.js";
import { applyShell } from "../src/server/site/shell.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public");
const site = path.join(root, "src", "server", "site");
const assets = path.join(root, "assets");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const read = (file) => readFileSync(path.join(site, file), "utf8");
const write = (file, contents) => writeFileSync(path.join(out, file), contents);

const pages = {
  "index.html": "home.html",
  "pricing.html": "pricing.html",
  "docs.html": "docs.html",
  "faq.html": "faq.html",
  "contact.html": "contact.html",
  "changelog.html": "changelog.html",
  "terms.html": "terms.html",
  "privacy.html": "privacy.html",
};

for (const [target, source] of Object.entries(pages)) {
  write(
    target,
    applyShell(read(source)).replace("<!--ENTRIES-->", () => renderEntries()),
  );
}

write("site.css", read("site.css"));
write("legal.css", read("legal.css"));

cpSync(path.join(assets, "usely-logo.png"), path.join(out, "logo.png"));
cpSync(path.join(assets, "usely-logo.png"), path.join(out, "favicon.ico"));

console.log(`Marketing site built to public/ (${Object.keys(pages).length} pages)`);
