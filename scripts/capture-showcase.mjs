import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const out = path.resolve("assets/site");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
});

await page.goto("https://app.usely.dev/demo", {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await page.waitForTimeout(2500);

await page.getByRole("button", { name: "Kits", exact: true }).click({ force: true });
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Create kit" }).click({ force: true });
await page.waitForSelector(".kit-builder-modal", { timeout: 15000 });
await page.waitForTimeout(1000);
await page.locator(".kit-builder-modal").screenshot({
  path: path.join(out, "showcase-kits.png"),
  type: "png",
});
console.log("kits", fs.statSync(path.join(out, "showcase-kits.png")).size);

await page.keyboard.press("Escape");
await page.waitForTimeout(700);

await page.getByRole("button", { name: "Workspace", exact: true }).click({ force: true });
await page.waitForTimeout(1200);
const box = await page.locator(".main").boundingBox();
if (!box) throw new Error("no .main");
await page.screenshot({
  path: path.join(out, "showcase-workspace.png"),
  type: "png",
  clip: {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    width: Math.min(box.width, 1400),
    height: Math.min(box.height, 900),
  },
});
console.log("workspace", fs.statSync(path.join(out, "showcase-workspace.png")).size);
await browser.close();
