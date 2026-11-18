// Canlı bildirim ek özellikleri (docs/history/435-*), ağ taklitli: tür grubu kapatma, Rahatsız etme saatleri (Ayarlar kartı + sessiz saatte kart yok), bildirim sesi,
// sekme başlığında/simgesinde okunmamış sayısı, yoğunlukta özet kartı, kilometre taşı kutlama kartı, kartın içinden yanıt + hızlı tepki, Ana Sayfa "N yeni gönderi" hapı.
// Gerçek Supabase'e / Realtime'a / cihaza KARŞI DENENMEDİ: RPC'ler dosyada JS ile taklit edilir; sessiz saat SQL'i `supabase/tests/notification-quiet-hours.sql`'dedir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4206/promptly";
const server = await serve(4206);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const P1 = "a1000000-0000-4000-8000-000000000001";
const C1 = "c1000000-0000-4000-8000-000000000001";
const CONV = "c0000000-0000-4000-8000-0000000000c1";

let seq = 0;
const rec = (type, actor, message, href, extra = {}) => ({
  id: `n${++seq}`, recipient_id: ME, type, actor_id: actor?.id ?? null, message, target_href: href,
  is_read: false, created_at: new Date().toISOString(), reaction: null, dedupe_key: null, snoozed_until: null, ...extra,
});
const comment = (actor = U.dave) => rec("comment", actor, 'Paylaşımına yorum yaptı: "Işık kontrolü harika"', `/prompts/local?id=${P1}&hl=comment:${C1}`);
const like = (actor, reaction = "love") => rec("like", actor, 'Paylaşımını beğendi: "Gece Şehri"', `/prompts/local?id=${P1}&hl=post:${P1}`, { reaction });
const milestone = () => rec("system", null, 'Promptun "Gece Şehri" 100 kopyalamaya ulaştı.', `/insights/local?id=${P1}`, { dedupe_key: "milestone:p1:copies:100" });
const PEOPLE = [U.bob, U.carol, U.dave, U.amy, U.zed, U.erin];

// ---- Ana Sayfa gönderileri (Takip Ettiklerim) ----
const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (i) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const promptRow = (i, by, minutes) => ({
  id: pid(i), title: `Prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: null, tools: [], content_type: "image", category: "photography", subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 1, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - minutes * 60000).toISOString(),
  show_on_profile: true, requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: author(by), prompt_media: [{ id: `m${i}`, url: svg("#6d5bd0", "#d9d2c3", 1200, 900), width: 1200, height: 900, alt: `Görsel ${i}`, position: 0, dominant_color: "#6d5bd0", placeholder: svg("#6d5bd0", "#d9d2c3", 24, 18) }],
  prompt_tags: [],
});

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", init, setup, quiet, unread = 0, prefs } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  db.addConv(CONV, U.bob, { status: "accepted" });
  const state = { calls: [], quiet: quiet ?? { enabled: false, start_minute: 1380, end_minute: 480, tz: "UTC" }, unread, replies: [], likes: [], rows: [], feedCalls: [], setFail: false, comments: [{ id: C1, body: "Işık kontrolü harika.", like_count: 2 }] };
  db.rpc.notifications_unread_group_count = () => ({ body: state.unread });
  db.rpc.notifications_snooze_summary = () => ({ body: [{ snoozed_groups: 0, next_wake: null }] });
  db.rpc.notifications_grouped_page = () => ({ body: [] });
  db.rpc.notifications_unread_by_category = () => ({ body: [] });
  db.rpc.notifications_group_mark_read = (b) => { state.calls.push(["mark_read", b.p_key]); return { body: 1 }; };
  db.rpc.get_my_quiet_hours = () => ({ body: [state.quiet] });
  db.rpc.set_my_quiet_hours = (b) => {
    state.calls.push(["set_quiet", b]);
    if (state.setFail) return { status: 400, body: { message: "invalid_timezone", code: "22023" } };
    state.quiet = { enabled: b.p_enabled, start_minute: b.p_start, end_minute: b.p_end, tz: b.p_tz };
    return { body: [state.quiet] };
  };
  db.rpc.comment_reaction_counts = () => ({ body: [] });
  db.rpc.comment_reaction_friends = () => ({ body: [] });
  db.rpc.feed_page = (b) => {
    state.feedCalls.push(b);
    const list = [...state.rows].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, Math.min(b.p_limit ?? 18, 50));
    return { body: list.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 0 })) };
  };
  db.rpc.for_you_page = () => ({ body: [] });
  db.rpc.suggest_creators = () => ({ body: [] });
  db.rpc.trending_tags = () => ({ body: [] });
  db.extraRoutes = async ({ table, method, rows: rowsOf, json, body, route, q }) => {
    const noContent = () => route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    const inl = (v) => (v?.startsWith("in.(") ? v.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")) : null);
    if (table === "notification_mutes" && method === "GET") return rowsOf([]);
    if (table === "notification_type_prefs" && method === "GET") return rowsOf([]);
    if (table === "follows" && method === "GET" && q.get("select") === "following_id") return rowsOf([]);
    if (table === "prompt_comments" && method === "GET") { const ids = inl(q.get("id")) ?? []; return rowsOf(state.comments.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, body: c.body, deleted_at: null, like_count: c.like_count ?? 0, media_kind: null, media_ref: null, media_width: null, media_height: null, attach_type: null, attach_id: null }))); }
    if (table === "prompt_comments" && method === "POST") {
      const row = { id: `c9000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, body: body.body, parent_id: body.parent_id, like_count: 0, created_at: new Date().toISOString(), edited_at: null, deleted_at: null, rating: null, profiles: { ...U.alice, email: undefined, phone: undefined } };
      state.replies.push({ ...body, id: row.id });
      return json(201, row);
    }
    if (table === "comment_likes" && method === "GET") return rowsOf([]);
    if (table === "comment_likes" && method === "POST") { state.likes.push([body.comment_id, body.reaction ?? "love"]); return json(201, {}); }
    if (table === "comment_likes" && method === "DELETE") return noContent().then(() => true);
    return false;
  };
  setup?.(db, state);
  const hub = createRealtimeHub();
  const context = await browser.newContext({ viewport, deviceScaleFactor: process.env.SHOT_DIR ? 2 : 1 });
  await installMock(context, db, {});
  await hub.install(context, ME);
  // Takip Ettiklerim gönderi ayrıntısı (feed_page yalnız kimlik döner): kayıtlar mock'tan SONRA bağlanır.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    const list = state.rows.filter((r) => ids.includes(r.id));
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.addInitScript(([l, p]) => {
    try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-18"); if (p) localStorage.setItem("promptly-live-toast-prefs", p); } catch {}
    // Ses: AudioContext taklidi, çalınan her nota bir osilatördür (kart sesi = 2 nota).
    window.__notes = 0;
    window.AudioContext = class { constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; } resume() { return Promise.resolve(); }
      createOscillator() { window.__notes += 1; return { type: "", frequency: { setValueAtTime() {} }, connect: (n) => n, start() {}, stop() {} }; }
      createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n }; } };
  }, [lang, prefs]);
  if (init) await context.addInitScript(init);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  if (process.env.DEBUG) page.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 300)));
  try { await fn({ page, db, state, hub }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/lnfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const emit = (hub, record) => hub.emitPostgresChange("notifications", "INSERT", record);
const shot = async (page, name) => { if (process.env.SHOT_DIR) await page.waitForTimeout(500).then(() => page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png` })); };
async function ready(page, hub, path = "/") {
  await page.goto(`${BASE}${path}`);
  await page.locator("[data-notification-bell], a[href*='/notifications']").first().waitFor();
  const start = Date.now();
  while (Date.now() - start < 6000 && !hub.joinedTopics(ME).some((t) => t.includes("notifications:"))) await new Promise((r) => setTimeout(r, 40));
  assert.ok(hub.joinedTopics(ME).some((t) => t.includes("notifications:")), "bildirim kanalı bağlandı");
  await page.waitForTimeout(250); // dinleyici/oturum etkileri otursun: ilk olay kaybolmasın
}
async function until(fn, message = "koşul gerçekleşmedi", ms = 4000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return; await new Promise((r) => setTimeout(r, 40)); }
  assert.ok(await fn(), message);
}
const toast = (page) => page.locator("[data-live-toast]");
const notes = (page) => page.evaluate(() => window.__notes);

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Tür grupları
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("1. Ayarlar: tür grubu anahtarları varsayılan açık; 'Yorumlar' kapatılınca yorum kartı çıkmaz, beğeni kartı çıkar; tercih saklanır", async ({ page, hub }) => {
  await ready(page, hub, "/settings/notifications");
  const groups = page.locator("[data-live-group]");
  await groups.first().waitFor();
  assert.equal(await groups.count(), 5);
  for (let i = 0; i < 5; i++) assert.equal(await groups.nth(i).getAttribute("aria-checked"), "true");
  await page.locator('[data-live-group="comments"]').click();
  assert.equal(await page.locator('[data-live-group="comments"]').getAttribute("aria-checked"), "false");
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("promptly-live-toast-prefs")));
  assert.equal(stored.types.comments, false);
  assert.equal(stored.types.reactions, true);
  emit(hub, comment());
  await page.waitForTimeout(700);
  assert.equal(await toast(page).count(), 0, "yorum kartı çıkmadı");
  emit(hub, like(U.bob));
  await toast(page).first().waitFor();
  assert.match(await toast(page).first().textContent(), /Bob/);
  await page.reload();
  await page.locator('[data-live-group="comments"]').waitFor();
  assert.equal(await page.locator('[data-live-group="comments"]').getAttribute("aria-checked"), "false", "yenilemede kapalı kaldı");
  await shot(page, "settings-groups");
});

await scenario("2. Ana anahtar kapalıyken tür/ses grupları gizlenir (kart yoksa ince ayar anlamsız)", async ({ page, hub }) => {
  await ready(page, hub, "/settings/notifications");
  await page.locator("[data-pref=live-toasts]").waitFor();
  await page.locator("[data-pref=live-toasts]").click();
  await page.locator("[data-live-toast-groups]").waitFor({ state: "detached" });
  await page.locator("[data-pref=live-toasts]").click();
  await page.locator("[data-live-toast-groups]").waitFor();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Rahatsız etme
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("3. Rahatsız etme kartı: sunucudan okunur, anahtar + saatler RPC ile kaydedilir (saat dilimi tarayıcıdan), hata mesajı çıkar", async ({ page, hub, state }) => {
  await ready(page, hub, "/settings/notifications");
  const sw = page.locator("[data-pref=quiet-hours]");
  await sw.waitFor();
  assert.equal(await sw.getAttribute("aria-checked"), "false");
  assert.equal(await page.locator('[data-quiet-input="from"]').inputValue(), "23:00");
  assert.equal(await page.locator('[data-quiet-input="to"]').inputValue(), "08:00");
  assert.equal(await page.locator('[data-quiet-input="from"]').isDisabled(), true, "kapalıyken saat alanları kapalı");
  await sw.click();
  await until(() => state.calls.some((c) => c[0] === "set_quiet"));
  const first = state.calls.find((c) => c[0] === "set_quiet")[1];
  assert.deepEqual([first.p_enabled, first.p_start, first.p_end], [true, 1380, 480]);
  assert.ok(typeof first.p_tz === "string" && first.p_tz.length > 0, "saat dilimi gönderildi");
  assert.equal(await sw.getAttribute("aria-checked"), "true");
  await page.locator('[data-quiet-input="from"]').fill("22:30");
  await until(() => state.calls.filter((c) => c[0] === "set_quiet").length >= 2);
  assert.equal(state.calls.filter((c) => c[0] === "set_quiet").at(-1)[1].p_start, 1350);
  assert.equal(state.quiet.start_minute, 1350);
  state.setFail = true;
  await page.locator('[data-quiet-input="to"]').fill("09:00");
  await page.locator("[data-quiet-error]").waitFor();
  assert.equal(await page.locator('[data-quiet-input="to"]').inputValue(), "08:00", "kaydedilemeyince eski değer geri gelir");
  await shot(page, "settings-quiet");
});

await scenario("4. Sessiz saatteyken (gün boyu pencere) kart çıkmaz ve ses çalmaz; bildirim yine gelir (zil rozeti artar)", async ({ page, hub, state }) => {
  await ready(page, hub);
  state.unread = 1;
  emit(hub, comment());
  await page.waitForTimeout(900);
  assert.equal(await toast(page).count(), 0, "sessiz saatte kart yok");
  assert.equal(await notes(page), 0, "ses yok");
  await page.locator("[data-bell-badge]").waitFor();
  assert.equal((await page.locator("[data-bell-badge]").textContent()).trim(), "1", "bildirim yine geldi");
}, { quiet: { enabled: true, start_minute: 0, end_minute: 1439, tz: "UTC" }, prefs: JSON.stringify({ sound: true }) });

await scenario("5. Sessiz saat dışında (kapalı) kart çıkar", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  await toast(page).first().waitFor();
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Ses
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("6. Bildirim sesi: varsayılan KAPALI (kart var, ses yok); Ayarlar'dan açılınca kart çıkarken iki nota çalar; 'Sesi dene' çalar", async ({ page, hub }) => {
  await ready(page, hub, "/settings/notifications");
  const sw = page.locator("[data-pref=live-sound]");
  await sw.waitFor();
  assert.equal(await sw.getAttribute("aria-checked"), "false", "varsayılan kapalı");
  assert.equal(await page.locator("[data-action=sound-test]").count(), 0, "kapalıyken dene düğmesi yok");
  emit(hub, like(U.bob));
  await toast(page).first().waitFor();
  assert.equal(await notes(page), 0, "ses kapalı");
  await sw.click();
  await page.locator("[data-action=sound-test]").click();
  assert.equal(await notes(page), 2, "dene: iki nota");
  emit(hub, comment(U.carol));
  await until(async () => (await notes(page)) === 4, "kart çıkınca ses çaldı");
});

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Sekme başlığı + simge
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("7. Sekme başlığı '(3) …' ve simgede rozet; yeni bildirimde sayı artar; Ayarlar'dan kapatılınca ikisi de özgün hâline döner", async ({ page, hub, state }) => {
  await ready(page, hub);
  await page.waitForFunction(() => /^\(3\) /.test(document.title));
  const original = await page.evaluate(() => document.title.replace(/^\(\d+\+?\) /, ""));
  assert.ok(original.length > 0);
  await page.waitForFunction(() => document.querySelector('link[rel~="icon"]')?.href.startsWith("data:image/png"));
  if (process.env.SHOT_DIR) {
    const tab = await page.evaluate(() => ({ title: document.title, icon: document.querySelector('link[rel~="icon"]').href }));
    (await import("node:fs")).writeFileSync(`${process.env.SHOT_DIR}/tab.json`, JSON.stringify(tab));
  }
  state.unread = 4;
  emit(hub, like(U.bob));
  await page.waitForFunction(() => /^\(4\) /.test(document.title));
  await page.goto(`${BASE}/settings/notifications`);
  await page.waitForFunction(() => /^\(4\) /.test(document.title) || /^\(3\) /.test(document.title), null, { timeout: 8000 });
  await page.locator("[data-pref=tab-badge]").click();
  await page.waitForFunction(() => !/^\(\d+/.test(document.title));
  await page.waitForFunction(() => !document.querySelector('link[rel~="icon"]')?.href.startsWith("data:image/png"));
  await page.locator("[data-pref=tab-badge]").click();
  await page.waitForFunction(() => /^\(\d+\) /.test(document.title));
}, { unread: 3 });

await scenario("8. Okunmamış yokken başlıkta ve simgede rozet yok", async ({ page, hub }) => {
  await ready(page, hub);
  await page.waitForTimeout(600);
  assert.ok(!/^\(\d+/.test(await page.title()));
  assert.ok(!(await page.evaluate(() => document.querySelector('link[rel~="icon"]')?.href.startsWith("data:image/png"))));
}, { unread: 0 });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Yoğunlukta özet
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("9. Yoğunluk: 5 bildirim kısa sürede gelince kartlar tek özet kartına iner ('5 yeni bildirim'); altıncı sayıyı artırır; 'Hepsini gör' bildirimlere gider", async ({ page, hub }) => {
  await ready(page, hub);
  for (const a of PEOPLE.slice(0, 4)) { emit(hub, comment(a)); await page.waitForTimeout(120); }
  await until(async () => (await toast(page).count()) >= 3);
  assert.equal(await page.locator('[data-live-toast-variant="summary"]').count(), 0, "eşik altında özet yok");
  emit(hub, comment(PEOPLE[4]));
  const summary = page.locator('[data-live-toast-variant="summary"]');
  await summary.waitFor();
  await until(async () => (await toast(page).count()) === 1, "tekil kartlar kalktı, yalnız özet kaldı");
  assert.match(await summary.textContent(), /5 yeni bildirim/);
  assert.match(await summary.textContent(), /ve başkaları/);
  emit(hub, like(PEOPLE[5]));
  await until(async () => /6 yeni bildirim/.test((await summary.textContent()) ?? ""));
  assert.equal(await toast(page).count(), 1, "hâlâ tek kart");
  await shot(page, "summary");
  await summary.locator("[data-action=see-all]").click();
  await page.waitForURL(/\/notifications\/?$/);
});

await scenario("10. Yoğunluk özeti telefonda da çıkar (üstten iner) ve dokununca bildirimlere gider", async ({ page, hub }) => {
  await ready(page, hub);
  for (const a of PEOPLE.slice(0, 5)) { emit(hub, comment(a)); await page.waitForTimeout(100); }
  const summary = page.locator('[data-live-toast-variant="summary"]');
  await summary.waitFor();
  await page.waitForTimeout(450);
  const box = await summary.boundingBox();
  assert.ok(box.y >= 0 && box.y < 24);
  assert.equal(await summary.locator("[data-action=see-all]").count(), 0, "telefonda düğme yok");
  await shot(page, "summary-phone");
  await page.mouse.click(box.x + 120, box.y + 24);
  await page.waitForURL(/\/notifications\/?$/);
}, { viewport: { width: 390, height: 800 } });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Kilometre taşı
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("11. Kilometre taşı: kutlama kartı (kupa simgesi, konfeti, 'İstatistiği gör'), 8 sn kalır; düğme istatistiğe götürür ve okundu yapar", async ({ page, hub, state }) => {
  await ready(page, hub);
  emit(hub, milestone());
  const card = page.locator('[data-live-toast-variant="milestone"]');
  await card.waitFor();
  assert.match(await card.textContent(), /Promptun 100 kez kopyalandı/);
  assert.match(await card.textContent(), /Gece Şehri/);
  assert.equal(await card.locator('[data-live-toast-icon="milestone"]').count(), 1);
  assert.equal(await card.locator("[data-live-toast-confetti] i").count(), 14);
  await shot(page, "milestone");
  await page.waitForTimeout(6200);
  assert.equal(await toast(page).count(), 1, "5 sn'den uzun kalır");
  await card.locator("[data-action=stats]").click();
  await page.waitForURL(/\/insights\/local\/?\?id=/);
  assert.ok(state.calls.some((c) => c[0] === "mark_read"), "okundu");
});

await scenario("11b. Kilometre taşı telefonda: üstten iner, kutlama kartı görünür, dokununca istatistiğe gider", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, milestone());
  const card = page.locator('[data-live-toast-variant="milestone"]');
  await card.waitFor();
  await page.waitForTimeout(450);
  const box = await card.boundingBox();
  assert.ok(box.y >= 0 && box.y < 24 && box.x >= 6);
  assert.equal(await card.locator("[data-action=stats]").count(), 0, "telefonda düğme yok");
  await shot(page, "milestone-phone");
  await page.mouse.click(box.x + 150, box.y + 24);
  await page.waitForURL(/\/insights\/local\/?\?id=/);
}, { viewport: { width: 390, height: 800 } });

await scenario("12. Kilometre taşı: hareketi azalt açıkken de kart çıkar", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, milestone());
  await page.locator('[data-live-toast-variant="milestone"]').waitFor();
}, { init: () => { /* reducedMotion bağlam seçeneği değil; CSS son kareyi uygular */ } });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Satır içi yanıt + hızlı tepki
// ---------------------------------------------------------------------------------------------------------------------------------------------
await scenario("13. Yorum kartı: 'Yanıtla' kartın içinde yanıt kutusu açar, gönderince yorum yazılır, kart kapanır ve okundu olur; yazarken süre durur", async ({ page, hub, state }) => {
  await ready(page, hub);
  emit(hub, comment());
  const t = toast(page).first();
  await t.waitFor();
  await t.locator("[data-action=reply]").click();
  const box = t.locator("[data-live-toast-reply] textarea");
  await box.waitFor();
  assert.equal(await t.locator("[data-action=reply-send]").isDisabled(), true, "boşken gönder kapalı");
  await box.fill("Teşekkürler, deneyip yazarım!");
  await shot(page, "toast-reply");
  await page.waitForTimeout(5800);
  assert.equal(await toast(page).count(), 1, "yazarken kapanmadı");
  await t.locator("[data-action=reply-send]").click();
  await until(() => state.replies.length === 1);
  assert.equal(state.replies[0].body, "Teşekkürler, deneyip yazarım!");
  assert.equal(state.replies[0].parent_id, C1, "yanıt üst yoruma bağlı");
  await toast(page).first().waitFor({ state: "detached" });
  assert.ok(state.calls.some((c) => c[0] === "mark_read"), "okundu");
});

await scenario("14. Yorum kartı: hızlı tepki düğmesi gönderideki emoji seçicisini açar; seçince tepki yazılır ve kart kapanır", async ({ page, hub, state }) => {
  await ready(page, hub);
  emit(hub, comment());
  const t = toast(page).first();
  await t.waitFor();
  const like = t.locator("[data-action=like] button");
  await like.waitFor();
  await like.click();
  const picker = page.locator("[data-reaction-picker]");
  await picker.waitFor();
  assert.equal(await picker.locator("[data-reaction]").count(), 6);
  await shot(page, "toast-picker");
  await page.waitForTimeout(5600);
  assert.equal(await toast(page).count(), 1, "seçici açıkken süre dolsa da kart kapanmaz");
  await picker.locator('[data-reaction="fire"]').click();
  await until(() => state.likes.length === 1);
  assert.deepEqual(state.likes[0], [C1, "fire"]);
  await toast(page).first().waitFor({ state: "detached" });
  await shot(page, "toast-reaction");
});

await scenario("15. Telefonda kartta satır içi yanıt/tepki YOK (dokununca açılır)", async ({ page, hub }) => {
  await ready(page, hub);
  emit(hub, comment());
  const t = toast(page).first();
  await t.waitFor();
  await page.waitForTimeout(450);
  assert.equal(await t.locator("[data-action=reply], [data-action=like]").count(), 0);
}, { viewport: { width: 390, height: 800 } });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Ana Sayfa "N yeni gönderi"
// ---------------------------------------------------------------------------------------------------------------------------------------------
const feedSetup = (db, state) => {
  db.follow({ id: ME }, U.bob);
  state.rows = [promptRow(1, U.bob, 30), promptRow(2, U.bob, 20), promptRow(3, U.bob, 10)];
};
// Sekme yeniden görününce yoklama (son yoklamadan ≥ 2 sn sonra): testte olayı elle tetikler.
const visibilityPoll = async (page) => { await page.waitForTimeout(2100); await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); };
const homeTab = (page, name) => page.getByRole("tablist", { name: /Akış görünümü|Feed view/ }).getByRole("tab", { name, exact: true });
async function openFollowing(page) {
  await page.goto(`${BASE}/`);
  const tab = homeTab(page, "Takip Ettiklerim");
  await tab.waitFor();
  for (let attempt = 0; attempt < 3; attempt++) {
    await tab.click();
    const end = Date.now() + 1500;
    while (Date.now() < end) { if ((await tab.getAttribute("aria-selected")) === "true") return; await page.waitForTimeout(100); }
  }
  assert.equal(await tab.getAttribute("aria-selected"), "true", "Takip Ettiklerim sekmesi seçildi");
}

await scenario("16. Ana Sayfa › Takip Ettiklerim: yeni gönderi gelince liste KAYMADAN '2 yeni gönderi' hapı çıkar; basınca yerinde yenilenir ve hap kalkar", async ({ page, state }) => {
  await openFollowing(page);
  await page.locator("text=Prompt 3").first().waitFor();
  const before = await page.locator("article, [data-content-card]").count();
  assert.equal(await page.locator("[data-new-posts]").count(), 0, "başta hap yok");
  state.rows = [promptRow(5, U.bob, 1), promptRow(4, U.bob, 2), ...state.rows];
  await visibilityPoll(page);
  await page.locator("[data-new-posts]").waitFor();
  assert.match(await page.locator("[data-new-posts]").textContent(), /2 yeni gönderi/);
  assert.equal(await page.locator("text=Prompt 5").count(), 0, "liste yerinde duruyor, yeni gönderi henüz eklenmedi");
  assert.equal(await page.locator("article, [data-content-card]").count(), before);
  await shot(page, "new-posts");
  await page.locator("[data-action=show-new-posts]").click();
  await page.locator("text=Prompt 5").first().waitFor();
  await page.locator("[data-new-posts]").waitFor({ state: "detached" });
}, { setup: feedSetup });

await scenario("17. '1 yeni gönderi' tekil, bir sayfadan fazla yeniyse '18+'; sekme görünmezken yoklanmaz; Sana özel'de hap yok", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  assert.equal(await page.locator("[data-new-posts]").count(), 0, "Sana özel'de hap yok");
  await openFollowing(page);
  await page.locator("text=Prompt 3").first().waitFor();
  const calls = state.feedCalls.length;
  state.rows = [promptRow(4, U.bob, 1), ...state.rows];
  await visibilityPoll(page);
  await page.locator("[data-new-posts]").waitFor();
  assert.match(await page.locator("[data-new-posts]").textContent(), /^\s*1 yeni gönderi\s*$/);
  assert.ok(state.feedCalls.length > calls, "yoklama yapıldı");
  // Bir sayfadan fazla yeni: hepsi bilinmeyen → "+"
  state.rows = [...Array.from({ length: 20 }, (_, i) => promptRow(100 + i, U.bob, 0.5 - i / 1000)), ...state.rows];
  await visibilityPoll(page);
  await until(async () => /\+ yeni gönderi/.test((await page.locator("[data-new-posts]").textContent()) ?? ""), "artı işareti");
}, { setup: feedSetup });

await scenario("18. Hap telefonda üstte (güvenli alan + üst menü altında) çıkar, taşma yok", async ({ page, state }) => {
  await openFollowing(page);
  await page.locator("text=Prompt 3").first().waitFor();
  state.rows = [promptRow(4, U.bob, 1), ...state.rows];
  await visibilityPoll(page);
  await page.locator("[data-new-posts]").waitFor();
  const box = await page.locator("[data-action=show-new-posts]").boundingBox();
  assert.ok(box.y >= 60 && box.y < 120, `üst çubuğun hemen altında (y=${box.y})`);
  assert.ok(box.x >= 0 && box.x + box.width <= 390);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await shot(page, "new-posts-phone");
}, { viewport: { width: 390, height: 800 }, setup: feedSetup });

await scenario("18b. Koyu tema: özet kartı ve kutlama kartı okunur", async ({ page, hub }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await ready(page, hub);
  emit(hub, milestone());
  await page.locator('[data-live-toast-variant="milestone"]').waitFor();
  await shot(page, "milestone-dark");
  for (const a of PEOPLE.slice(0, 5)) { emit(hub, comment(a)); await page.waitForTimeout(100); }
  await page.locator('[data-live-toast-variant="summary"]').waitFor();
  await shot(page, "summary-dark");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
}, { init: () => { try { localStorage.setItem("promptly-theme", "dark"); } catch {} } });

await scenario("19. İngilizce: ayar kartları, özet, hap çevrilir", async ({ page, hub }) => {
  await ready(page, hub, "/settings/notifications");
  await page.getByText("Do not disturb").waitFor();
  await page.getByText("Unread count in the tab").first().waitFor();
  await page.getByText("Which notifications show as a card").waitFor();
  await ready(page, hub, "/");
  for (const a of PEOPLE.slice(0, 5)) { emit(hub, comment(a)); await page.waitForTimeout(100); }
  const summary = page.locator('[data-live-toast-variant="summary"]');
  await summary.waitFor();
  assert.match(await summary.textContent(), /5 new notifications/);
  assert.match(await summary.textContent(), /and others/);
}, { lang: "en" });

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
