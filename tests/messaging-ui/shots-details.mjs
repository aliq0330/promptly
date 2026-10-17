// İçerik detay sayfaları (Prompt · İstek · Workflow · Hazır ayar) ekran görüntüsü üreticisi — ağ taklitli, ZENGİN veriyle (medya, etiket, araç, yorum).
// Kullanım: OUT=/yol CHROMIUM_PATH=… [ONLY=prompt,request] [VP=mobile-390,desktop-1440] [THEME=dark] [FULL=1] node tests/messaging-ui/shots-details.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { PAGES, installDetailData, seedComments } from "./detail-fixtures.mjs";

const OUT = process.env.OUT ?? "/tmp/detail-shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4179/promptly";
const server = await serve(4179);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });

const VIEWPORTS = [["mobile-320", 320, 700], ["mobile-390", 390, 844], ["mobile-430", 430, 900], ["tablet-768", 768, 1000], ["lap-1024", 1024, 900], ["desktop-1280", 1280, 900], ["desktop-1440", 1440, 1000]];
const only = process.env.ONLY?.split(",");
const vpOnly = process.env.VP?.split(",");
for (const [vname, width, height] of VIEWPORTS) {
  if (vpOnly && !vpOnly.includes(vname)) continue;
  for (const [kind, path] of Object.entries(PAGES)) {
    if (only && !only.includes(kind)) continue;
    const db = createDb();
    setupCommunities(db);
    seedComments(db, kind);
    const context = await browser.newContext({ viewport: { width, height } });
    await installMock(context, db, {});
    await installDetailData(context);
    await context.addInitScript((th) => { try { localStorage.setItem("promptly-language", "tr"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, process.env.THEME);
    const page = await context.newPage();
    await page.goto(BASE + path);
    await page.waitForTimeout(1800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}/${kind}__${vname}.png`, fullPage: process.env.FULL === "1" });
    console.log(`${kind} @ ${vname}: overflow=${overflow}`);
    await context.close();
  }
}
await browser.close(); server.close();
