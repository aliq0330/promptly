// Space yorumları + puan + etkinlik (docs/history/242-*): Yorumlar sekmesi (puan özeti, yıldızlı yorum, kişi başına tek puan, puan değiştirme,
// sahip puanlayamaz), Etkinlik sekmesi (önizlemeli liste: önce/sonra, süzgeç), etkinlik özet sayfası (yorum, yapanın notu, önceki/sonraki),
// etkinlik görünürlüğü ayarı, alttan açılan pencerelerde sabit başlık/alt çubuk + %75 üst sınır. Ağ taklitli; gerçek Supabase'e KARŞI
// DENENMEDİ (kurallar: supabase/tests/space-comments-activity.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces, SID, MEDIA } from "./mock-spaces.mjs";
import { installDetailData } from "./detail-fixtures.mjs";

const PORT = 4201;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [] });
const EV_PAL = "e1000000-0000-4000-8000-000000000001";
const EV_NAME = "e1000000-0000-4000-8000-000000000002";
const EV_IMG = "e1000000-0000-4000-8000-000000000003";
const EV_MINE = "e1000000-0000-4000-8000-0000000000aa";

/** Bob'un herkese açık Space'i (ben üye değilim) + etkinlikleri + iki mevcut yorum (biri 5 puanlı). */
function world(db) {
  const s = db.addSpace(1, { owner: U.bob.id, title: "Neon şehir panosu", visibility: "public", rating_avg: 5, rating_count: 1, comment_count: 2 });
  for (let n = 1; n <= 3; n += 1) db.addItem(s.id, { kind: "image", media_url: MEDIA(s.id, n), media_width: 800, media_height: 600, title: `Görsel ${n}` });
  db.addActivity(s.id, { id: EV_NAME, actor: U.bob.id, action: "renamed", label: "Neon şehir panosu", details: { before: "Neon sokak", after: "Neon şehir panosu" }, created_at: "2026-09-20T10:00:00Z" });
  db.addActivity(s.id, { id: EV_IMG, actor: U.bob.id, action: "image_added", count: 3, details: { items: [{ kind: "image", title: "Görsel 1", thumb: MEDIA(s.id, 1) }] }, created_at: "2026-09-20T10:30:00Z" });
  db.addActivity(s.id, { id: EV_PAL, actor: U.bob.id, action: "palette_updated", label: "Neon", details: { before: ["#ff5fa2", "#1b2a49", "#e86a3c"], after: ["#ff3d8f", "#1b2a49", "#e86a3c", "#52e0c4"] }, author_note: "Pembeyi doygunlaştırdım.", comment_count: 1, created_at: "2026-09-20T11:00:00Z" });
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, setup = world } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  setup?.(db);
  const state = {
    comments: [
      { id: "c1000000-0000-4000-8000-000000000001", space_id: SID(1), space_activity_id: null, parent_id: null, author: U.carol, body: "Harika pano, çok işime yaradı.", rating: 5, created_at: "2026-09-21T09:00:00Z" },
      { id: "c1000000-0000-4000-8000-000000000002", space_id: SID(1), space_activity_id: null, parent_id: null, author: U.dave, body: "Güzel ama daha çok örnek olabilirdi.", rating: null, created_at: "2026-09-21T10:00:00Z" },
      { id: "c1000000-0000-4000-8000-000000000003", space_id: SID(1), space_activity_id: EV_PAL, parent_id: null, author: U.carol, body: "Turkuaz çok iyi oturdu.", rating: null, created_at: "2026-09-20T11:30:00Z" },
    ],
    posts: [],
    patches: [],
    noteCalls: [],
  };
  const rowOf = (c) => ({ id: c.id, body: c.body, parent_id: c.parent_id, like_count: 0, created_at: c.created_at, edited_at: null, deleted_at: null, rating: c.rating, space_activity_id: c.space_activity_id, profiles: author(c.author) });
  const recount = () => {
    // Başlangıç sayaçları (1 puan, toplam 5) üstüne bu oturumda yazılan puanlı yorumlar işlenir.
    const sp = db.spaces.find((x) => x.id === SID(1));
    const mine = state.comments.filter((c) => state.posts.includes(c.id) && c.rating);
    sp.rating_count = 1 + mine.length;
    sp.rating_avg = Math.round(((5 + mine.reduce((a, c) => a + c.rating, 0)) / sp.rating_count) * 100) / 100;
    sp.comment_count = 2 + state.comments.filter((c) => state.posts.includes(c.id) && !c.space_activity_id).length;
  };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.route(/\/rest\/v1\/prompt_comments/, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const q = url.searchParams;
    if (req.method() === "GET") {
      let list = state.comments.filter((c) => c.space_id === q.get("space_id")?.replace("eq.", ""));
      const act = q.get("space_activity_id");
      if (act === "is.null") list = list.filter((c) => !c.space_activity_id);
      else if (act?.startsWith("eq.")) list = list.filter((c) => c.space_activity_id === act.slice(3));
      if (q.get("select") === "rating") return json(route, list.filter((c) => c.rating).map((c) => ({ rating: c.rating })));
      return json(route, list.map(rowOf));
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.posts.push("pending");
      const id = `c2000000-0000-4000-8000-${String(state.posts.length).padStart(12, "0")}`;
      state.posts[state.posts.length - 1] = id;
      const c = { id, space_id: body.space_id, space_activity_id: body.space_activity_id ?? null, parent_id: body.parent_id ?? null, author: U.alice, body: body.body, rating: body.rating ?? null, created_at: new Date().toISOString() };
      state.comments.push(c);
      state.lastPost = body;
      if (c.space_activity_id) db.spaceActivity.find((a) => a.id === c.space_activity_id).comment_count += 1;
      recount();
      return json(route, rowOf(c), 201);
    }
    if (req.method() === "PATCH") {
      const id = q.get("id")?.replace("eq.", "");
      const c = state.comments.find((x) => x.id === id);
      const body = JSON.parse(req.postData() || "{}");
      if (c && body.rating) {
        c.rating = body.rating;
        state.patches.push(id);
        state.lastPatch = body;
        return json(route, { id }, 200);
      }
      return json(route, null, 406);
    }
    return route.fallback();
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/sc-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const waitFor = async (fn, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !(await fn())) await new Promise((r) => setTimeout(r, 100));
};

await scenario("1. Yorumlar sekmesi: puan özeti (ortalama + dağılım), yıldızlı ve yıldızsız yorumlar; Space başlığında puan çipi", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=comments`);
  const summary = page.locator("[data-space-rating-summary]");
  await summary.waitFor();
  await summary.getByText("5,0").waitFor();
  await summary.getByText("1 puan").waitFor();
  await page.locator("[data-space-rating-chip]").waitFor();
  const rated = page.locator("[data-comment-rating='5']").first();
  await rated.waitFor();
  assert.equal(await page.locator("[data-comment-rating]").count(), 1, "yalnız puanlı yorumda yıldız");
  await page.getByText("Güzel ama daha çok örnek olabilirdi.").waitFor();
  await page.getByText("Turkuaz çok iyi oturdu.").waitFor({ state: "detached" }).catch(() => undefined);
  assert.equal(await page.getByText("Turkuaz çok iyi oturdu.").count(), 0, "etkinlik yorumu genel yorumlarda görünmez");
  await shot(page, "sc-comments");
});

await scenario("2. Puanlı yorum: yıldız seç + yaz → rating yazılır, yorumda yıldız görünür; ikinci puan verilemez, puan yorumdaki yıldızdan değişir", async ({ page, state }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=comments`);
  const picker = page.locator("[data-space-rating-picker]");
  await picker.waitFor();
  await picker.getByRole("radio", { name: "4 yıldız" }).click();
  await picker.getByText(/4 · Çok iyi/).waitFor();
  await page.getByPlaceholder(/Bu Space hakkında ne düşünüyorsun/).fill("Palet ve gruplar çok net.");
  await page.getByRole("button", { name: "Gönder" }).click();
  await waitFor(() => state.lastPost);
  assert.equal(state.lastPost.rating, 4);
  assert.equal(state.lastPost.space_id, SID(1));
  assert.ok(!state.lastPost.space_activity_id);
  await page.locator("[data-comment-rating='4']").waitFor();
  // Kişi başına tek puan: seçici gider, açıklama gelir.
  await page.getByText(/Puanın: 4/).waitFor();
  assert.equal(await picker.getByRole("radio").count(), 0);
  // Kendi yorumundaki yıldızdan değiştir.
  await page.locator("[data-comment-rating='4']").getByRole("radio", { name: "2 yıldız" }).click();
  await waitFor(() => state.lastPatch);
  assert.equal(state.lastPatch.rating, 2);
  await page.locator("[data-comment-rating='2']").waitFor();
});

await scenario("3. Sahibi kendi Space'ini puanlayamaz: yıldız seçici yok, açıklama var; yine de yorum yazabilir", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(2)}&tab=comments`);
  await page.getByText(/Kendi Space'ini puanlayamazsın/).waitFor();
  assert.equal(await page.locator("[data-space-rating-picker]").getByRole("radio").count(), 0);
  await page.getByPlaceholder(/Bu Space hakkında/).waitFor();
}, { setup: (db) => { world(db); db.addSpace(2, { title: "Benim Space'im", visibility: "public" }); } });

await scenario("4. Etkinlik sekmesi (üye olmayan, varsayılan 'herkes'): önizlemeli liste — ad önce/sonra, palet renkleri önce/sonra, eklenen görsel; süzgeç", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity`);
  const list = page.locator("[data-testid='space-activity-tab']");
  await list.waitFor();
  const rename = list.locator("[data-activity='renamed']");
  await rename.getByText("Neon sokak").waitFor();
  await rename.getByText("Önce").waitFor();
  await rename.getByText("Sonra").waitFor();
  const pal = list.locator("[data-activity='palette_updated']");
  assert.equal(await pal.locator("[data-activity-side='before'] i").count(), 3);
  assert.equal(await pal.locator("[data-activity-side='after'] i").count(), 4);
  await pal.getByText("Pembeyi doygunlaştırdım.").waitFor();
  await list.locator("[data-activity='image_added']").getByText("Eklendi").waitFor();
  await list.getByRole("button", { name: "Palet", exact: true }).click();
  assert.equal(await list.locator("[data-activity]").count(), 1);
  await shot(page, "sc-activity-list");
});

await scenario("5. Etkinlik özet sayfası: ne değişti, yapanın notu, yorum yazma (etkinliğe düşer, puan yok), önceki/sonraki etkinliğe geçiş", async ({ page, state }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity&event=${EV_PAL}`);
  const view = page.locator(`[data-activity-page='${EV_PAL}']`);
  await view.waitFor();
  assert.equal(await view.locator("[data-activity-side='after'] i").count(), 4);
  await view.getByText("Pembeyi doygunlaştırdım.").waitFor();
  await view.getByText("Turkuaz çok iyi oturdu.").waitFor();
  assert.equal(await view.locator("[data-space-rating-picker]").count(), 0, "etkinlik yorumunda puan yok");
  await view.getByPlaceholder(/yorum yaz/i).fill("Mekân grubuna da uyar.");
  await view.getByRole("button", { name: "Gönder" }).click();
  await waitFor(() => state.lastPost);
  assert.equal(state.lastPost.space_activity_id, EV_PAL);
  assert.ok(!state.lastPost.rating);
  await view.getByText("Mekân grubuna da uyar.").waitFor();
  // Önceki etkinliğe dön (görsel eklemesi), sonra sonraki yok.
  await view.getByRole("button", { name: "Sonraki etkinlik" }).waitFor();
  assert.equal(await view.getByRole("button", { name: "Sonraki etkinlik" }).isDisabled(), true, "en yeni etkinlikte 'sonraki' kapalı");
  await view.getByRole("button", { name: "Önceki etkinlik" }).click();
  await page.locator(`[data-activity-page='${EV_IMG}']`).waitFor();
  await page.waitForURL(new RegExp(`event=${EV_IMG}`));
  await page.getByRole("link", { name: "Tüm etkinlikler" }).first().click();
  await page.locator("[data-testid='space-activity-tab']").waitFor();
});

await scenario("6. Not: yalnız değişikliği yapan 'Not ekle' görür (RPC); başkası ve Space sahibi görmez", async ({ page, db, state }) => {
  // Benim (ME) etkinliğim: Bob'un Space'inde düzenleyiciyim.
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity&event=${EV_MINE}`);
  const view = page.locator(`[data-activity-page='${EV_MINE}']`);
  await view.waitFor();
  await view.locator("[data-activity-add-note]").click();
  await view.locator("[data-activity-note-input]").fill("Başlığı sadeleştirdim.");
  await view.getByRole("button", { name: "Notu kaydet" }).click();
  await waitFor(() => db.spaceActivity.find((a) => a.id === EV_MINE).author_note);
  assert.equal(db.spaceActivity.find((a) => a.id === EV_MINE).author_note, "Başlığı sadeleştirdim.");
  await view.locator("[data-activity-note]").getByText("Başlığı sadeleştirdim.").waitFor();
  // Bob'un etkinliğinde not ekleme yok.
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity&event=${EV_NAME}`);
  await page.locator(`[data-activity-page='${EV_NAME}']`).waitFor();
  assert.equal(await page.locator("[data-activity-add-note]").count(), 0);
  void state;
}, { setup: (db) => { world(db); db.spaceMembers.push({ space_id: SID(1), user_id: ME, role: "editor", created_at: "2026-09-01T00:00:00Z" }); db.addActivity(SID(1), { id: EV_MINE, actor: ME, action: "renamed", label: "Sade başlık", details: { before: "Uzun başlık", after: "Sade başlık" }, created_at: "2026-09-19T10:00:00Z" }); } });

await scenario("7. 'Yalnız üyeler': üye olmayan Etkinlik sekmesini görmez; Yorumlar kalır", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=comments`);
  await page.locator("[data-space-rating-summary]").waitFor();
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /Yorumlar/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /Etkinlik/ }).count(), 0);
}, { setup: (db) => { world(db); db.spaces.find((s) => s.id === SID(1)).activity_visibility = "members"; } });

await scenario("8. Ayar: sahibi 'Etkinlik geçmişini kim görsün?' seçer; kayıtla activity_visibility gider", async ({ page, db }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(2)}`);
  await page.locator("[data-detail-band]").waitFor();
  await page.getByRole("button", { name: "Daha fazla işlem" }).click();
  await page.getByRole("menuitem", { name: /Ayarlar/ }).click();
  const fieldset = page.locator("[data-space-activity-visibility]");
  await fieldset.waitFor();
  await fieldset.getByLabel("Yalnız üyeler").check();
  await page.getByTestId("space-settings-form").getByRole("button", { name: "Kaydet" }).click();
  await waitFor(() => db.spaces.find((s) => s.id === SID(2)).activity_visibility === "members");
  assert.equal(db.spaces.find((s) => s.id === SID(2)).activity_visibility, "members");
}, { setup: (db) => { world(db); db.addSpace(2, { title: "Benim Space'im", visibility: "public" }); } });

await scenario("9. Telefon: alttan açılan 'Space ayarları' — başlık ve Vazgeç/Kaydet sabit, ortası kayar, yükseklik en çok %75", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(2)}`);
  await page.locator("[data-detail-band]").waitFor();
  await page.getByRole("button", { name: "Daha fazla işlem" }).click();
  await page.getByRole("menuitem", { name: /Ayarlar/ }).click();
  const form = page.getByTestId("space-settings-form");
  await form.waitFor();
  const panel = page.locator("[role=dialog] >> div.flex.flex-col").first();
  await panel.waitFor();
  await page.waitForTimeout(600); // alttan kayma animasyonu bitsin
  const vh = page.viewportSize().height;
  const box = await panel.boundingBox();
  assert.ok(box.height <= vh * 0.75 + 2, `kart yüksekliği ≤ %75 (${Math.round(box.height)} / ${vh})`);
  assert.ok(box.y >= vh * 0.25 - 2, "ekranın üst çeyreği boş kalır");
  const header = page.getByRole("heading", { name: "Space ayarları" });
  const save = form.getByRole("button", { name: "Kaydet" });
  const h0 = await header.boundingBox();
  const s0 = await save.boundingBox();
  // Gövdeyi sona kadar kaydır: başlık ve düğmeler yerinde kalır.
  await form.locator("div.overflow-y-auto").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(200);
  const h1 = await header.boundingBox();
  const s1 = await save.boundingBox();
  assert.ok(Math.abs(h1.y - h0.y) < 1, "başlık sabit");
  assert.ok(Math.abs(s1.y - s0.y) < 1, "Kaydet sabit");
  assert.ok(s1.y + s1.height <= vh + 1 && s1.y > vh * 0.5, "düğmeler kartın altında");
  assert.equal(await overflowFree(page), true);
  await shot(page, "sc-sheet-mobile");
}, { viewport: { width: 390, height: 780 }, setup: (db) => { world(db); db.addSpace(2, { title: "Benim Space'im", visibility: "public" }); } });

await scenario("10. İngilizce + telefon: Yorumlar ve Etkinlik çevrilmiş, yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=comments`);
  await page.locator("[data-space-rating-summary]").getByText("1 ratings").waitFor();
  await page.locator("[data-space-rating-picker]").getByRole("radio", { name: "3 stars" }).waitFor();
  assert.equal(await overflowFree(page), true);
  await page.goto(`${BASE}/spaces/local?id=${SID(1)}&tab=activity`);
  await page.locator("[data-activity='renamed']").getByText("Before").waitFor();
  assert.equal(await overflowFree(page), true);
}, { lang: "en", viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
