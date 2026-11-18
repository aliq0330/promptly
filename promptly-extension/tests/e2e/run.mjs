// Uçtan uca (gerçek Chromium + yüklenmiş uzantı + sahte sunucu). `npm test`e girmez; elle: node promptly-extension/tests/e2e/run.mjs
// Gerekir: playwright (global) ve Chromium. OAuth penceresi (launchWebAuthFlow) headless'ta açılamaz: oturum depoya yazılır, OAuth birim testlidir.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMock, startPage } from "./mock-server.mjs";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require(path.join(execSync("npm root -g").toString().trim(), "playwright")); } // repo kuralı: `npm i --no-save playwright` ya da genel kurulum
const { chromium } = pw;
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = process.env.E2E_SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), "ply-e2e-shots-"));
fs.mkdirSync(OUT, { recursive: true });
const mock = await startMock();
const site = await startPage();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ply-e2e-ext-"));
fs.cpSync(SRC, tmp, { recursive: true, filter: (p) => !p.includes(`${path.sep}tests`) });
fs.writeFileSync(path.join(tmp, "config.js"), `self.PROMPTLY_CONFIG = { supabaseUrl: "http://127.0.0.1:${mock.port}", siteUrl: "https://site.example" };\n`);
const mf = JSON.parse(fs.readFileSync(path.join(tmp, "manifest.json"), "utf8"));
mf.host_permissions = ["http://127.0.0.1/*", "https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*", "https://www.perplexity.ai/*", "https://perplexity.ai/*"];
fs.writeFileSync(path.join(tmp, "manifest.json"), JSON.stringify(mf));

const results = [];
const ok = (name) => { results.push(name); console.log("  ✓", name); };
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "ply-e2e-prof-")), {
  headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }), viewport: { width: 1100, height: 800 }, locale: "tr-TR",
  args: [`--disable-extensions-except=${tmp}`, `--load-extension=${tmp}`, "--no-sandbox", "--disable-features=DisableLoadExtensionCommandLineSwitch"],
});
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
const aiHtml = `<!doctype html><meta charset="utf-8"><title>AI</title><body><p id="out">Yapay zekâ çıktısı: gelir %12 arttı.</p><textarea id="prompt-textarea" rows="3" cols="40"></textarea></body>`;
const aiHits = [];
await ctx.route(/^https:\/\/(chatgpt\.com|claude\.ai|gemini\.google\.com|www\.perplexity\.ai|perplexity\.ai)\//, (route) => { const r = route.request(); aiHits.push(r.url()); if (r.resourceType() !== "document") return route.fulfill({ status: 204, body: "" }); route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: aiHtml }); });
const errors = [];
ctx.on("weberror", (e) => errors.push(String(e.error())));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 20000 });
const id = sw.url().split("/")[2];
const live = { clientId: "cid", redirectUri: "r", accessToken: "LIVE", refreshToken: "R1", expiresAt: Date.now() + 3_600_000, scopes: ["read", "write"], user: { username: "aliq" } };
const seed = (auth) => sw.evaluate((a) => PStore.set({ auth: a, queue: [], sent: [], recent: [], lastError: null }), auth);
const tabIdOf = (page) => sw.evaluate(async (url) => (await chrome.tabs.query({})).find((t) => t.url === url).id, page.url());
const pageUrl = `http://127.0.0.1:${site.port}/`;

async function popup() {
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push("popup: " + e.message));
  await p.setViewportSize({ width: 780, height: 600 });
  await p.goto(`chrome-extension://${id}/popup/popup.html`); return p;
}
async function testPage() {
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push("page: " + e.message));
  await p.goto(pageUrl); return p;
}

try {
  // 1) Oturum yok → giriş ekranı (şifre alanı yok, OAuth düğmesi var)
  await seed(null); await sw.evaluate(() => PStore.set({ auth: null }));
  let pop = await popup();
  await pop.waitForSelector("#login:not([hidden])");
  assert.equal(await pop.locator("input[type=password]").count(), 0);
  assert.match(await pop.locator("#connect").innerText(), /Promptly ile bağlan/);
  await pop.screenshot({ path: `${OUT}/1-login.png` }); ok("giriş ekranı: şifre alanı yok, 'Promptly ile bağlan'");

  // 2) Oturum + sabit sekmeler: Ana Sayfa (popüler, sunucuda), Keşfet (arama sunucuda), süzgeçler API'ye gider
  await seed(live); await pop.reload();
  await pop.waitForSelector("#app:not([hidden])");
  assert.equal(await pop.locator("#tabs [role=tab]").count(), 3);
  await pop.waitForSelector("text=Orman perisi karakter");
  assert.ok(await pop.locator(".card").count() >= 2, "görsel kartlar çizilir");
  assert.equal(await pop.locator(".card .art").count() >= 2, true);
  await pop.getByRole("tab", { name: "Keşfet" }).click();
  await pop.fill("#search", "orman"); await pop.waitForSelector("#tab-discover >> text=Keşfet sonucu: orman");
  await pop.locator("#tab-discover .fbar .chip", { hasText: "Görsel" }).click();
  await pop.waitForFunction(() => true); await pop.waitForTimeout(400);
  const lastHit = () => mock.state.hits.filter((h) => h.includes("/api/v1/prompts?")).at(-1);
  assert.match(lastHit(), /content_type=image/);
  await pop.locator("#tab-discover .fbar input.tag").fill("Sinematik Portre"); await pop.waitForSelector("#tab-discover >> text=#sinematik-portre");
  assert.match(lastHit(), /tag=sinematik-portre/);
  await pop.locator("#tab-discover .fbar select.sel").selectOption("midjourney");
  await pop.waitForTimeout(400); assert.match(lastHit(), /tool=midjourney/);
  const nBefore = await pop.locator("#tab-discover .card").count();
  await pop.locator("#tab-discover .fbar .chk", { hasText: "Yalnızca değişkenli" }).locator("input").check();
  await pop.waitForTimeout(300);
  assert.ok(await pop.locator("#tab-discover .card").count() < nBefore, "'yalnız değişkenli' istemcide eler");
  await pop.screenshot({ path: `${OUT}/2-discover.png` }); ok("sabit sekmeler; Ana Sayfa popüler kartlar; Keşfet: arama + tür/etiket/araç süzgeçleri API'ye gider; 'yalnız değişkenli' istemcide");

  // 2b) Görünümlerim: kaydet → kalıcı → uygula → sil; ⚙ ile süzgeç gizle
  await pop.locator("#tab-discover").getByRole("button", { name: "Görünüm olarak kaydet" }).click();
  await pop.locator("#tab-discover .fact input.in").fill("Orman görselleri"); await pop.locator("#tab-discover .fact input.in").press("Enter");
  await pop.waitForSelector("#tab-discover .vpill:has-text('Orman görselleri')");
  assert.equal((await sw.evaluate(() => PStore.get("views"))).length, 1);
  await pop.reload(); await pop.waitForSelector("#app:not([hidden])"); await pop.getByRole("tab", { name: "Keşfet" }).click();
  await pop.waitForSelector("#tab-discover .vpill:has-text('Orman görselleri')");
    await pop.locator("#tab-discover .vapply", { hasText: "Orman görselleri" }).click(); await pop.waitForTimeout(400);
  assert.match(lastHit(), /content_type=image/); assert.match(lastHit(), /tag=sinematik-portre/);
  await pop.locator("#tab-discover .fbar .ico.round").click();
  await pop.locator(".pmenu.custom .chk", { hasText: "Etiket" }).locator("input").uncheck();
  assert.equal(await pop.locator("#tab-discover .fbar input.tag").count(), 0, "kapatılan süzgeç çubuktan kalkar");
  await pop.locator(".pmenu.custom .chk", { hasText: "Etiket" }).locator("input").check();
  await pop.keyboard.press("Escape");
  await pop.locator("#tab-discover .vdel").first().click();
  assert.equal((await sw.evaluate(() => PStore.get("views"))).length, 0);
  ok("Görünümlerim: kaydet/uygula/sil kalıcı; ⚙ süzgeç görünürlüğü");

  // 3) Kütüphane: alt sekmeler, satırlar, bekleyen rozeti
  await pop.fill("#search", ""); await pop.getByRole("tab", { name: /Kütüphane/ }).click();
  await pop.waitForSelector("text=Sisli sabah ormanı");
  assert.ok(await pop.locator(".liblist .lrow").count() >= 2);
  await pop.locator(".chips .chip", { hasText: "Kaydettiklerim" }).click(); await pop.waitForSelector("text=Kaydettiğim prompt");
  await pop.locator(".chips .chip", { hasText: "Taslaklar" }).click(); await pop.waitForSelector("text=Eski taslak");
  await pop.locator(".chips .chip", { hasText: "Benim" }).click(); await pop.waitForSelector("text=Sisli sabah ormanı");
  ok("kütüphane: Benim / Kaydettiklerim / Taslaklar sunucudan");

  // 3b) Ayrıntı bölmesi: değişken doldur → önizleme → kopyala → 'son kullanılan'a yazılır
  await pop.locator(".liblist .ctitle", { hasText: "Sisli sabah ormanı" }).click();
  await pop.waitForSelector(".detailpane .code");
  await pop.locator(".detailpane input.in").fill("kuzey sahili");
  assert.match(await pop.locator(".detailpane .code.resolved").innerText(), /kuzey sahili atmosferi/);
  await pop.locator(".detailpane").getByRole("button", { name: "Kopyala", exact: true }).click();
  await pop.waitForSelector(".toast");
  const clip = await pop.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  if (clip) assert.match(clip, /kuzey sahili atmosferi/);
  assert.equal((await sw.evaluate(() => PStore.get("recent")))[0].id, "m1");
  await pop.screenshot({ path: `${OUT}/3-detail.png` }); ok("ayrıntı: değişken doldurulur, önizleme canlı, kopyalanır, 'son kullanılan'a yazılır");
  await pop.keyboard.press("Escape");

  // 3c) Slot: sabitle → çubukta görünür → 1 tuşu çalıştırır; toplu seçim + JSON dışa aktarma
  await pop.locator(".liblist .ctitle", { hasText: "Haftalık bülten özeti" }).click();
  await pop.waitForSelector(".detailpane .code");
  await pop.locator(".detailpane").getByRole("button", { name: "Slota sabitle" }).click();
  await pop.keyboard.press("Escape");
  await pop.waitForSelector(".slotsbar .slot.on:has-text('Haftalık bülten özeti')");
  assert.equal((await sw.evaluate(() => PStore.get("slots"))).length, 1);
  const dl = pop.waitForEvent("download");
  await pop.locator(".liblist .lrow input[type=checkbox]").first().check();
  await pop.waitForSelector(".bulkbar");
  await pop.getByRole("button", { name: "JSON dışa aktar" }).click();
  const file = JSON.parse(fs.readFileSync(await (await dl).path(), "utf8"));
  assert.equal(file.format, "promptly.prompts"); assert.equal(file.items.length, 1);
  assert.ok(file.items[0].promptText.includes("{"), "değişkenli metin dosyaya yazılır");
  ok("slot sabitleme kalıcı; toplu seçimde 'promptly.prompts' JSON indirilir");

  // 4) Taslaklar (Bekleyen rozeti ayrı sekmede değil, Kütüphane içinde)
  ok("taslaklar kütüphane içinde");

  // 5) Yakalama kartı: [mekan] → {mekan}, kaynak/atıf, araç, etiket → 6 sn sonra TEK istek
  const pg = await testPage();
  await sw.evaluate(async ([tabId, url]) => inject(tabId, { type: "ply:capture", text: "Sisli bir sabah ormanında yürüyen kız, [mekan] atmosferi, 35mm", pageUrl: url, pageTitle: "Orman promptları" }), [await tabIdOf(pg), pageUrl]);
  await pg.waitForSelector("[data-promptly] .card");
  assert.equal(await pg.locator("[data-promptly] textarea").inputValue(), "Sisli bir sabah ormanında yürüyen kız, {mekan} atmosferi, 35mm");
  await pg.locator("[data-promptly] .chip", { hasText: "Görsel" }).first().click();
  await pg.locator("[data-promptly] .chip", { hasText: "Midjourney" }).click();
  const tagIn = pg.locator("[data-promptly] input.in").last(); await tagIn.fill("Sinematik"); await tagIn.press("Enter");
  await pg.screenshot({ path: `${OUT}/3-capture.png` });
  await pg.locator("[data-promptly] button", { hasText: "Taslak olarak kaydet" }).click();
  await pg.waitForSelector("[data-promptly] >> text=Taslağa gönderilecek");
  assert.equal(mock.state.posts.length, 0, "bekletme süresinde hiçbir şey gönderilmemeli");
  await pg.screenshot({ path: `${OUT}/4-held.png` });
  await pg.waitForSelector("[data-promptly] >> text=Taslağa kaydedildi", { timeout: 20000 });
  assert.equal(mock.state.posts.length, 1);
  const item = mock.state.posts[0].items[0];
  assert.equal(item.contentType, "image"); assert.deepEqual(item.tools, ["midjourney"]); assert.deepEqual(item.tags, ["sinematik"]);
  assert.equal(item.variables[0].name, "mekan"); assert.equal(item.source.url, pageUrl); assert.match(item.source.credit, /127\.0\.0\.1 — Orman promptları/);
  assert.equal(await pg.locator("[data-promptly] a", { hasText: "Sitede aç" }).getAttribute("href"), "https://site.example/create/?edit=new-1");
  await pg.screenshot({ path: `${OUT}/5-saved.png` }); ok("yakalama: otomatik {mekan}, araç, etiket, kaynak/atıf; 6 sn bekletme sonrası tek POST; 'Sitede aç' bağlantısı");

  // 6) Geri al: bekletme sırasında geri alınırsa hiçbir şey gönderilmez
  const before = mock.state.posts.length;
  await sw.evaluate(async ([tabId, url]) => inject(tabId, { type: "ply:capture", text: "Geri alınacak prompt", pageUrl: url, pageTitle: "x" }), [await tabIdOf(pg), pageUrl]);
  await pg.locator("[data-promptly] button", { hasText: "Taslak olarak kaydet" }).click();
  await pg.locator("[data-promptly] button", { hasText: "Geri al" }).click();
  await pg.waitForSelector("[data-promptly] >> text=Geri alındı");
  await pg.waitForTimeout(7500);
  assert.equal(mock.state.posts.length, before);
  assert.equal((await sw.evaluate(() => PStore.get("queue"))).length, 0);
  ok("'Geri al': hiçbir şey gönderilmez, kuyruk boş");

  // 7) Görsel yakalama: https görsel → media-upload; http görsel → uyarı, görselsiz taslak
  await sw.evaluate(async ([tabId, url]) => inject(tabId, { type: "ply:capture", text: "", imageUrl: "https://cdn.example.test/forest.png", pageUrl: url, pageTitle: "Orman" }), [await tabIdOf(pg), pageUrl]);
  await pg.waitForSelector("[data-promptly] >> text=Görsel (1)");
  await pg.locator("[data-promptly] textarea").fill("Orman görseli için prompt");
  await pg.locator("[data-promptly] button", { hasText: "Taslak olarak kaydet" }).click();
  await pg.waitForSelector("[data-promptly] >> text=Taslağa kaydedildi", { timeout: 20000 });
  assert.equal(mock.state.media.length, 1); assert.deepEqual(mock.state.media[0], { prompt_id: "new-" + mock.state.posts.length, image_url: "https://cdn.example.test/forest.png", alt: "Orman" });
  await pg.keyboard.press("Escape");
  await sw.evaluate(async ([tabId, url]) => inject(tabId, { type: "ply:capture", text: "", imageUrl: "http://insecure.example/a.png", pageUrl: url, pageTitle: "x" }), [await tabIdOf(pg), pageUrl]);
  await pg.waitForSelector("[data-promptly] >> text=yüklenemez");
  await pg.keyboard.press("Escape");
  ok("görsel: https → media-upload çağrılır; http → uyarı");

  // 8) Palet: kaynak, arama, değişken, Enter ile metin kutusuna ekle
  await pg.locator("#chat").click();
  await sw.evaluate(async (tabId) => inject(tabId, { type: "ply:palette" }), await tabIdOf(pg));
  await pg.waitForSelector("[data-promptly] .pal");
  await pg.locator("[data-promptly] .chip", { hasText: "Popüler" }).click();
  await pg.waitForSelector("[data-promptly] .it >> text=Orman perisi karakter");
  await pg.waitForSelector("[data-promptly] .code >> text=Işıldayan");
  await pg.screenshot({ path: `${OUT}/6-palette.png` });
  await pg.locator("[data-promptly] .right input.in").fill("kırmızı");
  await pg.locator("[data-promptly] input.in").first().press("Enter");
  await pg.waitForSelector("[data-promptly] >> text=Metin kutusuna eklendi");
  assert.equal(await pg.locator("#chat").inputValue(), "Işıldayan kanatlı bir orman perisi, kırmızı tonlarında");
  ok("palet: popüler kaynak, değişken doldurma, Enter ile odaktaki metin kutusuna ekleme");

  // 9) "/" ile aç: yalnız izin verilen sitede; alan boşken; Esc "/" yazar
  await pg.reload();
  await pg.locator("#plain").click(); await pg.keyboard.press("/");
  assert.equal(await pg.locator("#plain").inputValue(), "/", "izin yokken '/' normal yazılır");
  await pg.locator("#plain").fill("");
  // permissions.request kullanıcı hareketi ister: gerçek (güvenilir) tıklama ile popup sayfasından çağrılır.
  const holder = await popup();
  const pending = holder.evaluate((origin) => new Promise((resolve) => document.body.addEventListener("click", async () => resolve(await PSlash.enable(origin)), { once: true })), new URL(pageUrl).origin);
  await holder.locator("body").click({ position: { x: 5, y: 5 } });
  assert.equal(await pending, true);
  assert.equal(await sw.evaluate((o) => PSlash.isEnabled(o), new URL(pageUrl).origin), true);
  await holder.close();
  await pg.reload(); await pg.waitForTimeout(800);
  await pg.locator("#plain").click(); await pg.keyboard.press("/");
  await pg.waitForSelector("[data-promptly] .pal");
  assert.equal(await pg.locator("#plain").inputValue(), "", "palet açıkken '/' alana yazılmaz");
  await pg.keyboard.press("Escape");
  assert.equal(await pg.locator("#plain").inputValue(), "/", "Esc ile '/' geri yazılır");
  await pg.locator("#plain").fill("kelime/");
  await pg.keyboard.press("End"); await pg.keyboard.press("/");
  assert.equal(await pg.locator("[data-promptly]").count(), 0, "kelimenin ortasında/ardında tetiklenmez");
  await sw.evaluate((origin) => PSlash.disable(origin), new URL(pageUrl).origin);
  assert.equal(await sw.evaluate((o) => PSlash.isEnabled(o), new URL(pageUrl).origin), false);
  ok("'/' tetikleyici: izinsiz kapalı, izinle açık, boş alanda palet, Esc '/' yazar, kelime ortasında tetiklenmez, kapatılabilir");

  // 10) Kalıcı hata (geçersiz) öğesi kuyruğu durdurmaz; sorunlu liste + tekrar dene
  await seed(live);
  await sw.evaluate(async () => { await PQueue.enqueue({ title: "BOZUK 1", text: "a", type: "text", tools: [], tags: [], origin: "own" }, Date.now() - 100000); await PQueue.enqueue({ title: "İyi", text: "b", type: "text", tools: [], tags: [], origin: "own" }, Date.now() - 100000); });
  const n0 = mock.state.posts.length;
  await sw.evaluate(() => flushNow());
  assert.equal(mock.state.posts.length, n0 + 1, "bozuktan sonraki öğe gitmeli");
  const q = await sw.evaluate(() => PStore.get("queue")); assert.equal(q.length, 1); assert.equal(q[0].state, "failed");
  pop = await popup(); await pop.getByRole("tab", { name: /Kütüphane/ }).click(); await pop.locator(".chips .chip", { hasText: "Bekleyen" }).click();
  await pop.waitForSelector("text=Gönderilemedi"); await pop.waitForSelector("text=Promptly bu kaydı kabul etmedi");
  await pop.screenshot({ path: `${OUT}/7-failed.png`, fullPage: true }); ok("kalıcı hata: öğe 'Gönderilemedi' olur, kuyruk devam eder, sebep gösterilir");
  await sw.evaluate(() => PStore.set({ queue: [] }));

  // 11) Geçici hata (sunucu 503): öğe kuyrukta kalır, durum bandı; sunucu düzelince gönderilir
  mock.state.down = true;
  await sw.evaluate(async () => { await PQueue.enqueue({ title: "Sonra", text: "c", type: "text", tools: [], tags: [], origin: "own" }, Date.now() - 100000); await flushNow(); });
  assert.equal((await sw.evaluate(() => PStore.get("queue"))).length, 1);
  await pop.reload(); await pop.waitForSelector("#status:not([hidden])");
  assert.match(await pop.locator("#status").innerText(), /Sunucu şu an yanıt vermiyor|Tekrar dene/);
  await pop.screenshot({ path: `${OUT}/8-server-down.png` });
  mock.state.down = false; const n1 = mock.state.posts.length;
  await sw.evaluate(() => flushNow());
  assert.equal(mock.state.posts.length, n1 + 1); assert.equal((await sw.evaluate(() => PStore.get("queue"))).length, 0);
  ok("geçici hata: kuyrukta bekler, bant gösterir, düzelince kendiliğinden gider");

  // 12) Yazma izni yok → bant + hiçbir yazma denenmez/erişim reddi sınıflanır
  mock.state.scopes = ["read"];
  await seed({ ...live, scopes: ["read"] }); await pop.reload();
  await pop.waitForSelector("#status:not([hidden])"); assert.match(await pop.locator("#status").innerText(), /Yazma izni yok/);
  await pop.screenshot({ path: `${OUT}/9-needs-write.png` }); ok("yazma izni yokken bant 'Yeniden bağlan' sunar");
  mock.state.scopes = ["read", "write"];

  // 13) Yan panel: Şimdi (son kullanılan + siteye bağlantı), kütüphane
  await seed(live); await sw.evaluate(() => PLib.markUsed({ id: "m1", title: "Sisli sabah ormanı", type: "image", source: "mine", url: "https://site.example/prompts/local?id=m1" }));
  const side = await ctx.newPage(); side.on("pageerror", (e) => errors.push("side: " + e.message)); await side.setViewportSize({ width: 360, height: 760 });
  await side.goto(`chrome-extension://${id}/sidepanel/sidepanel.html`);
  await side.waitForSelector("text=Sisli sabah ormanı");
  assert.equal(await side.locator("#voteLink").getAttribute("href"), "https://site.example/prompts/local?id=m1");
  await side.screenshot({ path: `${OUT}/10-sidepanel.png` }); ok("yan panel: son kullanılan + sitede oy/sonuç bağlantısı");

  // 13b) Çalıştır — gerçek yazma (host izniyle), adres yolu, hedef seçici, arayüzden çalıştırma
  // Uzantının açtığı sekmelerin adresi (ağ yanıtına değil, açılış adresine bakılır; sandbox'ta dış ağ güvenilmez)
  await sw.evaluate(() => { self.__opened = []; chrome.tabs.onCreated.addListener((t) => self.__opened.push(t.pendingUrl || t.url || "")); chrome.tabs.onUpdated.addListener((_id, ch) => { if (ch.url) self.__opened.push(ch.url); }); });
  const openedHas = async (pred) => { for (let i = 0; i < 30; i++) { const l = await sw.evaluate(() => self.__opened.slice()); const hit = l.find(pred); if (hit) return hit; await new Promise((r) => setTimeout(r, 200)); } return null; };
  const chat = await ctx.newPage(); chat.on("pageerror", (e) => errors.push("chat: " + e.message)); await chat.goto("https://chatgpt.com/");
  const chatTab = await tabIdOf(chat);
  const runPop = await popup();
  const viaTab = (url, tabId) => ({ tabs: { query: async () => [{ id: tabId, url }], create: (o) => chrome.tabs.create(o) }, scripting: chrome.scripting });
  const r1 = await runPop.evaluate(async ([tabId]) => { const d = { tabs: { query: async () => [{ id: tabId, url: "https://chatgpt.com/" }], create: (o) => chrome.tabs.create(o) }, scripting: chrome.scripting }; return PPlatforms.run("chatgpt", "Merhaba dünya", d); }, [chatTab]);
  assert.equal(r1.mode, "insert"); assert.equal(r1.ok, true);
  assert.equal(await chat.locator("#prompt-textarea").inputValue(), "Merhaba dünya");
  await runPop.evaluate(async ([tabId]) => PPlatforms.run("chatgpt", "ikinci", { tabs: { query: async () => [{ id: tabId, url: "https://chatgpt.com/" }], create: (o) => chrome.tabs.create(o) }, scripting: chrome.scripting }), [chatTab]);
  assert.equal(await chat.locator("#prompt-textarea").inputValue(), "Merhaba dünya\n\nikinci", "mevcut yazı silinmez, sonuna eklenir");
  const r2 = await runPop.evaluate(() => PPlatforms.run("perplexity", "kedi nedir"));
  assert.equal(r2.mode, "open");
  assert.ok(await openedHas((u) => u === "https://www.perplexity.ai/search?q=kedi%20nedir"), "adresle yeni sekme açıldı");
  await runPop.close();
  ok("Çalıştır: açık sekmeye gerçekten yazar (sonuna ekler), başka hedefte adresle yeni sekme açar");

  const rp = await popup(); await rp.waitForSelector("text=Orman perisi karakter");
  assert.equal(await rp.locator("#target option").count(), 4);
  await rp.locator(".card", { hasText: "Orman perisi karakter" }).locator(".hbtn.pri").click({ force: true });
  assert.ok(await openedHas((u) => u.startsWith("https://chatgpt.com/?q=") && u.includes(encodeURIComponent("Işıldayan kanatlı bir orman perisi, mavi tonlarında"))), "kartın Çalıştır düğmesi varsayılan değerlerle ChatGPT'yi açar");
  assert.equal((await sw.evaluate(() => PStore.get("recent")))[0].id, "p1");
  await rp.selectOption("#target", "claude");
  assert.equal(await sw.evaluate(() => PStore.get("platform")), "claude");
  await rp.locator(".card", { hasText: "Orman perisi karakter" }).locator(".hbtn.pri").click({ force: true });
  assert.ok(await openedHas((u) => u.startsWith("https://claude.ai/new?q=")), "hedef seçici Claude'a çevirir");
  // bölünmüş düğme: ayrıntıda ▾ menüsü yöntemleri yazar ve hedefi hatırlar
  await rp.locator(".card", { hasText: "Orman perisi karakter" }).locator(".ctitle").click();
  await rp.waitForSelector(".detailpane .split");
  await rp.locator(".detailpane .splitchev").click();
  await rp.waitForSelector(".pmenu .pitem");
  assert.equal(await rp.locator(".pmenu .pitem").count(), 4);
  assert.match(await rp.locator(".pmenu").innerText(), /Kopyalar ve yeni sekmede açar/, "Gemini: adres parametresi yok → kopyala + aç");
  await rp.screenshot({ path: `${OUT}/11-run-menu.png` });
  await rp.locator(".pmenu .pitem", { hasText: "Perplexity" }).click();
  assert.ok(await openedHas((u) => u.startsWith("https://www.perplexity.ai/search?q=") && u.includes("orman")), "▾ menüsünden seçilen hedef hemen çalıştırılır");
  assert.equal(await sw.evaluate(() => PStore.get("platform")), "perplexity");
  await rp.close();
  ok("Çalıştır arayüzü: kart düğmesi, hedef seçici, ▾ menüsü (yöntem satırları) ve hedefi hatırlama");

  // 13c) Yan panel bağlamı: açık sekme ChatGPT → tanınır, seçili metin okunur, uygun prompt "Yaz" ile açık sekmeye yazılır
  await chat.bringToFront();
  await chat.locator("#prompt-textarea").fill("");
  await chat.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById("out")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
  const ctxRead = await side.evaluate(async () => { const c = await PContext.read(); return { platform: c.platform && c.platform.id, selection: c.selection, granted: c.granted }; });
  assert.equal(ctxRead.platform, "chatgpt"); assert.match(ctxRead.selection, /gelir %12 arttı/); assert.equal(ctxRead.granted, true);
  await side.evaluate(() => { ctxSig = ""; return renderContext(); });
  await side.waitForSelector("#ctx >> text=ChatGPT'desin");
  await side.waitForSelector("#ctx .quote");
  await side.waitForSelector("#ctx >> text=ChatGPT özet promptu");
  await side.screenshot({ path: `${OUT}/12-context.png` });
  await side.evaluate(async () => { const c = await PContext.read(); const items = ctxSuggest.get("chatgpt"); return PRunUI.runItem(items[0], { selection: c.selection, platformId: "chatgpt" }); });
  await chat.waitForFunction(() => document.getElementById("prompt-textarea").value.includes("gelir %12 arttı"));
  assert.match(await chat.locator("#prompt-textarea").inputValue(), /^Şunu üç maddede özetle: Yapay zekâ çıktısı: gelir %12 arttı\./);
  ok("yan panel bağlamı: ChatGPT tanınır, seçili metin okunur, {seçim} değişkenine yazılıp açık sekmeye eklenir");
  await chat.close();

  // 14) Güvenlik: sayfaya enjekte edilen (içerik betiği) bağlam depoya/belirtece ERİŞEMEZ (setAccessLevel TRUSTED_CONTEXTS)
  const denied = await sw.evaluate(async (tabId) => {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: async () => { try { await chrome.storage.local.get("auth"); return "READ"; } catch (e) { return "DENIED: " + e.message; } } });
    return r.result;
  }, await tabIdOf(pg));
  assert.match(denied, /^DENIED/, "içerik betiği depoyu okuyabiliyor: " + denied);
  ok("içerik betiği chrome.storage'a erişemez (belirteçler arka planda kalır)");

  assert.deepEqual(errors, [], "sayfa/uzantı hataları: " + errors.join(" | "));
  ok("konsolda yakalanmamış hata yok");
  console.log(`\n${results.length} senaryo geçti. Ekran görüntüleri: ${OUT}`);
} catch (e) {
  console.error("\nBAŞARISIZ:", e.message); console.error(e.stack?.split("\n").slice(0, 6).join("\n")); console.error("hata kayıtları:", errors);
  process.exitCode = 1;
} finally { await ctx.close(); mock.close(); site.close(); }
