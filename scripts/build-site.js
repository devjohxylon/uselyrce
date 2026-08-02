/**
 * Builds the static marketing site for Vercel into public/.
 * The app itself (panel, bot, RCON, signup/contact/status APIs) runs on Railway —
 * vercel.json redirects /signup, /setup, /admin, and /api there.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderEntries } from "../src/server/site/changelog.js";
import { renderFaq } from "../src/server/site/faq.js";
import { applyShell, PAGES, renderRobots, renderSitemap } from "../src/server/site/shell.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public");
const site = path.join(root, "src", "server", "site");
const assets = path.join(root, "assets");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const read = (file) => readFileSync(path.join(site, file), "utf8");
const write = (file, contents) => writeFileSync(path.join(out, file), contents);

for (const meta of Object.values(PAGES)) {
  write(
    meta.out,
    applyShell(read(meta.file))
      .replace("<!--ENTRIES-->", () => renderEntries())
      .replace("<!--FAQ-->", () => renderFaq()),
  );
}

write("site.css", read("site.css"));
write("legal.css", read("legal.css"));
write("sitemap.xml", renderSitemap());
write("robots.txt", renderRobots());

cpSync(path.join(assets, "usely-logo.png"), path.join(out, "logo.png"));
cpSync(path.join(assets, "usely-logo.png"), path.join(out, "favicon.ico"));
cpSync(path.join(assets, "og.png"), path.join(out, "og.png"));
cpSync(path.join(assets, "fonts"), path.join(out, "fonts"), { recursive: true });

console.log(`Marketing site built to public/ (${Object.keys(PAGES).length} pages)`);
