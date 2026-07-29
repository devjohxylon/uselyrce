/**
 * Builds the static marketing site for Vercel into public/.
 * The app itself (panel, bot, RCON, signup APIs) runs on Railway —
 * vercel.json redirects /signup, /setup, and /admin there.
 */
import { cpSync, mkdirSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public");
const site = path.join(root, "src", "server", "site");
const assets = path.join(root, "assets");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(path.join(site, "home.html"), path.join(out, "index.html"));
cpSync(path.join(site, "pricing.html"), path.join(out, "pricing.html"));
cpSync(path.join(assets, "usely-mark.svg"), path.join(out, "logo.svg"));
cpSync(path.join(assets, "usely-logo.png"), path.join(out, "logo.png"));
cpSync(path.join(assets, "usely-logo.png"), path.join(out, "favicon.ico"));

console.log("Marketing site built to public/");
