// Captures the bring-your-own-key flow: banner, dialog, a rejected key.
//   node e2e/shots-key.mjs <outDir>
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const out = resolve(process.argv[2] ?? "screens");
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/play`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/key-1-play.png` });
await page.getByRole("button", { name: "Use my Claude key" }).click();
await page.getByRole("textbox", { name: "Claude API key" }).fill("sk-ant-api03-this-is-not-a-real-key-0000000000000000");
await page.screenshot({ path: `${out}/key-2-dialog.png` });
await page.getByRole("button", { name: "Check and save" }).click();
await page.getByRole("alert").waitFor({ timeout: 20_000 });
await page.waitForTimeout(300);
console.log("error:", await page.getByRole("alert").innerText());
await page.screenshot({ path: `${out}/key-3-rejected.png` });
await browser.close();
