/**
 * Fast smoke checks with no Discord/Supabase/Stripe network calls.
 */
import assert from "assert/strict";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { assertCanAddServer, isPlanLive, maxServersForPlan } from "../src/saas/billing/plans.js";
import {
  applyShell,
  PAGES,
  renderAppRobots,
  renderRobots,
} from "../src/server/site/shell.js";
import { entries } from "../src/server/site/changelog.js";
import { BOT_INVITE_PERMISSIONS } from "../src/saas/auth/discord-session.js";
import { friendlyRconError } from "../src/lib/rcon-messages.js";

// Plan gate
assert.equal(isPlanLive("active"), true);
assert.equal(isPlanLive("past_due"), false);
assert.equal(maxServersForPlan("pro"), 2);
assert.equal(maxServersForPlan("network"), 20);

assert.doesNotThrow(() => assertCanAddServer({ plan: "basic", plan_status: "active" }, 0));
assert.throws(
  () => assertCanAddServer({ plan: "basic", plan_status: "canceled" }, 0),
  (e) => e.code === "PLAN_REQUIRED",
);
assert.throws(
  () => assertCanAddServer({ plan: "basic", plan_status: "past_due" }, 0),
  (e) => e.code === "PLAN_REQUIRED",
);
assert.doesNotThrow(() => assertCanAddServer({ plan: "basic", plan_status: "inactive" }, 0));
assert.throws(
  () => assertCanAddServer({ plan: "basic", plan_status: "inactive" }, 1),
  (e) => e.code === "PLAN_REQUIRED",
);

// Marketing shell
assert.ok(PAGES.home?.title);
assert.ok(PAGES.privacy?.title);
const html = applyShell(`<!DOCTYPE html>
<html>
<head>
<!--HEAD:home-->
</head>
<body>
<!--NAV:-->
<!--FOOTER-->
</body>
</html>`);
assert.match(html, /Usely/);
assert.match(html, /og:image/);
assert.match(html, /og\.png/);
assert.match(html, /_vercel\/insights/);
assert.match(html, /skip-link/);
assert.match(html, /id="main"/);
assert.match(html, /nav-drawer/);
assert.match(html, /AggregateOffer/);
assert.doesNotMatch(html, /fonts\.googleapis\.com/);

const css = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server/site/site.css"),
  "utf8",
);
assert.match(css, /\.nav-drawer\[hidden\]/);
assert.match(css, /display:\s*none\s*!important/);

assert.match(renderRobots(), /Sitemap:/);
assert.doesNotMatch(renderRobots(), /^Host:/m);
assert.match(renderAppRobots(), /Disallow: \//);

assert.notEqual(BOT_INVITE_PERMISSIONS, "8");
assert.match(friendlyRconError("ECONNREFUSED"), /refused|WebRCON/i);
assert.match(friendlyRconError("x", { timedOut: true }), /Timed out/);

// Changelog shape
assert.ok(Array.isArray(entries) && entries.length > 0);
assert.ok(entries[0].date && entries[0].title && Array.isArray(entries[0].changes));
for (const change of entries[0].changes) {
  assert.ok(["added", "changed", "fixed"].includes(change.type));
  assert.ok(typeof change.text === "string" && change.text.endsWith("."));
}

console.log("smoke: plan gate, shell, changelog ok");
