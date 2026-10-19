// Hikâyeler arayüzü (docs/history/198-*) — ağ taklitli Playwright. Gerçek Supabase'e KARŞI DENENMEDİ; RLS/RPC doğrulaması
// `supabase/tests/stories.sql`'dedir. Çalıştırma: tests/messaging-ui/README.md → "Hikâyeler".
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock } from "./mock.mjs";
import { setupStories, layer, ME, U, MEDIA_BASE } from "./mock-stories.mjs";

const BASE = "http://localhost:4181/promptly";
const server = await serve(4181);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", theme, guest = false, clock = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = setupStories(createDb());
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
  await installMock(context, db, { guest });
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  if (clock) await page.clock.install();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/stfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const viewer = (page) => page.locator("[data-story-viewer]");
const rpcCalls = (db, name) => db.calls.filter((c) => c.table === `rpc/${name}`);
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** Görüntüleyicide kim/ne gösteriliyor: başlıktaki ad + tuvaldeki ilk yazı. */
const shown = async (page) => (await viewer(page).locator("[data-story-layer]").first().textContent())?.trim();
const tapStage = async (page, side) => {
  const box = await viewer(page).locator(".touch-none").first().boundingBox();
  await page.mouse.click(box.x + (side === "left" ? box.width * 0.1 : box.width * 0.85), box.y + box.height * 0.5);
};

function seedTray(db) {
  db.follow(U.alice, U.bob);
  db.follow(U.alice, U.carol);
  db.addStory(U.bob, { text: "Bob 1", minutesAgo: 90 });
  db.addStory(U.bob, { text: "Bob 2", minutesAgo: 60 });
  db.addStory(U.carol, { text: "Carol 1", minutesAgo: 30 });
  // takip edilmeyen kişinin herkese açık hikâyesi şeride GİRMEZ
  db.addStory(U.dave, { text: "Dave", minutesAgo: 10 });
}

// 1 — Ana Sayfa: eski topluluk halkaları yok; hikâye şeridi kendi halkası + takip edilenler
await scenario("1. Ana Sayfa: topluluk halkaları kalktı; şerit = Hikâyen + takip edilenler (görülmemiş önce); takip edilmeyen yok", async ({ page, db }) => {
  seedTray(db);
  db.storyViews.push({ story_id: db.stories[2].id, viewer_id: ME, at: new Date().toISOString() }); // Carol görüldü
  await page.goto(`${BASE}/`);
  const tray = page.locator("[data-story-tray]");
  await tray.locator("[data-story-ring]").first().waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Toplulukların" }).count(), 0, "old community rings are gone");
  assert.equal(await tray.getByText("Hikâyen").count(), 1);
  const rings = await tray.locator("[data-story-ring]").evaluateAll((els) => els.map((e) => [e.querySelector("span.truncate").textContent.trim(), e.getAttribute("data-story-ring")]));
  assert.deepEqual(rings, [["Bob", "unseen"], ["Carol", "seen"]], "unseen first, Dave (not followed) absent");
  assert.equal(await tray.getByRole("link", { name: "Hikâye ekle" }).getAttribute("href"), "/promptly/stories/create/");
});

// 2 — Görüntüleyici: aç, ilerle, geri, sonraki kişiye geç, Esc ile kapat; kaydırma konumu korunur; görüntüleme kaydı tek sefer
await scenario("2. Görüntüleyici: dokun-ileri/geri, kişi geçişi, Esc kapatır, kaydırma konumu korunur, görüntüleme bir kez", async ({ page, db }) => {
  seedTray(db);
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().waitFor();
  await page.evaluate(() => { document.body.style.minHeight = "3000px"; window.scrollTo(0, 0); });
  // İkisi de görülmemiş: en yeni (Carol) önce gelir; Bob'u adıyla aç, sonra Bob'un ardından gelen kişi yok → Carol'a geri dönmek yerine kapanır
  await page.getByRole("button", { name: "Carol hikâyesini aç (yeni)" }).click();
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Carol 1");
  await page.keyboard.press("ArrowRight");
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Bob 1");
  await page.waitForFunction(() => true);
  await tapStage(page, "right");
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 2");
  await tapStage(page, "left");
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 1");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Carol 1");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  const marked = rpcCalls(db, "mark_story_viewed").map((c) => c.body.p_story_id);
  assert.equal(new Set(marked).size, marked.length, "each story marked once");
  assert.ok(marked.includes(db.stories[0].id) && marked.includes(db.stories[1].id) && marked.includes(db.stories[2].id), "all shown stories marked viewed");
  // halkalar anında "görüldü"ye döner (yeniden istek beklemeden)
  assert.deepEqual(await page.locator("[data-story-ring]").evaluateAll((els) => els.map((e) => e.getAttribute("data-story-ring"))), ["seen", "seen"]);
});

// 2b — İlk görülmemişten başlar; görülmüş hikâye bir an bile gösterilip yeniden işaretlenmez
await scenario("2b. Kısmen izlenmiş kişi: ikinci (görülmemiş) hikâyeden başlar, birinci yeniden 'görüldü' gönderilmez", async ({ page, db }) => {
  seedTray(db);
  db.storyViews.push({ story_id: db.stories[0].id, viewer_id: ME, at: new Date().toISOString() }); // Bob 1 görüldü
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Bob hikâyesini aç (yeni)" }).click();
  await viewer(page).waitFor();
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 2");
  await page.waitForTimeout(300);
  const marked = rpcCalls(db, "mark_story_viewed").map((c) => c.body.p_story_id);
  assert.deepEqual(marked, [db.stories[1].id], "only Bob 2 is marked");
  await tapStage(page, "left");
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 1");
});

// 3 — Otomatik ilerleme ve duraklatma (sahte saat)
await scenario("3. Otomatik ilerleme: 7 sn sonra sonraki; basılı tutmak ve Boşluk duraklatır; son hikâyeden sonra kapanır", async ({ page, db }) => {
  db.follow(U.alice, U.bob);
  db.addStory(U.bob, { text: "Bir", minutesAgo: 20 });
  db.addStory(U.bob, { text: "İki", minutesAgo: 10 });
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Bir");
  await page.keyboard.press(" ");
  assert.equal(await viewer(page).getByRole("button", { name: "Oynat" }).getAttribute("aria-pressed"), "true");
  await page.clock.runFor(9000);
  assert.equal(await shown(page), "Bir", "paused: no advance");
  await page.keyboard.press(" ");
  await page.clock.runFor(7600);
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "İki");
  const box = await viewer(page).locator(".touch-none").first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.clock.runFor(9000);
  assert.equal(await shown(page), "İki", "holding pauses");
  await page.mouse.up();
  await page.clock.runFor(8000);
  await viewer(page).waitFor({ state: "detached" });
}, { clock: true });

// 4 — Tepki ve özel yanıt
await scenario("4. Tepki (ver/değiştir/kaldır) ve özel yanıt mevcut mesajlaşmaya gider", async ({ page, db }) => {
  db.follow(U.alice, U.bob);
  const s = db.addStory(U.bob, { text: "Yanıtla beni" });
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).waitFor();
  await viewer(page).getByRole("button", { name: "🔥 ile tepki ver" }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="🔥 tepkini kaldır"]'));
  await viewer(page).getByRole("button", { name: "❤️ ile tepki ver" }).click();
  await viewer(page).getByRole("button", { name: "❤️ tepkini kaldır" }).click();
  const emojis = rpcCalls(db, "set_story_reaction").map((c) => c.body.p_emoji);
  assert.deepEqual(emojis, ["🔥", "❤️", null]);
  const input = viewer(page).getByRole("textbox", { name: "Hikâyeye özel yanıt" });
  await input.fill("Harika olmuş!");
  await viewer(page).getByRole("button", { name: "Yanıtı gönder" }).click();
  await viewer(page).getByText("Yanıtın mesaj olarak gönderildi.").waitFor();
  const reply = rpcCalls(db, "reply_to_story")[0].body;
  assert.deepEqual(reply, { p_story_id: s.id, p_body: "Harika olmuş!" });
  const msg = db.messages.find((m) => m.is_story_reply);
  assert.ok(msg && msg.story_id === s.id, "reply is a direct message linked to the story");
  await viewer(page).getByRole("button", { name: "Sohbeti aç" }).click();
  await page.waitForURL(/\/messages\/local\/?\?id=/);
  await page.locator("[data-story-reply-card]").first().waitFor();
});

// 5 — Anket ve soru çıkartmaları
await scenario("5. Anket: oy → sonuç yüzdeleri, oy değiştirilebilir; Soru: yanıt gönderilir, gizlilik notu görünür", async ({ page, db }) => {
  db.follow(U.alice, U.bob);
  const poll = db.addStory(U.bob, { sticker_kind: "poll", sticker_question: "Hangisi?", sticker_options: ["Mavi", "Turuncu"], layout: { v: 1, bg: "ink", layers: [layer("Anket")] }, minutesAgo: 20 });
  db.pollVotes.push({ story_id: poll.id, voter_id: U.carol.id, option_index: 1 });
  const q = db.addStory(U.bob, { sticker_kind: "question", sticker_question: "Nasıl geliştirirdin?", layout: { v: 1, bg: "ink", layers: [layer("Soru")] }, minutesAgo: 10 });
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).locator('[data-story-sticker="poll"]').waitFor();
  await viewer(page).getByText("Sonuçlar oy verenlere görünür.").count();
  await viewer(page).getByRole("button", { name: "Mavi" }).click();
  await viewer(page).getByText("2 oy").waitFor();
  assert.equal(await viewer(page).getByRole("button", { name: /Mavi/ }).getAttribute("aria-pressed"), "true");
  assert.match(await viewer(page).locator('[data-story-sticker="poll"]').textContent(), /50%.*50%/);
  await viewer(page).getByRole("button", { name: /Turuncu/ }).click();
  await page.waitForFunction(() => document.querySelector('[data-story-sticker="poll"]')?.textContent.includes("100%"));
  assert.deepEqual(rpcCalls(db, "vote_story_poll").map((c) => c.body.p_option), [0, 1]);
  assert.equal(db.pollVotes.filter((v) => v.voter_id === ME).length, 1, "one vote row per person");
  await page.keyboard.press("ArrowRight");
  await viewer(page).locator('[data-story-sticker="question"]').waitFor();
  await viewer(page).getByText(/Yanıtını yalnız hikâye sahibi görür/).waitFor();
  await viewer(page).getByRole("textbox", { name: "Yanıtını yaz" }).fill("Daha fazla ışık");
  await viewer(page).getByRole("button", { name: "Yanıtı gönder" }).first().click();
  await viewer(page).getByText("Yanıtın gönderildi.").waitFor();
  assert.deepEqual(rpcCalls(db, "answer_story_question")[0].body, { p_story_id: q.id, p_body: "Daha fazla ışık" });
});

// 6 — Sahip: görüntüleyenler, soru yanıtları, silme
await scenario("6. Sahip: görüntüleyen listesi (+tepki), yanıtlar sekmesi, sil → DELETE ve görüntüleyici kapanır", async ({ page, db }) => {
  const mine = db.addStory(U.alice, { sticker_kind: "question", sticker_question: "Ne yapayım?", layout: { v: 1, bg: "forest", layers: [layer("Benim")] }, viewer_count: 1 });
  db.storyViews.push({ story_id: mine.id, viewer_id: U.bob.id, at: new Date().toISOString() });
  db.storyReactions.push({ story_id: mine.id, user_id: U.bob.id, emoji: "🔥" });
  db.answers.push({ id: crypto.randomUUID(), story_id: mine.id, responder_id: U.bob.id, body: "Bir kolaj", created_at: new Date().toISOString() });
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Hikâyeni aç" }).click();
  await viewer(page).waitFor();
  assert.equal(await viewer(page).getByRole("textbox", { name: "Hikâyeye özel yanıt" }).count(), 0, "no reply box on own story");
  await viewer(page).getByRole("button", { name: /1 görüntüleyen/ }).click();
  const sheet = page.getByRole("dialog", { name: "Hikâye etkinliği" });
  await sheet.getByText("Bob", { exact: true }).waitFor();
  assert.equal(await sheet.getByLabel("🔥 tepkisi verdi").count(), 1);
  await sheet.getByRole("tab", { name: "Yanıtlar" }).click();
  await sheet.getByText("Bir kolaj").waitFor();
  assert.equal(await sheet.getByRole("button", { name: "Hikâyede paylaş" }).count(), 1);
  await sheet.getByRole("button", { name: "Kapat" }).last().click();
  await viewer(page).getByRole("button", { name: "Diğer işlemler" }).click();
  await viewer(page).getByRole("menuitem", { name: "Hikâyeyi sil" }).click();
  await page.getByRole("dialog", { name: "Hikâye silinsin mi?" }).getByRole("button", { name: "Hikâyeyi sil" }).click();
  await viewer(page).waitFor({ state: "detached" });
  assert.ok(db.calls.some((c) => c.method === "DELETE" && c.table === "stories"));
  assert.equal(db.stories.length, 0);
});

// 7 — Aşağı çekip kapatma ve yatay kaydırma (dokunmatik/fare sürükleme)
await scenario("7. Hareketler: yatay kaydırma kişiyi değiştirir, aşağı çekmek kapatır", async ({ page, db }) => {
  seedTray(db);
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).waitFor();
  const box = await viewer(page).locator(".touch-none").first().boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx - 60, cy, { steps: 4 });
  await page.mouse.move(cx - 140, cy, { steps: 4 });
  await page.mouse.up();
  // en yeni görülmemiş Carol'dı; sola kaydırmak sıradaki kişiye (Bob) geçer
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 1");
  await page.mouse.move(cx, cy - 100);
  await page.mouse.down();
  await page.mouse.move(cx, cy, { steps: 4 });
  await page.mouse.move(cx, cy + 120, { steps: 4 });
  await page.mouse.up();
  await viewer(page).waitFor({ state: "detached" });
});

// 8 — Oluşturucu: metin hikâyesi, önizleme, çift dokunma tek hikâye, yönlendirme
await scenario("8. Oluştur (metin): yazı ekle → önizle → Paylaş; çift tıklama tek create_story; client_token + düzen gönderilir", async ({ page, db }) => {
  await page.goto(`${BASE}/stories/create`);
  await page.getByRole("button", { name: /^Metin/ }).click();
  await page.getByRole("button", { name: "Yazı ekle" }).click();
  const text = page.getByRole("textbox", { name: "Yazı" });
  await text.fill("Yeni prompt yolda");
  await page.getByRole("button", { name: "Sarı" }).click();
  await page.getByRole("button", { name: "Böğürtlen" }).click();
  await page.getByRole("button", { name: "Takipçiler" }).click();
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.getByRole("heading", { name: "Önizleme" }).waitFor();
  await page.getByText("Metin hikâyesi").waitFor();
  const publish = page.locator("[data-story-publish]");
  await publish.dblclick();
  await page.waitForURL(`${BASE}/`);
  const calls = rpcCalls(db, "create_story");
  assert.equal(new Set(calls.map((c) => c.body.p.client_token)).size, 1, "same token on every attempt");
  assert.equal(db.stories.length, 1, "exactly one story");
  const p = calls[0].body.p;
  assert.equal(p.kind, "text");
  assert.equal(p.audience, "followers");
  assert.equal(p.layout.bg, "berry");
  assert.deepEqual([p.layout.layers[0].text, p.layout.layers[0].color], ["Yeni prompt yolda", "yellow"]);
  assert.equal(p.media_url, null);
});

// 9 — Oluşturucu: boş hikâye ve geçersiz anket uyarıları
await scenario("9. Doğrulama: boş metin hikâyesi, eksik anket seçeneği ve topluluk seçilmeden paylaşım engellenir", async ({ page }) => {
  await page.goto(`${BASE}/stories/create`);
  await page.getByRole("button", { name: /^Metin/ }).click();
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.getByRole("alert").getByText("Hikâyeye bir yazı, içerik bağlantısı ya da çıkartma ekle.").waitFor();
  await page.getByRole("button", { name: "Anket" }).click();
  await page.getByRole("textbox", { name: "Anket sorusu" }).fill("Hangisi?");
  await page.getByRole("textbox", { name: "Seçenek 1" }).fill("A");
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.getByRole("alert").getByText(/Ankette 2–4 dolu seçenek/).waitFor();
  await page.getByRole("textbox", { name: "Seçenek 2" }).fill("B");
  await page.getByRole("button", { name: "Topluluk", exact: true }).click();
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.getByRole("alert").getByText("Bir topluluk seç.").waitFor();
});

// 10 — Fotoğraf: küçültülür, ilerlemeli yükleme, hata → tekrar dene aynı yola, sonra yayımla
await scenario("10. Fotoğraf: yükleme hatası düzenlemeyi kaybetmez; tekrar dene AYNI yola yazar; create_story story-media URL'siyle", async ({ page, db, context }) => {
  let failOnce = true;
  const uploads = [];
  await context.route("https://example.supabase.co/storage/v1/object/story-media/**", async (route) => {
    uploads.push(new URL(route.request().url()).pathname);
    if (failOnce) {
      failOnce = false;
      return route.fulfill({ status: 500, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"Key":"x"}' });
  });
  await page.goto(`${BASE}/stories/create`);
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 700;
    const g = c.getContext("2d"); g.fillStyle = "#3355ff"; g.fillRect(0, 0, 400, 700);
    return Array.from(new Uint8Array(await (await new Promise((r) => c.toBlob(r, "image/png"))).arrayBuffer()));
  });
  await page.locator('input[type="file"][accept^="image"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: Buffer.from(png) });
  await page.getByRole("heading", { name: "Hikâyeni düzenle" }).waitFor();
  await page.getByRole("button", { name: "Yazı ekle" }).click();
  await page.getByRole("textbox", { name: "Yazı" }).fill("Ilk deneme");
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.locator("[data-story-publish]").click();
  await page.getByRole("alert").getByText(/Yükleme başarısız oldu/).waitFor();
  assert.equal(rpcCalls(db, "create_story").length, 0, "nothing published while the upload failed");
  await page.getByRole("alert").getByRole("button", { name: "Tekrar dene" }).click();
  await page.waitForURL(`${BASE}/`);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0], uploads[1], "retry targets the same object path");
  assert.match(uploads[0], new RegExp(`/story-media/${ME}/[0-9a-f-]{36}\\.jpg$`), "JPEG under the user's own folder");
  const p = rpcCalls(db, "create_story")[0].body.p;
  assert.equal(p.kind, "image");
  assert.equal(p.media_mime, "image/jpeg");
  assert.ok(p.media_url.startsWith(`${MEDIA_BASE}${ME}/`));
  assert.deepEqual(p.layout.layers.map((l) => l.text), ["Ilk deneme"]);
});

// 11 — Desteklenmeyen dosya: uzantıya değil içeriğe bakılır
await scenario("11. Medya doğrulaması: .jpg adlı HTML dosyası reddedilir", async ({ page }) => {
  await page.goto(`${BASE}/stories/create`);
  await page.locator('input[type="file"][accept^="image"]').setInputFiles({ name: "kedi.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html><script>alert(1)</script></html>") });
  await page.getByRole("alert").getByText(/Bu dosya türü desteklenmiyor/).waitFor();
});

// 12 — Taslak kaydet ve yeniden aç; bağlantıyla gelen içerik kartı
await scenario("12. Taslak: kaydedilir (yalnız sahibine), listeden yeniden açılır; ?link= içerik kartını bağlar", async ({ page, db }) => {
  await page.goto(`${BASE}/stories/create`);
  await page.getByRole("button", { name: /^Metin/ }).click();
  await page.getByRole("button", { name: "Yazı ekle" }).click();
  await page.getByRole("textbox", { name: "Yazı" }).fill("Taslak yazısı");
  await page.getByRole("button", { name: "Taslağa kaydet" }).click();
  await page.getByText("Taslak kaydedildi.").waitFor();
  assert.equal(db.drafts.length, 1);
  assert.equal(db.drafts[0].owner_id, ME);
  assert.equal(db.drafts[0].payload.layout.layers[0].text, "Taslak yazısı");
  await page.goto(`${BASE}/stories/create`);
  await page.getByRole("button", { name: /kaydedilen taslağı aç/ }).click();
  assert.equal(await page.locator("[data-story-layer]").first().textContent(), "Taslak yazısı");
  const promptId = "a0000000-0000-4000-8000-0000000000a1";
  await page.goto(`${BASE}/stories/create?link=prompt:${promptId}`);
  await page.locator("[data-story-link]").waitFor();
  await page.getByRole("button", { name: "Önizle" }).click();
  await page.locator("[data-story-publish]").click();
  await page.waitForURL(`${BASE}/`);
  const p = rpcCalls(db, "create_story")[0].body.p;
  assert.deepEqual([p.linked_type, p.linked_id], ["prompt", promptId]);
});

// 13 — /stories?id=: görülemeyen hikâye bilgi sızdırmaz; görülebilen açılır
await scenario("13. /stories?id=: görülemeyen (takipçiye özel) → 'artık mevcut değil'; görülebilen açılır", async ({ page, db }) => {
  const hidden = db.addStory(U.bob, { audience: "followers", text: "Gizli" });
  const open = db.addStory(U.carol, { text: "Açık" });
  await page.goto(`${BASE}/stories?id=${hidden.id}`);
  await page.getByText("Bu hikâye artık mevcut değil").waitFor();
  assert.equal(await page.getByText("Gizli").count(), 0);
  await page.goto(`${BASE}/stories?id=${open.id}`);
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Açık");
});

// 14 — Profil: hikâye halkası + öne çıkanlar (öğeler kendi hedef kitlesine göre)
await scenario("14. Profil: avatar halkası hikâyeyi açar; öne çıkan yalnız görülebilen öğeleriyle; topluluk halkaları yok", async ({ page, db }) => {
  const a = db.addStory(U.bob, { text: "Profil hikâyesi" });
  const old = db.addStory(U.bob, { text: "Eski herkese açık", expired: true });
  const secret = db.addStory(U.bob, { text: "Eski takipçi", expired: true, audience: "followers" });
  db.highlights.push({ id: crypto.randomUUID(), owner_id: U.bob.id, title: "Seyahat", items: [old.id, secret.id] });
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  const ring = page.locator("[data-profile-story-ring]");
  await page.waitForFunction(() => document.querySelector("[data-profile-story-ring]")?.getAttribute("data-profile-story-ring") === "unseen");
  await page.getByRole("button", { name: "Bob hikâyelerini aç" }).click();
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Profil hikâyesi");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "detached" });
  assert.equal(await ring.getAttribute("data-profile-story-ring"), "seen");
  await page.getByRole("button", { name: '"Seyahat" öne çıkanını aç' }).click();
  await viewer(page).waitFor();
  assert.equal(await shown(page), "Eski herkese açık");
  assert.equal(await viewer(page).locator(".h-\\[3px\\]").count(), 1, "the followers-only item is not in the visitor's sequence");
  assert.equal(await viewer(page).getByRole("textbox", { name: "Hikâyeye özel yanıt" }).count(), 0, "expired highlight: no replies");
  assert.ok(a);
});

// 15 — Kendi profilim: "Yeni" öne çıkan oluştur
await scenario("15. Kendi profilim: Yeni öne çıkan → arşivden seç → kaydet", async ({ page, db }) => {
  const s1 = db.addStory(U.alice, { text: "Arşiv 1", expired: true });
  db.addStory(U.alice, { text: "Arşiv 2", minutesAgo: 5 });
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await page.locator("[data-story-highlights]").getByRole("button", { name: "Yeni" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni öne çıkan" });
  await dialog.getByRole("textbox", { name: "Ad" }).fill("En iyiler");
  await dialog.locator("button[aria-pressed]").nth(1).click();
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await dialog.waitFor({ state: "detached" });
  const call = rpcCalls(db, "save_story_highlight")[0].body;
  assert.deepEqual([call.p_title, call.p_story_ids], ["En iyiler", [s1.id]]);
  await page.getByRole("button", { name: '"En iyiler" öne çıkanını aç' }).waitFor();
});

// 16 — Arşiv: yalnız sahibine, saklama tercihi
await scenario("16. Arşiv: etkin + süresi dolmuş hikâyeler; saklama anahtarı profili günceller", async ({ page, db }) => {
  db.addStory(U.alice, { text: "Etkin", minutesAgo: 60 });
  db.addStory(U.alice, { text: "Eski", expired: true, minutesAgo: 26 * 60 });
  await page.goto(`${BASE}/stories/archive`);
  await page.locator("[data-archive-story]").first().waitFor();
  assert.equal(await page.locator("[data-archive-story]").count(), 2);
  await page.getByText(/Yayında · 23 sa/).waitFor();
  await page.getByRole("checkbox", { name: /Süresi dolan hikâyeleri arşivde tut/ }).uncheck();
  await page.getByText(/Kapalı: öne çıkanda olmayan/).waitFor();
  assert.equal(db.archiveEnabled, false);
  await page.locator("[data-archive-story]").last().click();
  await viewer(page).waitFor();
  await viewer(page).getByRole("button", { name: "Diğer işlemler" }).click();
  assert.equal(await viewer(page).getByRole("menuitem", { name: "Yeniden paylaş" }).count(), 1, "reshare offered for an expired story");
});

// 17 — Mesajdaki yanıt kartı: hikâye silinince içerik sızmaz
await scenario("17. Sohbet: hikâyeye yanıt kartı; hikâye silinmişse 'artık mevcut değil'", async ({ page, db }) => {
  const conv = db.addConv("c0000000-0000-4000-8000-0000000000c1", U.bob, { texts: [] });
  const live = db.addStory(U.alice, { text: "Yanıtlanan" });
  const m1 = db.addMessage(conv, U.bob.id, "Süper hikâye");
  Object.assign(m1, { story_id: live.id, is_story_reply: true });
  const m2 = db.addMessage(conv, U.bob.id, "Eskisine yanıt");
  Object.assign(m2, { story_id: null, is_story_reply: true });
  await page.goto(`${BASE}/messages/local?id=${conv}`);
  await page.locator('[data-story-reply-card="ready"]').waitFor();
  await page.locator('[data-story-reply-card="gone"]').waitFor();
  assert.equal(await page.getByText("Hikâye artık mevcut değil.").count(), 1);
  assert.ok((await page.getByText("Hikâyene yanıt verdi").count()) >= 2);
});

// 18 — İngilizce + telefon + koyu tema: etiketler, taşma yok
await scenario("18. İngilizce, 390px, koyu tema: şerit ve görüntüleyici çevrili; yatay taşma yok", async ({ page, db }) => {
  seedTray(db);
  await page.goto(`${BASE}/`);
  await page.getByRole("navigation", { name: "Stories" }).waitFor();
  assert.equal(await overflowFree(page), true);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).getByRole("textbox", { name: "Private reply to the story" }).waitFor();
  await viewer(page).getByRole("button", { name: "React with 🔥" }).waitFor();
  assert.equal(await overflowFree(page), true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/stories-viewer-mobile-en-dark.png` });
}, { viewport: { width: 390, height: 844 }, lang: "en", theme: "dark" });

// 18b — Telefonda görüntüleyici gerçekten tam ekran: tuval görünür alanı tamamen kaplar, yanıt çubuğu tuvalin ÜSTÜNDE (altında ayrı şerit yok), tarayıcı rengi siyaha döner ve kapanınca geri gelir
await scenario("18b. Telefonda tam ekran: tuval ekranı doldurur, yanıt çubuğu üstüne biner, theme-color siyah olur ve geri döner", async ({ page, db }) => {
  seedTray(db);
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().waitFor();
  const before = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).getByRole("textbox", { name: "Hikâyeye özel yanıt" }).waitFor();
  const vp = page.viewportSize();
  const canvas = await viewer(page).locator("[data-story-layer]").first().evaluate((el) => { const r = el.closest(".\\@container").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  assert.ok(canvas.w >= vp.width - 1 && canvas.h >= vp.height - 1, `canvas ${canvas.w}x${canvas.h} fills ${vp.width}x${vp.height}`);
  const bar = await viewer(page).getByRole("textbox", { name: "Hikâyeye özel yanıt" }).boundingBox();
  assert.ok(bar.y + bar.height > canvas.y && bar.y + bar.height <= canvas.y + canvas.h, "reply bar sits over the canvas");
  const during = await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content);
  assert.notEqual(during, before, "browser chrome colour changes while the viewer is open");
  const canvasBg = await viewer(page).locator("[data-story-canvas]").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(during, canvasBg, "chrome colour = the story's own background");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.content), before, "theme-color restored");
  if (process.env.SHOT_DIR) { await page.locator("[data-story-ring]").first().click(); await viewer(page).waitFor(); await page.waitForTimeout(300); await page.screenshot({ path: `${process.env.SHOT_DIR}/stories-fullscreen-mobile.png` }); }
}, { viewport: { width: 390, height: 844 } });

// 18c — Tarayıcı çubuklarının arkası (html/body) gösterilen hikâyenin rengine uyar, hikâye değişince değişir, kapanınca eski hâline döner
await scenario("18c. html/body zemini hikâyenin rengini izler (kobalt → kâğıt → fotoğrafta koyu sahne), kapanınca geri döner", async ({ page, db }) => {
  db.follow(U.alice, U.bob);
  db.addStory(U.bob, { text: "Kobalt", minutesAgo: 30, layout: { v: 1, bg: "cobalt", layers: [layer("Kobalt")] } });
  db.addStory(U.bob, { text: "Kâğıt", minutesAgo: 20, layout: { v: 1, bg: "paper", layers: [layer("Kâğıt", { color: "black" })] } });
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-ring]").first().waitFor();
  const bgOf = () => page.evaluate(() => [getComputedStyle(document.documentElement).backgroundColor, getComputedStyle(document.body).backgroundColor, document.querySelector('meta[name="theme-color"]')?.content]);
  const original = await bgOf();
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).waitFor();
  const canvasBg = () => viewer(page).locator("[data-story-canvas]").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Kobalt");
  await page.waitForTimeout(400);
  const first = await canvasBg();
  assert.deepEqual(await bgOf(), [first, first, first], "html, body and theme-color follow the cobalt story");
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Kâğıt");
  await page.waitForTimeout(400);
  const second = await canvasBg();
  assert.notEqual(second, first, "paper differs from cobalt");
  assert.deepEqual(await bgOf(), [second, second, second], "colour follows the next story");
  await page.keyboard.press("Escape");
  await viewer(page).waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  assert.deepEqual(await bgOf(), original, "page colours restored on close");
}, { viewport: { width: 390, height: 844 } });

// 19 — Misafir: şerit yok; herkese açık hikâye bağlantısı açılır, yanıt için giriş istenir
await scenario("19. Misafir: Ana Sayfa'da şerit yok; herkese açık hikâye açılır, yanıt yerine giriş düğmesi", async ({ page, db }) => {
  const s = db.addStory(U.bob, { text: "Herkese" });
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-story-tray]").count(), 0);
  await page.goto(`${BASE}/stories?id=${s.id}`);
  await viewer(page).waitFor();
  assert.equal(await viewer(page).getByRole("button", { name: "Yanıtlamak için giriş yap" }).count(), 1);
  assert.equal(rpcCalls(db, "mark_story_viewed").length, 0, "guests are not recorded as viewers");
}, { guest: true });

// 20 — Masaüstü düzeni ve ekran görüntüleri
await scenario("20. Masaüstü: kenar okları, tuval 9:16 ortada; oluşturucu iki sütun; açık tema", async ({ page, db }) => {
  seedTray(db);
  await page.goto(`${BASE}/`);
  await page.locator("[data-story-tray]").waitFor();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/stories-home-desktop.png` });
  await page.locator("[data-story-ring]").first().click();
  await viewer(page).waitFor();
  await viewer(page).getByRole("button", { name: "Sonraki hikâye" }).click();
  await page.waitForFunction(() => document.querySelector("[data-story-layer]")?.textContent === "Bob 2");
  const canvas = await viewer(page).locator("[data-story-layer]").first().evaluate((el) => { const r = el.closest(".\\@container").getBoundingClientRect(); return { width: r.width, height: r.height }; });
  assert.ok(Math.abs(canvas.width / canvas.height - 9 / 16) < 0.02, "9:16 canvas");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/stories-viewer-desktop.png` });
  await page.keyboard.press("Escape");
  await page.goto(`${BASE}/stories/create`);
  await page.getByRole("button", { name: /^Metin/ }).click();
  await page.getByRole("button", { name: "Yazı ekle" }).click();
  await page.getByRole("button", { name: "Anket" }).click();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/stories-editor-desktop.png`, fullPage: true });
  assert.equal(await overflowFree(page), true);
});

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
