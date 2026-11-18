// Canlı bildirim kartı (docs/history/434-*), ağ taklitli: sitedeyken Realtime `notifications` INSERT'i gelince üst köşede kısa önizleme kartı, kendiliğinden kapanma
// (5 sn, üstüne gelince durur), aynı içeriğe gelenlerin birleşmesi, en çok 3 kart, hızlı eylemler (Yanıtla / Takip et), kapatma/açma, gösterilmeme kuralları
// (bildirimler sayfası, zil paneli, o sohbet, haftalık özet, ertelenmiş), Ayarlar → Bildirimler anahtarı, telefon (üstten iner, yukarı kaydır, dokun), İngilizce,
// hareketi azalt. Gerçek Supabase'e / Realtime'a / cihaza KARŞI DENENMEDİ: Realtime `realtime-hub.mjs` ile taklit edilir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const BASE = "http://localhost:4205/promptly";
const server = await serve(4205);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const P1 = "a1000000-0000-4000-8000-000000000001";
const C1 = "c1000000-0000-4000-8000-000000000001";
const CONV = "c0000000-0000-4000-8000-0000000000c1";

let seq = 0;
/** Sunucunun `notifications` satırı (Realtime INSERT yükü). */
const rec = (type, actor, message, href, extra = {}) => ({
  id: `n${++seq}`, recipient_id: ME, type, actor_id: actor?.id ?? null, message, target_href: href,
  is_read: false, created_at: new Date().toISOString(), reaction: null, dedupe_key: null, snoozed_until: null, ...extra,
});
const comment = (actor = U.dave) => rec("comment", actor, 'Paylaşımına yorum yaptı: "Işık kontrolü harika"', `/prompts/local?id=${P1}&hl=comment:${C1}`);
const like = (actor, reaction = "love") => rec("like", actor, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, { reaction });
const follow = (actor = U.zed) => rec("follow", actor, "Seni takip etmeye başladı.", "/profile/real?username=zed");
const msg = (actor = U.bob) => rec("message", actor, 'Sana mesaj gönderdi: "Selam!"', `/messages/local?id=${CONV}`);

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", reducedMotion = "no-preference", setup, pref } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { calls: [] };
  db.rpc.notifications_unread_group_count = () => ({ body: 0 });
  db.rpc.notifications_snooze_summary = () => ({ body: [{ snoozed_groups: 0, next_wake: null }] });
  db.rpc.notifications_grouped_page = () => ({ body: [] });
  db.rpc.notifications_unread_by_category = () => ({ body: [] });
  db.rpc.notifications_group_mark_read = (b) => { state.calls.push(["mark_read", b.p_key]); return { body: 1 }; };
  db.extraRoutes = async ({ table, method, rows: rowsOf, json, body, q }) => {
    // `fetchIsFollowing`: `select following_id … follower_id=eq.X & following_id=in.(…)` (mock.mjs'in genel follows okuması bu biçimi döndürmez).
    if (table === "follows" && method === "GET" && q.get("select") === "following_id") {
      const ids = (q.get("following_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").map((x) => x.replace(/"/g, ""));
      return rowsOf(db.follows.filter((f) => f.follower_id === ME && ids.includes(f.following_id)).map((f) => ({ following_id: f.following_id })));
    }
    if (table === "notification_mutes" && method === "GET") return rowsOf([]);
    if (table === "notification_type_prefs" && method === "GET") return rowsOf([]);
    if (table === "follows" && method === "POST") { db.follows.push({ follower_id: body.follower_id, following_id: body.following_id }); state.calls.push(["follow", body.following_id]); return json(201, {}); }
    return false;
  };
  setup?.(db, state);
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, reducedMotion });
  await installMock(context, db, {});
  await hub.install(context, ME);
  await context.addInitScript(([l, p]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); if (p) localStorage.setItem("promptly-live-toasts", p); } catch {} }, [lang, pref]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DEBUG) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 300)));
  try { await fn({ page, db, state, hub }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ltfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const emit = (hub, record) => hub.emitPostgresChange("notifications", "INSERT", record);
const toasts = (page) => page.locator("[data-live-toast]:not(.live-toast-slot[data-leaving] *)");
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.waitForTimeout(450).then(() => page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` })); };
/** Sayfa açılır, bildirim kanalı bağlanana kadar beklenir (ilk olay kaybolmasın). */
async function ready(page, hub, path = "/") {
  await page.goto(`${BASE}${path}`);
  await page.locator("[data-notification-bell], a[href*='/notifications']").first().waitFor();
  const start = Date.now();
  while (Date.now() - start < 6000 && !hub.joinedTopics(ME).some((t) => t.includes("notifications:"))) await new Promise((r) => setTimeout(r, 40));
  assert.ok(hub.joinedTopics(ME).some((t) => t.includes("notifications:")), "bildirim kanalı bağlandı");
}
async function until(fn, message = "koşul gerçekleşmedi", ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  assert.ok(await fn(), message);
}
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Bilgisayar: yorum bildirimi gelince sağ üstte, üst çubuğun altında kart çıkar (kişi kalın, cümle, alıntı, Yanıtla, çizgi)", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  const host = page.locator("[data-live-toasts]");
  assert.equal(await host.getAttribute("data-live-toasts"), "desk");
  assert.equal(await host.getAttribute("aria-live"), "polite");
  assert.equal(await host.getAttribute("aria-label"), "Canlı bildirimler");
  const text = await toast.textContent();
  assert.match(text, /Dave/);
  assert.match(text, /yorum yaptı/);
  assert.match(text, /Işık kontrolü harika/, "alıntı önizlemesi");
  assert.match(text, /şimdi/);
  assert.ok(!/yorum yaptı: /.test(text), "başlıkta alıntı tekrarlanmaz");
  assert.equal(await toast.locator("strong, .font-semibold").first().textContent().then((s) => s.trim()), "Dave");
  await toast.locator("[data-action=reply]").waitFor();
  await toast.locator("[data-live-toast-bar]").waitFor({ state: "attached" });
  await page.waitForTimeout(450);
  const box = await toast.boundingBox();
  const vw = page.viewportSize().width;
  assert.ok(box.y >= 64, `üst çubuğun altında (y=${box.y})`);
  assert.ok(vw - (box.x + box.width) <= 40 && vw - (box.x + box.width) >= 8, "sağ kenara yaslı");
  assert.ok(box.width >= 300 && box.width <= 360, `kart genişliği ${box.width}`);
  await shot(page, "desk");
});

await scenario("2. Kendiliğinden kapanır (≈5 sn), gelen kutusu etkilenmez; üstüne gelince süre durur, çekilince devam eder", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  await toast.hover();
  await page.waitForTimeout(5800);
  assert.equal(await page.locator("[data-live-toast]").count(), 1, "üstündeyken kapanmadı");
  await page.mouse.move(5, 500);
  await page.locator("[data-live-toast]").waitFor({ state: "detached", timeout: 8000 });
  assert.equal(await page.locator("[data-live-toasts]").count(), 0, "kart kalmayınca kapsayıcı da kalkar");
});

await scenario("3. Aynı içeriğe gelen beğeniler tek kartta birleşir ('Dave, Amy ve 1 kişi daha'), süre yeniden başlar, tepki rozeti", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, like(U.bob, "fire"));
  await page.locator("[data-live-toast]").first().waitFor();
  assert.match(await page.locator("[data-live-toast]").first().textContent(), /Bob/);
  emit(hub, like(U.amy));
  await until(async () => /Amy ve Bob/.test((await page.locator("[data-live-toast]").first().textContent()) ?? ""), "iki kişi birleşti");
  emit(hub, like(U.dave));
  await until(async () => /Dave, Amy ve 1 kişi daha/.test((await page.locator("[data-live-toast]").first().textContent()) ?? ""), "üç kişi birleşti");
  assert.equal(await page.locator("[data-live-toast]").count(), 1, "tek kart");
  assert.match(await page.locator("[data-live-toast]").first().textContent(), /beğendi/);
});

await scenario("4. En çok 3 kart: dördüncüsü gelince en eskisi kapanır, kalanlar yukarı kayar", async ({ page, hub }) => {
  await ready(page, hub);
  for (const a of [U.bob, U.carol, U.dave, U.amy]) { emit(hub, comment(a)); await page.waitForTimeout(120); }
  await until(async () => (await toasts(page).count()) === 3, "üç canlı kart");
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-live-toast]").count(), 3, "en eskisi DOM'dan kalktı");
  const names = await page.locator("[data-live-toast]").evaluateAll((els) => els.map((e) => e.textContent));
  assert.ok(!/Bob/.test(names[0]) && /Carol/.test(names[0]) && /Amy/.test(names[2]), `sıra eskiden yeniye: ${names.map((n) => n.slice(0, 8))}`);
});

await scenario("5. Kapat (✕, hover'da görünür) kartı kaldırır; Esc de kapatır; kapanan kart gelen kutusuna dokunmaz", async ({ page, hub, state }) => {
  await ready(page, hub);
  emit(hub, comment());
  emit(hub, comment(U.carol));
  await until(async () => (await page.locator("[data-live-toast]").count()) === 2);
  const first = page.locator("[data-live-toast]").first();
  await first.hover();
  await first.locator("[data-action=close]").click();
  await until(async () => (await page.locator("[data-live-toast]").count()) === 1, "ilk kart kapandı");
  const second = page.locator("[data-live-toast]").first();
  await second.focus();
  await page.keyboard.press("Escape");
  await page.locator("[data-live-toast]").waitFor({ state: "detached" });
  assert.deepEqual(state.calls, [], "kapatmak hiçbir şey yazmadı");
});

await scenario("6. Karta dokununca bildirim okundu olur ve hedef sayfa açılır; Yanıtla bildirim ayrıntısına götürür", async ({ page, hub, state }) => {
  await ready(page, hub);
  const r = comment();
  emit(hub, r);
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  await toast.locator("[data-action=reply]").click();
  await page.waitForURL(/\/notifications\/?\?n=/);
  assert.ok(decodeURIComponent(page.url()).includes(`n|${r.id}`), "kart anahtarı adreste");
  assert.ok(state.calls.some((c) => c[0] === "mark_read" && c[1] === `n|${r.id}`), "okundu");
  await page.goto(`${BASE}/`);
  await ready(page, hub);
  const l = like(U.bob);
  emit(hub, l);
  await page.locator("[data-live-toast]").first().click({ position: { x: 20, y: 20 } });
  await page.waitForURL(/\/prompts\/local\/?\?id=/);
  assert.ok(state.calls.some((c) => c[0] === "mark_read" && c[1] === `like|${l.target_href}`), "grup anahtarıyla okundu");
});

await scenario("7. Takip bildirimi: 'Takip et' takip eder, kart kapanır; zaten takip ediliyorsa düğme çıkmaz", async ({ page, hub, state, db }) => {
  await ready(page, hub);
  emit(hub, follow(U.zed));
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  await toast.locator("[data-action=follow]").click();
  await until(() => state.calls.some((c) => c[0] === "follow" && c[1] === U.zed.id), "takip yazıldı");
  await page.locator("[data-live-toast]").waitFor({ state: "detached" });
  db.follows.push({ follower_id: ME, following_id: U.erin.id });
  emit(hub, follow(U.erin));
  await page.locator("[data-live-toast]").first().waitFor();
  assert.equal(await page.locator("[data-live-toast] [data-action=follow]").count(), 0, "zaten takip ediliyor");
});

await scenario("8. Gösterilmeme kuralları: bildirimler sayfası, açık zil paneli, haftalık özet, ertelenmiş, okunmuş", async ({ page, hub }) => {
  await ready(page, hub, "/notifications");
  emit(hub, comment());
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0, "bildirimler sayfasında yok");
  await page.goto(`${BASE}/`);
  await ready(page, hub);
  await page.locator("[data-notification-bell]").click();
  await page.locator("[data-notification-popover]").waitFor();
  emit(hub, comment(U.carol));
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0, "zil paneli açıkken yok");
  await page.keyboard.press("Escape");
  await page.locator("[data-notification-popover]").waitFor({ state: "detached" });
  emit(hub, rec("system", null, "Bu haftaki özetin hazır.", "/insights", { dedupe_key: "weekly:2026-46" }));
  emit(hub, comment(U.amy) && { ...comment(U.amy), snoozed_until: new Date(Date.now() + 3600e3).toISOString() });
  emit(hub, { ...comment(U.dave), is_read: true });
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0, "özet/ertelenmiş/okunmuş için yok");
  emit(hub, comment(U.erin));
  await page.locator("[data-live-toast]").first().waitFor();
});

await scenario("9. Mesaj: o sohbetteyken kart çıkmaz, başka sayfadayken çıkar ve 'Yanıtla' sohbeti açar", async ({ page, hub, db }) => {
  db.addConv(CONV, U.bob, { status: "accepted" });
  await ready(page, hub, `/messages/local?id=${CONV}`);
  emit(hub, msg());
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0, "açık sohbetteyken yok");
  await page.goto(`${BASE}/discover`);
  await ready(page, hub, "/discover");
  emit(hub, msg());
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  assert.match(await toast.textContent(), /Bob/);
  assert.match(await toast.textContent(), /Selam!/);
  await toast.locator("[data-action=reply]").click();
  await page.waitForURL(/\/messages\/local\/?\?id=/);
});

await scenario("10. Ayarlar → Bildirimler anahtarı: kapatınca kart çıkmaz (bildirim yine gelir), açınca yeniden çıkar; tercih cihazda saklanır", async ({ page, hub }) => {
  await ready(page, hub, "/settings/notifications");
  const sw = page.locator("[data-pref=live-toasts]");
  await sw.waitFor();
  assert.equal(await sw.getAttribute("aria-checked"), "true", "varsayılan açık");
  await sw.click();
  assert.equal(await sw.getAttribute("aria-checked"), "false");
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-live-toasts")), "off");
  emit(hub, comment());
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0, "kapalıyken kart yok");
  await page.reload();
  await ready(page, hub, "/settings/notifications");
  assert.equal(await page.locator("[data-pref=live-toasts]").getAttribute("aria-checked"), "false", "yenilemede kapalı kaldı");
  await page.locator("[data-pref=live-toasts]").click();
  assert.equal(await page.evaluate(() => localStorage.getItem("promptly-live-toasts")), null, "açınca anahtar silinir");
  emit(hub, comment(U.carol));
  await page.locator("[data-live-toast]").first().waitFor();
});

await scenario("11. Kapalıyken ekrandaki kart anında kalkar (anahtar başka sekmeden de değişir)", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  await page.locator("[data-live-toast]").first().waitFor();
  await page.evaluate(() => { localStorage.setItem("promptly-live-toasts", "off"); window.dispatchEvent(new StorageEvent("storage", { key: "promptly-live-toasts", newValue: "off" })); });
  await page.locator("[data-live-toast]").waitFor({ state: "detached" });
});

await scenario("12. Tercih kapalı başlarsa hiç kart çıkmaz", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  await page.waitForTimeout(700);
  assert.equal(await page.locator("[data-live-toast]").count(), 0);
}, { pref: "off" });

await scenario("13. Telefon: üstten iner (üst çubuğu örter), ✕ ve eylem düğmesi yok, yukarı kaydırınca kapanır, taşma yok", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  await page.waitForTimeout(450);
  assert.equal(await page.locator("[data-live-toasts]").getAttribute("data-live-toasts"), "phone");
  const box = await toast.boundingBox();
  assert.ok(box.y < 24 && box.y >= 0, `üstte (y=${box.y})`);
  assert.ok(box.x >= 6 && box.x + box.width <= 390 - 6, "yanlardan 8px içeride");
  assert.equal(await toast.locator("[data-action=close], [data-action=reply]").count(), 0, "telefonda düğme yok");
  assert.ok(await overflowFree(page), "yatay taşma yok");
  await shot(page, "phone");
  await page.mouse.move(box.x + 100, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y - 10, { steps: 4 });
  await page.mouse.move(box.x + 100, box.y - 70, { steps: 4 });
  await page.mouse.up();
  await page.locator("[data-live-toast]").waitFor({ state: "detached" });
  assert.ok(!/prompts\/local/.test(page.url()), "kaydırma sayfayı açmadı");
}, { viewport: { width: 390, height: 800 } });

await scenario("14. Telefon: dokununca hedef sayfa açılır ve okundu olur; küçük kaydırma kartı geri bırakır", async ({ page, hub, state }) => {
  await ready(page, hub);
  const r = comment();
  emit(hub, r);
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  const box = await toast.boundingBox();
  await page.mouse.move(box.x + 100, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 100, box.y + 18, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  assert.equal(await page.locator("[data-live-toast]").count(), 1, "eşik altı: kart yerinde");
  await page.mouse.click(box.x + 100, box.y + 30);
  await page.waitForURL(/\/prompts\/local\/?\?id=/);
  assert.ok(state.calls.some((c) => c[0] === "mark_read"), "okundu");
}, { viewport: { width: 390, height: 800 } });

await scenario("15. Telefon: basılı tutunca süre durur", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  const box = await toast.boundingBox();
  await page.mouse.move(box.x + 100, box.y + 30);
  await page.mouse.down();
  await page.waitForTimeout(5800);
  assert.equal(await page.locator("[data-live-toast]").count(), 1, "basılıyken kapanmadı");
  await page.mouse.up();
}, { viewport: { width: 390, height: 800 } });

await scenario("16. İngilizce: bölge adı, cümle ve 'now' çevrilir; Settings anahtarı İngilizce", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, like(U.bob));
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  assert.equal(await page.locator("[data-live-toasts]").getAttribute("aria-label"), "Live notifications");
  const text = await toast.textContent();
  assert.match(text, /Bob/);
  assert.match(text, /now/);
  assert.ok(!/beğendi|şimdi/.test(text), "Türkçe kalmadı");
  await page.goto(`${BASE}/settings/notifications`);
  await page.getByText("Live notification pop-ups").waitFor();
}, { lang: "en" });

await scenario("17. Hareketi azalt açıkken de kart çıkar ve süre dolunca kapanır (süre JS zamanlayıcısıdır)", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  await page.locator("[data-live-toast]").first().waitFor();
  await page.waitForTimeout(2500);
  assert.equal(await page.locator("[data-live-toast]").count(), 1, "2,5 sn sonra hâlâ ekranda");
  await page.locator("[data-live-toast]").waitFor({ state: "detached", timeout: 6000 });
}, { reducedMotion: "reduce" });

await scenario("18. Koyu tema ve tablet genişliği: kart okunur, taşma yok", async ({ page, hub }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => { try { localStorage.setItem("promptly-theme", "dark"); } catch {} });
  await ready(page, hub);
  emit(hub, like(U.carol, "fire"));
  const toast = page.locator("[data-live-toast]").first();
  await toast.waitFor();
  assert.ok(await overflowFree(page));
  const bg = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, "rgba(0, 0, 0, 0)");
  assert.equal(await page.locator("[data-live-toasts]").getAttribute("data-live-toasts"), "desk");
  await shot(page, "tablet-dark");
}, { viewport: { width: 820, height: 900 } });

await scenario("19. Bozuk Realtime yükü (eksik alan) kart üretmez ve hata vermez", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, { recipient_id: ME, id: "x" });
  emit(hub, { recipient_id: ME, id: "y", type: "comment" });
  await page.waitForTimeout(600);
  assert.equal(await page.locator("[data-live-toast]").count(), 0);
});

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
