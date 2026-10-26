import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
const server = await serve(4195);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
for (const [name, url, vp] of [["req-phone", "/requests/new", { width: 390, height: 844 }], ["prompt-desktop", "/create?mode=prompt", { width: 1280, height: 900 }], ["wf-desktop", "/workflows/create", { width: 1280, height: 900 }], ["preset-phone", "/presets/create", { width: 390, height: 844 }]]) {
  const db = createDb(); setupCommunities(db);
  const context = await browser.newContext({ viewport: vp });
  await installMock(context, db, {});
  await context.addInitScript(() => { try { localStorage.setItem("promptly-language", "tr"); localStorage.setItem("promptly-tour-seen", "1"); } catch {} });
  const page = await context.newPage();
  await page.goto(`http://localhost:4195/promptly${url}`);
  await page.locator("[data-compose]").waitFor(); await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/claude-0/shots/${name}.png`, fullPage: true });
  const fixed = await page.locator("*").evaluateAll((els) => els.filter((el) => getComputedStyle(el).position === "fixed").map((el) => el.tagName + "." + el.className.slice(0, 40) + " " + Math.round(el.getBoundingClientRect().bottom)));
  console.log(name, JSON.stringify(fixed.slice(0, 5)), await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]));
  await context.close();
}
await browser.close(); server.close();
