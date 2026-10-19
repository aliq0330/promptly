// Hikâye demo ekran görüntüleri (docs/history/198-*): seed'deki örneklere benzeyen hikâyelerle ağ taklitli arayüz. SHOT_DIR gerekir.
import { chromium } from "playwright";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupStories, layer, U } from "./mock-stories.mjs";

const BASE = "http://localhost:4182/promptly";
const out = process.env.SHOT_DIR ?? "/tmp";
const server = await serve(4182);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const db = setupStories(createDb());
for (const u of [U.bob, U.carol, U.dave, U.amy, U.zed, U.erin]) db.follow(U.alice, u);
const L = (t, y, size, color, bg = false) => layer(t, { y, size, color, bg });
const text = (owner, bg, layers, extra = {}) => db.addStory(owner, { layout: { v: 1, bg, layers }, ...extra });
text(U.bob, "cobalt", [L("Bu hafta ışıkla oynuyorum ✨", 0.32, "l", "white"), L("Altın saat + sis = bambaşka bir sahne", 0.52, "m", "yellow")], { minutesAgo: 35 });
text(U.carol, "sunset", [L("Günün sorusu", 0.22, "m", "white"), L("Hangi model, hangi iş?", 0.38, "l", "white")], { minutesAgo: 95, sticker_kind: "poll", sticker_question: "Metin üretimi için favorin?", sticker_options: ["Claude", "GPT", "Gemini", "Yerel model"] });
text(U.dave, "paper", [L("Prompt yazarken tek kural", 0.3, "m", "black"), L("Önce hedefi yaz, sonra stili.", 0.5, "l", "cobalt")], { minutesAgo: 140 });
text(U.amy, "forest", [L("Soru kutusu açık 📬", 0.3, "l", "white")], { minutesAgo: 50, sticker_kind: "question", sticker_question: "Bir sonraki hazır ayarım ne olsun?" });
text(U.zed, "berry", [L("Moodboard sabahı", 0.3, "l", "white", true), L("Pembe, kırmızı, biraz da mürekkep", 0.55, "s", "yellow")], { minutesAgo: 300 });
text(U.erin, "ink", [L("Sinematik video denemesi", 0.3, "l", "white")], { minutesAgo: 180, sticker_kind: "poll", sticker_question: "Hangi kamera hareketi?", sticker_options: ["Dolly in", "Orbit", "Sabit çekim"] });
db.storyViews.push({ story_id: db.stories[5].id, viewer_id: U.alice.id, at: new Date().toISOString() });

for (const [name, viewport, dark] of [["desktop", { width: 1280, height: 900 }, false], ["mobile-dark", { width: 390, height: 844 }, true]]) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  await installMock(context, db, {});
  await context.addInitScript(([d]) => { try { localStorage.setItem("promptly-language", "tr"); if (d) localStorage.setItem("promptly-theme", "dark"); } catch {} }, [dark]);
  const page = await context.newPage();
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().waitFor();
  await page.screenshot({ path: `${out}/demo-tray-${name}.png` });
  await page.locator("[data-story-ring]").first().click();
  await page.locator("[data-story-viewer]").waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/demo-viewer-1-${name}.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Carol hikâyesini aç/ }).click();
  await page.locator('[data-story-sticker="poll"]').waitFor();
  await page.screenshot({ path: `${out}/demo-viewer-poll-${name}.png` });
  await context.close();
}
await browser.close(); server.close();
