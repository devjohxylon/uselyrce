/**
 * One-shot: point Railway production at the Usely Supabase project.
 *
 * Usage (PowerShell):
 *   $env:USELY_SERVICE_ROLE_KEY = "eyJ...service_role..."   # from Supabase → Usely → Settings → API
 *   node scripts/cutover-supabase-railway.mjs
 *
 * Optional override:
 *   $env:USELY_ANON_KEY = "eyJ...anon..."
 */
import { execFileSync } from "child_process";

const PROJECT_URL = "https://iteyedqonfhwrrqtwrxm.supabase.co";
const DEFAULT_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZXllZHFvbmZod3JycXR3cnhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MDczNzksImV4cCI6MjEwMTI4MzM3OX0.jgl1MLfoEJghEJeVkESzUU9KkeUTevUZgxFmzpuU3_o";

const service =
  String(process.env.USELY_SERVICE_ROLE_KEY || "").trim() ||
  String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anon = String(process.env.USELY_ANON_KEY || "").trim() || DEFAULT_ANON;

if (!service) {
  console.error(
    "Set USELY_SERVICE_ROLE_KEY to the Usely project service_role key, then re-run.",
  );
  process.exit(1);
}
if (!service.includes(".") && !service.startsWith("sb_secret_")) {
  console.error("USELY_SERVICE_ROLE_KEY does not look like a Supabase secret key.");
  process.exit(1);
}

function railwaySet(pairs) {
  execFileSync(
    "npx",
    ["--yes", "@railway/cli@latest", "variables", "set", ...pairs],
    { stdio: "inherit", shell: true },
  );
}

console.log("Setting Railway SUPABASE_* → Usely project iteyedqonfhwrrqtwrxm …");
railwaySet([
  `SUPABASE_URL=${PROJECT_URL}`,
  `SUPABASE_ANON_KEY=${anon}`,
  `SUPABASE_SERVICE_ROLE_KEY=${service}`,
]);
console.log("Done. Railway will redeploy. Confirm /ops still lists workspaces.");
