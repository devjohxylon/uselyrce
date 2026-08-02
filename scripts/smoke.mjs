/**
 * Fast smoke checks with no Discord/Supabase/Stripe network calls.
 */
import assert from "assert/strict";
import { assertCanAddServer, isPlanLive, maxServersForPlan } from "../src/saas/billing/plans.js";
import { applyShell, PAGES } from "../src/server/site/shell.js";
import { entries } from "../src/server/site/changelog.js";

// Plan gate
assert.equal(isPlanLive("active"), true);
assert.equal(isPlanLive("past_due"), false);
assert.equal(maxServersForPlan("pro"), 2);

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
assert.match(html, /_vercel\/insights/);

// Changelog shape
assert.ok(Array.isArray(entries) && entries.length > 0);
assert.ok(entries[0].date && entries[0].title && Array.isArray(entries[0].changes));
for (const change of entries[0].changes) {
  assert.ok(["added", "changed", "fixed"].includes(change.type));
  assert.ok(typeof change.text === "string" && change.text.endsWith("."));
}

console.log("smoke: plan gate, shell, changelog ok");
