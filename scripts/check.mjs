/**
 * Syntax-check entrypoints and critical modules (no network, no env required).
 */
import { spawnSync } from "child_process";
import { readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENTRYPOINTS = [
  "src/index.js",
  "src/bot.js",
  "src/server/webhook.js",
  "src/observability/sentry.js",
  "src/saas/billing/plans.js",
  "src/saas/signup/routes.js",
  "src/saas/db/accounts.js",
  "src/server/admin/api.js",
  "src/server/site/shell.js",
  "src/server/site/changelog.js",
  "scripts/build-site.js",
];

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "public" || name === ".data") continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkJs(full, out);
    else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

let failed = 0;
for (const rel of ENTRYPOINTS) {
  const file = path.join(root, rel);
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAIL ${rel}`);
    if (r.stderr) console.error(r.stderr.trim());
  } else {
    console.log(`ok   ${rel}`);
  }
}

// Spot-check a broader set so new modules don't ship with syntax errors unnoticed.
const extras = walkJs(path.join(root, "src"))
  .map((f) => path.relative(root, f).replace(/\\/g, "/"))
  .filter((rel) => !ENTRYPOINTS.includes(rel))
  .slice(0, 80);

for (const rel of extras) {
  const r = spawnSync(process.execPath, ["--check", path.join(root, rel)], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`FAIL ${rel}`);
    if (r.stderr) console.error(r.stderr.trim());
  }
}

if (failed) {
  console.error(`\ncheck: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`\ncheck: ${ENTRYPOINTS.length + extras.length} file(s) ok`);
