// Dokunma hedefi ölçümü (docs/history/406-*): telefon genişliğinde ana sayfalardaki etkileşimli öğelerin kutusu en az 36×36 olmalı (CLAUDE.md §4: "Dokunma hedefleri ≥ 36px").
// Satır içi metin bağlantıları ve görünmeyen öğeler sayılmaz; kasıtlı küçük hedefler `data-small-target` ile işaretlenir. Çıktı: ihlal listesi; ihlal varsa çıkış kodu 1.
// Ağ taklitli; gerçek Supabase/cihaza KARŞI DENENMEDİ.
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   CHROMIUM_PATH=... node tests/design/touch-targets.mjs
import { chromium } from "playwright";
import { serve } from "../messaging-ui/server.mjs";
import { createDb, installMock } from "../messaging-ui/mock.mjs";
import { setupCommunities } from "../messaging-ui/mock-communities.mjs";
import { PAGES, installDetailData, seedComments } from "../messaging-ui/detail-fixtures.mjs";

const PORT = Number(process.env.PORT ?? 4298);
const BASE = `http://localhost:${PORT}/promptly`;
const MIN = 36;
const PAGES_TO_MEASURE = [
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
  ["notifications", "/notifications"],
  ["home", "/"],
];

const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const offenders = new Map();
for (const [name, path] of PAGES_TO_MEASURE) {
  const db = createDb();
  setupCommunities(db);
  seedComments(db, "prompt");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.addInitScript(() => {
    try {
      localStorage.setItem("promptly-language", "tr");
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  });
  const page = await context.newPage();
  try {
    await page.goto(BASE + path, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const found = await page.evaluate((min) => {
      const out = [];
      const nodes = document.querySelectorAll("button, a[href], [role=button], [role=switch], [role=tab], [role=menuitem], input:not([type=hidden]), select, textarea");
      for (const el of nodes) {
        if (el.closest("[data-small-target]")) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") continue;
        if (el.tagName === "A" && style.display === "inline") continue; // a link inside running text
        if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) continue; // the label is the target
        if (el.classList.contains("sr-only") || el.closest(".sr-only")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < min || rect.height < min) out.push(`${el.tagName.toLowerCase()} ${Math.round(rect.width)}×${Math.round(rect.height)} ${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)} | ${String(el.className).slice(0, 70)}`);
      }
      return out;
    }, MIN);
    for (const line of found) {
      const key = `${name}: ${line}`;
      offenders.set(key, true);
    }
  } catch (error) {
    console.log("FAIL", name, String(error.message).split("\n")[0]);
  }
  await context.close();
}
await browser.close();
server.close();
if (offenders.size === 0) {
  console.log(`dokunma hedefi: ${PAGES_TO_MEASURE.length} sayfada < ${MIN}px öğe yok`);
} else {
  console.log([...offenders.keys()].join("\n"));
  console.log(`\n${offenders.size} öğe < ${MIN}px`);
  process.exitCode = 1;
}
