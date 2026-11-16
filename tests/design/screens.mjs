// Tasarım denetimi (docs/history/406-*): ana sayfaların ekran görüntüsünü alır — önce/sonra karşılaştırması için.
// Ağ taklitli (tests/messaging-ui/mock.mjs); gerçek Supabase'e KARŞI DENENMEDİ. Çıktı: SHOTS klasörü (varsayılan /tmp/promptly-shots).
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   SHOTS=/tmp/after CHROMIUM_PATH=... node tests/design/screens.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import { serve } from "../messaging-ui/server.mjs";
import { createDb, installMock } from "../messaging-ui/mock.mjs";
import { setupCommunities } from "../messaging-ui/mock-communities.mjs";
import { PAGES, installDetailData, seedComments } from "../messaging-ui/detail-fixtures.mjs";

const PORT = Number(process.env.PORT ?? 4299);
const BASE = `http://localhost:${PORT}/promptly`;
const SHOTS = process.env.SHOTS ?? "/tmp/promptly-shots";
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1100 }, desktop: { width: 1440, height: 900 } };
const PAGES_TO_SHOOT = [
  ["discover", "/discover"],
  ["prompt", PAGES.prompt],
  ["request", PAGES.request],
  ["workflow", PAGES.workflow],
  ["preset", PAGES.preset],
  ["communities", "/communities"],
  ["spaces", "/spaces"],
  ["teams", "/teams"],
  ["saved", "/saved"],
  ["settings", "/settings"],
  ["settings-preferences", "/settings/preferences"],
  ["notifications", "/notifications"],
  ["home", "/"],
];

const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
let count = 0;
for (const [name, path] of PAGES_TO_SHOOT) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const theme of ["light", "dark"]) {
      const db = createDb();
      setupCommunities(db);
      seedComments(db, "prompt");
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768, isMobile: viewport.width < 768, deviceScaleFactor: 1 });
      await installMock(context, db, {});
      await installDetailData(context);
      await context.addInitScript((th) => {
        try {
          localStorage.setItem("promptly-language", "tr");
          localStorage.setItem("promptly-tour-seen", "1");
          localStorage.setItem("promptly-theme", th);
        } catch {}
      }, theme);
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      try {
        await page.goto(BASE + path, { waitUntil: "load" });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${SHOTS}/${name}-${vpName}-${theme}.png`, fullPage: false });
        count += 1;
      } catch (error) {
        console.log("FAIL", name, vpName, theme, String(error.message).split("\n")[0]);
      }
      await context.close();
    }
  }
}
await browser.close();
server.close();
console.log(`${count} ekran görüntüsü → ${SHOTS}`);
