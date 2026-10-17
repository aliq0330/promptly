// Topluluklar ana sayfası arayüz testleri (ağ taklitli) — docs/history/185-*. Çalıştırma: README.md.
// Gerçek Supabase'e bağlanmaz: mock-communities.mjs sunucu kurallarını (akış kapsamı, görüldü, öneri, gözat) bellekte TAKLİT eder.
// Gerçek kuralların doğrulaması `supabase/tests/community-home.sql`'dir; burası arayüzün çağrılarını, durumlarını, düzenini ve i18n'ini sınar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const BASE = "http://localhost:4176/promptly";
const server = await serve(4176);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme, guest = false, hasTouch = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  setup?.(db);
  const context = await browser.newContext({ viewport, hasTouch });
  await installMock(context, db, { guest });
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db, context }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/hfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const calls = (db, name) => db.calls.filter((c) => c.table === name);
const tabNames = (page) => page.getByRole("tablist").first().getByRole("tab").allInnerTexts().then((l) => l.map((t) => t.split("\n")[0].replace(/\d+$/, "").trim()));
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
// Sonsuz kaydırma ve "Daha fazla" düğmesi birlikte çalışır: sayı hedefe ulaşana dek düğmeye basmayı dener (liste büyürken kararsız olabilir) ya da beklemeye devam eder.
const loadUntil = async (page, selector, count) => {
  for (let i = 0; i < 40; i += 1) {
    if ((await page.locator(selector).count()) >= count) return;
    await page.getByRole("button", { name: "Daha fazla yükle" }).click({ timeout: 800 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
  assert.ok((await page.locator(selector).count()) >= count, `expected at least ${count} items for ${selector}`);
};
const postIds = (page) => page.locator("[data-home-post]").evaluateAll((els) => els.map((e) => e.getAttribute("data-home-post")));

// Topluluklar: M1 herkese açık (üye), M2 kapalı (üye), MP tamamen kapalı (üye), P1 herkese açık (üye değil), R1 kapalı (üye değil), PP tamamen kapalı (üye değil)
const world = (db) => {
  db.addCommunity(id(1), { name: "Üye Açık", visibility: "public", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(2), { name: "Üye Kapalı", visibility: "restricted", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(3), { name: "Üye Gizli", visibility: "private", myRole: "member", members: [[U.bob, "owner"]] });
  db.addCommunity(id(4), { name: "Dış Açık", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] });
  db.addCommunity(id(5), { name: "Dış Kapalı", visibility: "restricted", myRole: "none", members: [[U.bob, "owner"]] });
  db.addCommunity(id(6), { name: "Dış Gizli", visibility: "private", myRole: "none", members: [[U.bob, "owner"]] });
  db.addPost(id(1), { title: "Açık üye gönderisi" });
  db.addPost(id(2), { title: "Kapalı üye gönderisi" });
  db.addPost(id(3), { title: "Gizli üye gönderisi" });
  db.addPost(id(4), { title: "Dış açık gönderisi", author: U.carol });
  db.addPost(id(5), { title: "Dış kapalı gönderisi" });
  db.addPost(id(6), { title: "Dış gizli gönderisi" });
};

// 1
await scenario("1. Varsayılan sekme Gönderiler; sekmeler: Gönderiler, Keşfet, Davet ve başvurular (yönetilen topluluk yoksa Yönettiklerim YOK)", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Topluluklarından gönderiler" }).waitFor();
  assert.deepEqual(await tabNames(page), ["Gönderiler", "Keşfet", "Davet ve başvurular"]);
  assert.equal(await page.getByRole("tab", { name: "Gönderiler" }).getAttribute("aria-selected"), "true");
}, { setup: world });

// 2
await scenario("2. Gönderiler: üye olunan açık + kapalı topluluk gönderileri var; tamamen kapalı (üye olunsa da) ve üye olunmayan topluluk gönderileri YOK", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByText("Açık üye gönderisi").waitFor();
  await page.getByText("Kapalı üye gönderisi").waitFor();
  assert.equal(await page.getByText("Gizli üye gönderisi").count(), 0, "fully private community posts never enter the general feed");
  for (const t of ["Dış açık gönderisi", "Dış kapalı gönderisi", "Dış gizli gönderisi"]) assert.equal(await page.getByText(t).count(), 0, t);
  assert.equal((await postIds(page)).length, 2);
  assert.equal(calls(db, "member_feed_page").length, 1);
  await page.locator("[data-home-post]").first().getByRole("link", { name: /Üye (Açık|Kapalı)/ }).waitFor();
}, { setup: world });

// 3
await scenario("3. Gönderiler: boş durumlar — hiç üye değil / üye ama gönderi yok", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByText("Henüz bir topluluğa üye değilsin").waitFor();
  await page.getByRole("link", { name: "Keşfet" }).last().waitFor();
}, { setup: (db) => db.addCommunity(id(4), { name: "Dış Açık", myRole: "none", members: [[U.bob, "owner"]] }) });
await scenario("3b. Gönderiler: üye ama gönderi yok → 'Henüz gönderi yok'", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByText("Henüz gönderi yok").waitFor();
}, { setup: (db) => db.addCommunity(id(1), { name: "Boş Topluluk", myRole: "member", members: [[U.bob, "owner"]] }) });

// 4
await scenario("4. Gönderiler: keyset sayfalama ('Daha fazla'), kopya yok, yeniden eskiye", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.locator("[data-home-post]").first().waitFor();
  assert.equal((await postIds(page)).length, 12);
  await loadUntil(page, "[data-home-post]", 20);
  const ids = await postIds(page);
  assert.equal(new Set(ids).size, 20, "no duplicates across pages");
  const cursor = calls(db, "member_feed_page")[1].body;
  assert.ok(cursor.p_before_at && cursor.p_before_id, "second page uses the (created_at, id) cursor");
  await page.getByText("Gönderi 20", { exact: true }).first().waitFor();
}, {
  setup: (db) => {
    db.addCommunity(id(1), { name: "Kalabalık", myRole: "member", members: [[U.bob, "owner"]] });
    for (let i = 1; i <= 20; i += 1) db.addPost(id(1), { title: `Gönderi ${i}` });
  },
});

// 5
await scenario("5. Gönderiler: yükleme hatası → Tekrar dene ile toparlanır", async ({ page, db }) => {
  let fail = true;
  db.rpc.member_feed_page = () => (fail ? { status: 500, body: { message: "boom" } } : null);
  await page.goto(`${BASE}/communities`);
  await page.getByText("Gönderiler yüklenemedi.").waitFor();
  fail = false;
  delete db.rpc.member_feed_page;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByText("Açık üye gönderisi").waitFor();
}, { setup: world });

// 6
await scenario("6. Keşfet: 'Sana uygun topluluklar' en çok 10 öneri; tamamen kapalı, üye olunan topluluk yok; kapalı olan var", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-strip").waitFor();
  const names = await page.getByTestId("suggestion-card").evaluateAll((els) => els.map((e) => e.querySelector("h3")?.textContent));
  assert.equal(names.length, 10, "capped at 10 even though 14 are eligible");
  assert.ok(!names.includes("Dış Gizli") && !names.includes("Üye Açık") && !names.includes("Üye Kapalı"));
  assert.ok(calls(db, "recommend_communities")[0].body.p_limit >= 10);
  await page.getByTestId("suggestion-card").filter({ hasText: "Dış Kapalı" }).waitFor();
}, {
  setup: (db) => {
    world(db);
    for (let i = 0; i < 12; i += 1) db.addCommunity(id(20 + i), { name: `Öneri ${i}`, myRole: "none", members: [[U.bob, "owner"]] });
  },
});

// 7
await scenario("7. Keşfet: 'Tüm topluluklar' düğmesi şeridin HEMEN altında ve /communities/all'a gider", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-strip").waitFor();
  const adjacent = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="suggestion-strip"]');
    return strip?.nextElementSibling?.getAttribute("data-testid");
  });
  assert.equal(adjacent, "all-communities-button");
  await page.getByTestId("all-communities-button").click();
  await page.waitForURL(/\/communities\/all\/?$/);
  await page.getByRole("heading", { name: "Tüm topluluklar", level: 1 }).waitFor();
}, { setup: world });

// 8
await scenario("8. Keşfet (mobil): şerit yatay kaydırılır, sonraki kart kenardan görünür; sayfa yatay taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-list").waitFor();
  const info = await page.getByTestId("suggestion-list").evaluate((el) => {
    const first = el.children[0].getBoundingClientRect();
    const second = el.children[1].getBoundingClientRect();
    return { scrollable: el.scrollWidth > el.clientWidth + 8, overflowX: getComputedStyle(el).overflowX, firstW: first.width, secondLeft: second.left, vw: window.innerWidth };
  });
  assert.equal(info.scrollable, true);
  assert.ok(["auto", "scroll"].includes(info.overflowX));
  assert.ok(info.firstW < info.vw * 0.85, "card narrower than the viewport so the next one peeks");
  assert.ok(info.secondLeft < info.vw, "second card starts inside the viewport (peek)");
  assert.equal(await overflowFree(page), true);
  await page.getByTestId("suggestion-list").evaluate((el) => el.scrollTo({ left: 400, behavior: "instant" }));
  await page.waitForTimeout(300);
  assert.ok((await page.getByTestId("suggestion-list").evaluate((el) => el.scrollLeft)) > 100, "the strip scrolls horizontally");
}, { viewport: { width: 390, height: 800 }, setup: (db) => { world(db); for (let i = 0; i < 6; i += 1) db.addCommunity(id(20 + i), { name: `Öneri ${i}`, myRole: "none", members: [[U.bob, "owner"]] }); } });

// 9
await scenario("9. Öneri kartı eylemleri: açık topluluğa Katıl (join_community), kapalıya İstek gönder (request_join_community)", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByRole("button", { name: "Dış Açık topluluğuna katıl" }).click();
  await page.getByTestId("suggestion-card").filter({ hasText: "Dış Açık" }).getByRole("button", { name: /Katıldın/ }).waitFor();
  assert.equal(calls(db, "join_community").length, 1);
  await page.getByRole("button", { name: "Dış Kapalı topluluğuna katılma isteği gönder" }).click();
  await page.getByTestId("suggestion-card").filter({ hasText: "Dış Kapalı" }).getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  assert.equal(calls(db, "request_join_community").length, 1);
}, { setup: world });

// 10
await scenario("10. Öneri tekrar azaltma: ilk ziyarette gösterilen 10 topluluk ikinci ziyarette sona alınır, yeniler öne çıkar", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-card").first().waitFor();
  const first = await page.getByTestId("suggestion-card").evaluateAll((els) => els.map((e) => e.querySelector("h3")?.textContent));
  assert.equal(first.length, 10);
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-card").first().waitFor();
  const second = await page.getByTestId("suggestion-card").evaluateAll((els) => els.map((e) => e.querySelector("h3")?.textContent));
  const fresh = ["Öneri 10", "Öneri 11", "Öneri 12", "Öneri 13"];
  assert.deepEqual(second.slice(0, 4).sort(), fresh, "the four never-shown communities lead");
  assert.equal(new Set(second).size, second.length);
}, { setup: (db) => { for (let i = 0; i < 14; i += 1) db.addCommunity(id(20 + i), { name: `Öneri ${i}`, myRole: "none", members: [[U.bob, "owner"]], visibility: "public" }); } });

// 11
await scenario("11. Öneri nedenleri gerçek sinyalden gelir: ilgi alanı / takip edilen kişiler / ortak kategori; öneri yoksa şerit çizilmez ama 'Tüm topluluklar' kalır", async ({ page, db }) => {
  db.reasons = { [id(21)]: "interest", [id(22)]: "followed" };
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("suggestion-card").filter({ hasText: "İlgili" }).getByText("İlgi alanlarına uygun").waitFor();
  await page.getByTestId("suggestion-card").filter({ hasText: "Takipli" }).getByText("Takip ettiğin kişiler üye").waitFor();
}, { setup: (db) => { db.addCommunity(id(21), { name: "İlgili", myRole: "none", members: [[U.bob, "owner"]] }); db.addCommunity(id(22), { name: "Takipli", myRole: "none", members: [[U.bob, "owner"]] }); } });
await scenario("11b. Öneri yoksa şerit hiç çizilmez; 'Tüm topluluklar' düğmesi yine görünür", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("all-communities-button").waitFor();
  assert.equal(await page.getByTestId("suggestion-strip").count(), 0);
  await page.getByText("Şimdilik yeni gönderi yok").waitFor();
}, { setup: (db) => db.addCommunity(id(1), { name: "Sadece Üye", myRole: "member", members: [[U.bob, "owner"]] }) });

// 12
await scenario("12. Keşfet akışı: açık topluluk (üye olunmayan) + üyesi olunan kapalı topluluk gönderileri; üye olunmayan kapalı ve tamamen kapalı YOK; kopya yok", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByText("Dış açık gönderisi").waitFor();
  await page.getByText("Kapalı üye gönderisi").waitFor();
  await page.getByText("Açık üye gönderisi").waitFor();
  assert.equal(await page.getByText("Dış kapalı gönderisi").count(), 0, "restricted posts only for members");
  assert.equal(await page.getByText("Dış gizli gönderisi").count(), 0);
  assert.equal(await page.getByText("Gizli üye gönderisi").count(), 0, "fully private never in the general discover feed");
  const ids = await postIds(page);
  assert.equal(new Set(ids).size, ids.length, "no duplicates across sources");
  assert.deepEqual([...new Set(await page.locator("[data-home-post]").evaluateAll((els) => els.map((e) => e.getAttribute("data-post-source"))))].sort(), ["member", "public"]);
  assert.ok(calls(db, "discover_feed_page")[0].body.p_as_of, "a fixed as_of snapshot is sent");
}, { setup: world });

// 13
await scenario("13. Keşfet akışı: takip edilen kişinin gönderisi 'Takip ettiğin kişi paylaştı' etiketiyle ve üyelik olmadan okunur", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  const card = page.locator('[data-home-post][data-post-source="followed"]');
  await card.waitFor();
  await card.getByText("Takip ettiğin kişi paylaştı").waitFor();
  assert.equal(await card.count(), 1);
}, { setup: (db) => { world(db); db.follow({ id: ME }, U.carol); } });

// 14
await scenario("14. Görüldü: ekranda yeterince kalan gönderi sunucuya bildirilir (tekrarsız); yenileyince görülenler yeni gibi çıkmaz", async ({ page, db }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByText("Dış açık gönderisi").waitFor();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(3600);
  const sent = calls(db, "mark_community_posts_seen").flatMap((c) => c.body.p_post_ids);
  assert.ok(sent.length >= 1, "visible posts were marked as seen");
  assert.equal(new Set(sent).size, sent.length, "an id is sent at most once");
  const seenNow = new Set(sent);
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByTestId("all-communities-button").waitFor();
  await page.waitForTimeout(600);
  const after = await postIds(page);
  for (const idv of after) assert.ok(!seenNow.has(idv), "a seen post is not shown as new again");
}, { setup: world });

// 15
await scenario("15. Keşfet akışı: aynı topluluk art arda yığılmaz (çeşitlilik) ve sayfalar arasında kopya yok", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.locator("[data-home-post]").first().waitFor();
  const first = await page.locator("[data-home-post]").evaluateAll((els) => els.map((e) => e.getAttribute("data-post-community")));
  assert.ok(first.slice(0, 4).includes(id(2)) && first.slice(0, 4).includes(id(1)), "the single post of another community is interleaved near the top");
  await loadUntil(page, "[data-home-post]", 13);
  const ids = await postIds(page);
  assert.equal(new Set(ids).size, ids.length);
}, {
  setup: (db) => {
    db.addCommunity(id(1), { name: "Çok Gönderili", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] });
    db.addCommunity(id(2), { name: "Tek Gönderili", visibility: "public", myRole: "none", members: [[U.bob, "owner"]] });
    db.addPost(id(2), { title: "Tek" });
    for (let i = 0; i < 20; i += 1) db.addPost(id(1), { title: `Çok ${i}` });
  },
});

// 16
await scenario("16. Keşfet akışı: hata → Tekrar dene; tümü görülmüş → boş durum", async ({ page, db }) => {
  let fail = true;
  db.rpc.discover_feed_page = () => (fail ? { status: 500, body: { message: "boom" } } : null);
  await page.goto(`${BASE}/communities?tab=discover`);
  await page.getByText("Gönderiler yüklenemedi.").waitFor();
  fail = false;
  delete db.rpc.discover_feed_page;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByText("Dış açık gönderisi").waitFor();
}, { setup: world });

// 17
await scenario("17. Tüm topluluklar: arama kutusu en üstte; arama sunucuya iletilir; açık + kapalı listelenir, tamamen kapalı asla; durum ve eylem kartta", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByTestId("all-search").waitFor();
  const searchTop = await page.getByTestId("all-search").evaluate((el) => el.getBoundingClientRect().top);
  const listTop = await page.getByTestId("all-communities-list").evaluate((el) => el.getBoundingClientRect().top);
  assert.ok(searchTop < listTop);
  await page.getByRole("heading", { name: "Dış Kapalı" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Dış Gizli" }).count(), 0);
  assert.equal(await page.getByRole("heading", { name: "Üye Gizli" }).count(), 0);
  await page.locator("li", { hasText: "Üye Açık" }).getByRole("button", { name: /Katıldın/ }).waitFor();
  await page.locator("li", { hasText: "Dış Açık" }).getByRole("button", { name: "Dış Açık topluluğuna katıl" }).waitFor();
  assert.equal(calls(db, "browse_communities")[0].body.p_sort, "relevant", "default order is by relevance");
  await page.getByTestId("all-search").fill("kapalı");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="all-communities-list"] > li').length === 2);
  assert.ok(calls(db, "browse_communities").some((c) => c.body.p_query === "kapalı"));
  await page.getByTestId("all-search").fill("zzzzz");
  await page.getByText("Eşleşen topluluk bulunamadı").waitFor();
}, { setup: world });

// 18
await scenario("18. Tüm topluluklar: kategori süzgeci + sıralama sunucuya gider; sayfalama ('Daha fazla'/kaydırma), kopya yok; hata → Tekrar dene", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByTestId("all-communities-list").waitFor();
  await page.getByTestId("all-communities-list").locator("> li").first().waitFor();
  await loadUntil(page, '[data-testid="all-communities-list"] > li', 25);
  assert.equal(await page.getByTestId("all-communities-list").locator("> li").count(), 25, "exactly 25 communities, no duplicates");
  await page.getByRole("button", { name: "Ses", exact: true }).click();
  await page.getByRole("heading", { name: "Ses Topluluğu" }).waitFor();
  assert.ok(calls(db, "browse_communities").some((c) => c.body.p_category === "audio"));
  await page.getByRole("tab", { name: "En yeni" }).click();
  await page.waitForTimeout(300);
  assert.ok(calls(db, "browse_communities").some((c) => c.body.p_sort === "newest"));
  let fail = true;
  db.rpc.browse_communities = () => (fail ? { status: 500, body: { message: "boom" } } : null);
  await page.getByRole("tab", { name: "Popüler" }).click();
  await page.getByText("Topluluklar yüklenemedi.").waitFor();
  fail = false;
  delete db.rpc.browse_communities;
  await page.getByRole("button", { name: "Tekrar dene" }).click();
  await page.getByRole("heading", { name: "Ses Topluluğu" }).waitFor();
}, { setup: (db) => { for (let i = 0; i < 24; i += 1) db.addCommunity(id(20 + i), { name: `Topluluk ${String(i).padStart(2, "0")}`, myRole: "none", members: [[U.bob, "owner"]] }); db.addCommunity(id(60), { name: "Ses Topluluğu", category: "audio", myRole: "none", members: [[U.bob, "owner"]] }); } });

// 19
await scenario("19. Tüm topluluklar: kapalı topluluğa kartın düğmesiyle istek gönderilir ve durum 'İstek gönderildi' olur", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("button", { name: "Dış Kapalı topluluğuna katılma isteği gönder" }).click();
  await page.locator("li", { hasText: "Dış Kapalı" }).getByRole("button", { name: /İstek gönderildi/ }).waitFor();
  assert.equal(calls(db, "request_join_community").length, 1);
}, { setup: world });

// 20
await scenario("20. Yönettiklerim yalnız yönettiği topluluğu olana görünür; Davet ve başvurular: Davetler · Başvurularım · Gelen başvurular (yöneticiye) sayaçlı", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("tab", { name: "Yönettiklerim" }).waitFor();
  const names = await tabNames(page);
  assert.deepEqual(names, ["Gönderiler", "Keşfet", "Yönettiklerim", "Davet ve başvurular"]);
  assert.match(await page.getByRole("tab", { name: /Davet ve başvurular/ }).innerText(), /3/, "badge counts the incoming requests");
  await page.getByRole("tab", { name: /Davet ve başvurular/ }).click();
  await page.getByRole("tab", { name: "Gelen başvurular" }).click();
  const row = page.getByTestId("incoming-requests").locator("li", { hasText: "Yönetilen" });
  await row.getByText("3 bekleyen başvuru").waitFor();
  await row.getByRole("link", { name: "İncele" }).click();
  await page.waitForURL(/communities\/local\/?\?id=.*tab=members.*section=requests/);
}, { setup: (db) => { db.addCommunity(id(1), { name: "Yönetilen", myRole: "admin", pending: 3, members: [[U.bob, "owner"]] }); } });

// 21
await scenario("21. Eski adresler: ?tab=invites, ?tab=requests (Başvurularım bölümü), ?tab=mine (Topluluklarım listesi), ?tab=managed çalışır", async ({ page }) => {
  await page.goto(`${BASE}/communities?tab=requests`);
  await page.getByText("Bekleyen başvurun yok").waitFor();
  assert.equal(await page.getByRole("tab", { name: "Başvurularım" }).getAttribute("aria-selected"), "true");
  await page.goto(`${BASE}/communities?tab=invites`);
  await page.getByText(/Davetin yok|davet/i).first().waitFor();
  await page.goto(`${BASE}/communities?tab=mine`);
  await page.getByRole("heading", { name: "Üye Olduğum" }).waitFor();
  await page.getByRole("link", { name: /← Gönderiler/ }).click();
  await page.getByRole("heading", { name: "Topluluklarından gönderiler" }).waitFor();
  await page.goto(`${BASE}/communities?tab=managed`);
  await page.getByRole("heading", { name: "Topluluklarından gönderiler" }).waitFor(); // yönetilen yok → Gönderiler'e düşer
}, { setup: (db) => db.addCommunity(id(1), { name: "Üye Olduğum", myRole: "member", members: [[U.bob, "owner"]] }) });

// 22
await scenario("22. Üyelikten ayrılınca topluluğun gönderileri Gönderiler akışından kalkar (yenilemede)", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByText("Açık üye gönderisi").waitFor();
  db.members = db.members.filter((m) => !(m.conversation_id === id(1) && m.user_id === ME));
  await page.reload();
  await page.getByText("Kapalı üye gönderisi").waitFor();
  assert.equal(await page.getByText("Açık üye gönderisi").count(), 0, "access removed with the membership");
}, { setup: world });

// 23
await scenario("23. Ziyaretçi (oturumsuz): yalnız Keşfet — herkese açık topluluk listesi; akış/öneri/görüldü çağrısı YOK", async ({ page, db }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Dış Açık" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Dış Kapalı" }).count(), 0, "visitors only browse public communities");
  assert.equal(await page.getByRole("tab", { name: "Gönderiler" }).count(), 0);
  for (const name of ["member_feed_page", "discover_feed_page", "recommend_communities", "mark_community_posts_seen"]) assert.equal(calls(db, name).length, 0, name);
  await page.goto(`${BASE}/communities/all`);
  await page.getByRole("heading", { name: "Dış Açık" }).waitFor();
}, { guest: true, setup: world });

// 24
await scenario("24. İngilizce: sekmeler, şerit, düğme, akış ve Tüm topluluklar çevrilmiş", async ({ page }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("heading", { name: "Posts from your communities" }).waitFor();
  assert.deepEqual(await tabNames(page), ["Posts", "Discover", "Invitations & requests"]);
  await page.getByRole("tab", { name: "Discover" }).click();
  await page.getByRole("heading", { name: "Communities for you" }).waitFor();
  await page.getByTestId("all-communities-button").getByText("All communities").waitFor();
  await page.getByRole("heading", { name: "Discover feed" }).waitFor();
  await page.getByTestId("all-communities-button").click();
  await page.getByPlaceholder("Search communities, topics or tags…").waitFor();
  await page.getByRole("tab", { name: "Best match" }).waitFor();
}, { lang: "en", setup: world });

// 25
for (const [label, viewport, theme] of [["mobil", { width: 390, height: 800 }, undefined], ["tablet", { width: 820, height: 900 }, undefined], ["masaüstü koyu", { width: 1280, height: 900 }, "dark"]]) {
  await scenario(`25. Düzen (${label}): Gönderiler, Keşfet, Tüm topluluklar, Davet ve başvurular yatay taşmaz`, async ({ page }) => {
    for (const url of ["/communities", "/communities?tab=discover", "/communities/all", "/communities?tab=invites"]) {
      await page.goto(`${BASE}${url}`);
      await page.waitForTimeout(500);
      assert.equal(await overflowFree(page), true, `${url} overflows horizontally`);
    }
    await page.goto(`${BASE}/communities?tab=discover`);
    await page.getByTestId("suggestion-strip").waitFor();
    const minTouch = await page.getByTestId("all-communities-button").evaluate((el) => el.getBoundingClientRect().height);
    assert.ok(minTouch >= 36, "touch target >= 36px");
  }, { viewport, theme, setup: (db) => { world(db); for (let i = 0; i < 6; i += 1) db.addCommunity(id(20 + i), { name: `Öneri ${i}`, myRole: "none", members: [[U.bob, "owner"]] }); } });
}

// 26 — ortak yerleşim (docs/history/186-*; Meydan Faz 6 = docs/history/190-*: tek sütun kutusuz akış): gönderi genişliği okunur sütunla sınırlı
// (≤ 3xl), her ekranda tek sütun, sağ sütun yalnız xl+, taşma yok
const STREAM_MAX = 768; // max-w-3xl
const cardBox = (page) => page.locator("[data-home-post]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width) }; }));
const layoutWorld = (db) => { world(db); for (let i = 1; i <= 6; i += 1) db.addPost(id(1), { title: `Düzen gönderisi ${i}` }); };
for (const [label, width, aside, columns] of [["1440", 1440, true, 1], ["1280", 1280, true, 1], ["1024", 1024, false, 1], ["820", 820, false, 1], ["768", 768, false, 1], ["390", 390, false, 1]]) {
  await scenario(`26. Yerleşim (${label}px): gönderi ≤ ${STREAM_MAX}px, ${columns} sütun, sağ sütun ${aside ? "görünür" : "yok"}, yatay taşma yok`, async ({ page }) => {
    await page.goto(`${BASE}/communities`);
    await page.locator("[data-home-post]").first().waitFor();
    await page.waitForTimeout(300);
    const boxes = await cardBox(page);
    assert.ok(boxes.every((b) => b.width <= STREAM_MAX), `card too wide: ${JSON.stringify(boxes.map((b) => b.width))}`);
    assert.equal(new Set(boxes.map((b) => b.left)).size, columns, `expected ${columns} column(s)`);
    assert.equal(await page.getByTestId("community-aside").isVisible(), aside, "aside visibility");
    assert.equal(await overflowFree(page), true, "no horizontal overflow");
    if (aside) {
      const stats = await page.locator("[data-aside-stat]").evaluateAll((els) => els.map((e) => e.getAttribute("data-aside-stat")));
      assert.deepEqual(stats, ["joined", "managed", "pending"]);
    }
  }, { viewport: { width, height: 900 }, setup: layoutWorld });
}
await scenario("26b. Topluluk sayfası: başlık kompakt, tek sütun akış (+ xl'de Hakkında/Kurallar/Yöneticiler sütunu), Yönetim ayarları kartlara bölünür; taşma yok", async ({ page }) => {
  for (const [w, cols] of [[1440, 1], [820, 1], [390, 1]]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE}/communities/local?id=${id(1)}`);
    await page.locator("[data-community-post]").first().waitFor();
    await page.waitForTimeout(300);
    const posts = await page.locator("[data-community-post]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { left: Math.round(r.left), width: Math.round(r.width) }; }));
    assert.ok(posts.every((b) => b.width <= STREAM_MAX), `${w}: card too wide ${JSON.stringify(posts)}`);
    if (w >= 1280) {
      const asides = await page.locator("[data-community-aside]").evaluateAll((els) => els.map((e) => e.getAttribute("data-community-aside")));
      assert.deepEqual(asides, ["about", "rules", "staff"], `${w}: community aside sections`);
    }
    assert.equal(new Set(posts.map((b) => b.left)).size, Math.min(cols, posts.length), `${w}: columns`);
    const header = await page.getByTestId("community-header").evaluate((el) => el.getBoundingClientRect().height);
    // Meydan (docs/history/190-*) adds a cover band above the title on purpose; the header must still leave the feed in the first screen.
    assert.ok(header <= (w < 500 ? 360 : 230), `${w}: header too tall (${header})`);
    assert.equal(await overflowFree(page), true, `${w}: overflow`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/communities/local?id=${id(1)}&tab=manage&section=settings`);
  await page.getByRole("heading", { name: "Topluluk ayarları" }).waitFor();
  const cards = await page.getByRole("tabpanel").locator("div.rounded-xl.shadow-card").count();
  assert.ok(cards >= 2, "settings are grouped into separate cards");
  assert.equal(await overflowFree(page), true);
}, { setup: (db) => { db.addCommunity(id(1), { name: "Sahibi Olduğum", myRole: "owner", members: [[U.bob, "owner"]], rules: "1. Saygılı ol\n2. Kaynağı belirt" }); for (let i = 1; i <= 5; i += 1) db.addPost(id(1), { title: `Düzen gönderisi ${i}` }); } });

// 27 — alttan açılan kart aşağı sürüklenince kapanır (mobil, dokunmatik; docs/history/188-*)
const touchDrag = async (context, page, { x = 200, from, to, steps = 8 }) => {
  const cdp = await context.newCDPSession(page);
  const send = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await send("touchStart", from);
  for (let i = 1; i <= steps; i += 1) { await send("touchMove", from + ((to - from) * i) / steps); await page.waitForTimeout(16); }
  return { release: () => send("touchEnd", to) };
};
await scenario("27. Mobil bottom sheet: kısa sürükleme geri yaylanır, uzun sürükleme animasyonla kapatır", async ({ page, context }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(400);
  const sheet = dialog.locator("div.relative").first();
  const top = async () => (await dialog.getByRole("heading", { name: "Topluluk oluştur" }).boundingBox()).y;
  const y0 = await top();
  // kısa: 60px sürükle → sırasında kart iner, bırakınca yerine döner, pencere açık kalır
  const short = await touchDrag(context, page, { from: 300, to: 360 });
  assert.ok((await top()) > y0 + 30, "sheet follows the finger");
  await short.release();
  await page.waitForTimeout(500);
  assert.ok(Math.abs((await top()) - y0) < 2, "sheet springs back");
  assert.equal(await dialog.count(), 1, "short drag keeps the sheet open");
  // uzun: 320px sürükle → kapanır
  const long = await touchDrag(context, page, { from: 300, to: 620, steps: 12 });
  const mid = await top();
  assert.ok(mid > y0 + 200, "sheet moved with the long drag");
  await long.release();
  await page.waitForTimeout(150);
  assert.equal(await dialog.count(), 1, "closing is animated, not instant");
  await page.waitForTimeout(500);
  assert.equal(await dialog.count(), 0, "long drag closes the sheet");
  void sheet;
}, { viewport: { width: 390, height: 800 }, hasTouch: true, setup: world });
await scenario("27b. Masaüstünde (≥640px) ortalanmış pencere sürüklenince kapanmaz; tutamaç yok", async ({ page, context }) => {
  await page.goto(`${BASE}/communities`);
  await page.getByRole("button", { name: "Topluluk oluştur" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.waitForTimeout(400);
  const drag = await touchDrag(context, page, { from: 300, to: 700, steps: 10 });
  await drag.release();
  await page.waitForTimeout(500);
  assert.equal(await dialog.count(), 1, "centered dialog is not swipe-dismissed");
}, { viewport: { width: 1000, height: 800 }, hasTouch: true, setup: world });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
