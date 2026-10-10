// Captures full-page screenshots of the main screens for design review.
//   node e2e/screens.mjs <outDir> [cookieJson]
// cookieJson: file with {"cookie":"bh_session=..."} for organizer pages.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "screens");
const cookieFile = process.argv[3];
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const width = Number(process.env.SHOT_WIDTH ?? 1440);
mkdirSync(out, { recursive: true });

const pages = (process.env.SHOT_PAGES ?? "").split(",").filter(Boolean);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: Number(process.env.SHOT_SCALE ?? 1) });
if (cookieFile) {
  const { cookie } = JSON.parse(readFileSync(cookieFile, "utf8"));
  const [name, value] = cookie.split("=");
  await ctx.addCookies([{ name, value, url: base }]);
}
const page = await ctx.newPage();
for (const entry of pages) {
  const [name, path] = entry.split("=");
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: process.env.SHOT_FULL !== "false" });
  console.log("saved", name);
}
await browser.close();
