// Captures README media: the hero (header + yellow band) after its print-and-stamp animation.
//   node e2e/shots-readme.mjs <outDir>
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "media");
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
const hero = await page.locator("main > section").first().boundingBox();
await page.screenshot({ path: `${out}/hero.png`, clip: { x: 0, y: 0, width: 1440, height: Math.round(hero.y + hero.height) } });
await browser.close();
