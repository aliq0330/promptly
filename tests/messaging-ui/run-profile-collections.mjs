// Profildeki koleksiyon halkaları ve Mesajlar liste satırları (Meydan, docs/history/192-*) — ağ taklitli. Gerçek Supabase'e KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4176/promptly";
const server = await serve(4176);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const COLLECTIONS = [
  { id: "c1000000-0000-4000-8000-000000000001", name: "Işık denemeleri", visibility: "public", item_count: 4, follower_count: 2, is_default: false },
  { id: "c1000000-0000-4000-8000-000000000002", name: "Genel", visibility: "public", item_count: 9, follower_count: 0, is_default: true },
  { id: "c1000000-0000-4000-8000-000000000003", name: "Gizli klasör", visibility: "private", item_count: 3, follower_count: 0, is_default: false },
  { id: "c1000000-0000-4000-8000-000000000004", name: "Boş koleksiyon", visibility: "public", item_count: 0, follower_count: 0, is_default: false },
];

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
/** `mock.mjs` profil sorgusunda `username=eq.` süzgecini bilmez; profil sayfası kullanıcıyı ada göre okur. */
const byUsername = ({ table, q, rows }) => {
  const name = q.get("username")?.replace(/^eq\./, "");
  if (table === "profiles" && name) return rows(Object.values(U).filter((u) => u.username === name).map(pubOf));
  return null;
};

/** Koleksiyon uçlarını taklit eder (yalnızca bu pakete özel): sahibi `owner`, herkese açık ve boş olmayanları süzmeyi İSTEMCİ ister. */
function withCollections(db, owner) {
  db.extraRoutes = async (ctx) => {
    const { table, q, rows } = ctx;
    const profile = byUsername(ctx);
    if (profile) return profile;
    if (table === "collections") {
      db.calls.push({ method: "GET", table: "collections", body: Object.fromEntries(q.entries()) });
      let list = COLLECTIONS;
      if (q.get("visibility") === "eq.public") list = list.filter((c) => c.visibility === "public");
      if (q.get("item_count") === "gt.0") list = list.filter((c) => c.item_count > 0);
      if (q.get("id")) list = list.filter((c) => `eq.${c.id}` === q.get("id"));
      return rows(list.map((c) => ({ ...c, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(owner) })));
    }
    if (table === "collection_items") {
      const ids = (q.get("collection_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",");
      // yalnızca ilk koleksiyonun kapağı var (görsel), diğeri simge karosu olarak çizilmeli
      return rows(ids.includes(COLLECTIONS[0].id) ? [{ collection_id: COLLECTIONS[0].id, created_at: "2026-02-02T00:00:00Z", prompts: { prompt_media: [{ id: "m1", url: "https://example.supabase.co/storage/v1/object/public/prompt-media/x/cover.png", width: 800, height: 800, alt: "" }] }, workflows: null, presets: null }] : []);
    }
    return null;
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", theme } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pcfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const rings = (page) => page.locator("[data-collection-rings] a");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// 1 — başkasının profili: yalnız herkese açık ve boş olmayan koleksiyonlar halka olur; her halka koleksiyonu açar; kapak varsa görsel, yoksa simge
await scenario("1. Başkasının profili: halkalar yalnız herkese açık + boş olmayan koleksiyonlar; bağlantı koleksiyona gider", async ({ page, db }) => {
  withCollections(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await rings(page).first().waitFor();
  const names = await rings(page).locator("span.truncate").allTextContents();
  assert.deepEqual(names, ["Işık denemeleri", "Genel"], "private + empty collections are not shown");
  assert.match((await rings(page).first().getAttribute("href")) ?? "", /\/collections\/local\/?\?id=c1000000-0000-4000-8000-000000000001$/);
  assert.equal(await rings(page).first().locator("div[style*='background-image']").count(), 1, "cover photo on the first ring");
  assert.equal(await rings(page).nth(1).locator("svg").count(), 1, "icon tile when there is no cover");
  assert.equal(await page.getByRole("group", { name: "Herkese açık koleksiyonlar" }).count(), 1);
  assert.equal(await overflowFree(page), true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/f7-profile.png` });
});

// 2 — kendi profilim: halkalar da görünür (özel koleksiyon sızmaz); sorgu herkese açık süzgeciyle yapılır
await scenario("2. Kendi profilim: halkalar görünür, özel koleksiyon yok, sorgu visibility=public ister", async ({ page, db }) => {
  withCollections(db, U.alice);
  await page.goto(`${BASE}/profile/real?username=${(U.alice).username}`);
  await rings(page).first().waitFor();
  assert.equal(await rings(page).count(), 2);
  const asked = db.calls.filter((c) => c.table === "collections").map((c) => c.body);
  assert.ok(asked.some((b) => b.visibility === "eq.public"), "client filters to public collections");
});

// 3 — koleksiyonu olmayan profil: şerit hiç çizilmez
await scenario("3. Halka yok: koleksiyon yoksa şerit çizilmez", async ({ page, db }) => {
  db.extraRoutes = async (ctx) => byUsername(ctx) ?? (ctx.table === "collections" || ctx.table === "collection_items" ? ctx.rows([]) : null);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-collection-rings]").count(), 0);
});

// 4 — İngilizce ad + telefon düzeni taşmaz
await scenario("4. İngilizce etiket ve 390px'te yatay taşma yok", async ({ page, db }) => {
  withCollections(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await rings(page).first().waitFor();
  assert.equal(await page.getByRole("group", { name: "Public collections" }).count(), 1);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 800 }, lang: "en" });

// 5 — Albüm (docs/history/203-*): profilin bandı (ad = h1) ve altındaki tek eylem satırı; telefonda satır tek satıra sığar
await scenario("5. Profil Albüm bandı: ad bantta, Takip Et eylem satırında; 390px'te satır tek satır, taşma yok", async ({ page, db }) => {
  withCollections(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.locator("[data-profile-band] h1", { hasText: U.bob.display_name }).waitFor();
  const row = page.locator("[data-profile-actions]");
  await row.getByRole("button", { name: "Takip Et" }).waitFor();
  await row.getByRole("button", { name: "Mesaj Gönder" }).waitFor();
  const tops = await row.evaluate((el) => [...el.children].map((c) => Math.round(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2)));
  assert.equal(new Set(tops).size, 1, `actions on one line ${JSON.stringify(tops)}`);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

// 6 — koleksiyon sayfası: bant (kapak + ad), büyük Takip Et, yan sütunda Hakkında + sahibinin diğer herkese açık koleksiyonları
await scenario("6. Koleksiyon Albüm: bant + Takip Et; Hakkında ve sahibinin diğer koleksiyonları (yalnız herkese açık + boş olmayan, kendisi hariç)", async ({ page, db }) => {
  withCollections(db, U.bob);
  await page.goto(`${BASE}/collections/local?id=${COLLECTIONS[0].id}`);
  await page.locator("[data-collection-band] h1", { hasText: COLLECTIONS[0].name }).waitFor();
  await page.locator("[data-collection-actions]").getByRole("button", { name: "Takip Et" }).waitFor();
  await page.locator('[data-collection-aside="about"]').getByText("Herkese açık").waitFor();
  await page.locator('[data-collection-aside="more"] a').first().waitFor();
  assert.deepEqual(await page.locator('[data-collection-aside="more"] a span.truncate').allTextContents(), ["Genel"]);
  assert.equal(await overflowFree(page), true);
});

// 7 — Profil bölümleri TEK menüde (docs/history/233-*): gruplar, sayılar, Filtre simgesi ve Kart | Izgara düğmesi kontrol satırında
/** Bobun iki yayınlanmış promptu: profilde Filtre simgesi / Kart | Izgara düğmesi ancak liste doluyken çıkar. */
function withPrompts(db, owner) {
  const inner = db.extraRoutes;
  const row = (i, type) => ({
    id: `b0000000-0000-4000-8000-0000000000${i}0`, title: `Prompt ${i}`, description: "d", prompt_text: `text ${i}`, tool: null, tools: [], content_type: type, category: null, subcategory: null,
    status: "published", origin_type: "original", request_id: null, like_count: i, save_count: 0, comment_count: 0, copy_count: 0, created_at: `2026-02-0${i}T00:00:00Z`, show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: pubOf(owner), prompt_media: [], prompt_tags: [],
  });
  db.extraRoutes = async (ctx) => {
    if (ctx.table === "prompts" && ctx.q.get("author_id")) return ctx.rows([row(1, "image"), row(2, "text")]);
    return inner ? inner(ctx) : null;
  };
}
const menuRadios = (page) => page.getByRole("radiogroup", { name: /Profil bölümleri|Profile sections/ }).getByRole("radio");
await scenario("7. Profil bölümleri: ilk dört bölüm sekme, kalanı 'Daha fazla ▾' menüsünde; kendi profilimde gruplar (Alıntılar · Taslaklar/Kaydedilenler/Beğeniler · Hakkında), ziyaretçide Taslak/Kaydedilen/Beğeni yok", async ({ page, db }) => {
  withCollections(db, U.alice);
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  const menu = page.locator("[data-section-menu]");
  await menu.waitFor();
  const tabs = page.getByRole("tablist", { name: "Profil bölümleri" }).getByRole("tab");
  assert.deepEqual((await tabs.allInnerTexts()).map((x) => x.replace(/\s*\d+$/, "").trim()), ["Promptlar", "Prompt İstekleri", "Workflow'lar", "Hazır Ayarlar"], "dört içerik bölümü sekme");
  assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
  assert.match(await menu.textContent(), /Daha fazla/);
  await menu.click();
  const own = (await menuRadios(page).allInnerTexts()).map((x) => x.replace(/\s*\d+$/, "").trim());
  assert.deepEqual(own, ["Alıntılar", "Taslaklar", "Kaydedilenler", "Beğeniler", "Hakkında"]);
  assert.equal(await page.locator("[data-section-option]").evaluateAll((els) => els.filter((el) => el.className.includes("border-t")).length), 2, "iki ayırıcı: kütüphane grubu ve Hakkında");
  await page.getByRole("radio", { name: /Beğeniler/ }).click();
  assert.match(await menu.textContent(), /Beğeniler/, "etkin bölüm menü düğmesinde yazar");
  assert.equal(await tabs.first().getAttribute("aria-selected"), "false");
  assert.match(await page.locator("[data-profile-section-title]").textContent(), /Beğeniler/);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await menu.waitFor();
  await menu.click();
  const other = (await menuRadios(page).allInnerTexts()).map((x) => x.replace(/\s*\d+$/, "").trim());
  for (const hidden of ["Taslaklar", "Kaydedilenler", "Beğeniler"]) assert.ok(!other.some((n) => n.startsWith(hidden)), `${hidden} ziyaretçiye gösterilmez`);
  assert.ok(other.some((n) => n.startsWith("Koleksiyonlar")), "ziyaretçide herkese açık Koleksiyonlar");
  assert.equal(await page.locator('[data-section-option="about"]').count(), 1, "Hakkında menüde");
});

await scenario("8. Profil kontrol satırı: Promptlar listesinde Filtre simgesi (tür · sıralama) + Kart | Izgara düğmesi; Hakkında'da ikisi de yok; 390px'te taşma yok", async ({ page, db }) => {
  withCollections(db, U.bob);
  withPrompts(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  const menu = page.locator("[data-section-menu]");
  await menu.waitFor();
  const filter = page.locator("[data-profile-filter]");
  await filter.waitFor();
  assert.ok(await page.locator("[data-view-toggle]").count(), "Kart | Izgara düğmesi");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/profile-sade-list-phone.png` });
  await filter.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Sırala" }).waitFor();
  await dialog.getByRole("button", { name: "En eski" }).click();
  await dialog.getByRole("button", { name: "Filtreleri Uygula" }).click();
  await dialog.waitFor({ state: "detached" });
  await menu.click();
  await page.getByRole("radio", { name: /Hakkında/ }).click();
  assert.equal(await page.locator("[data-profile-filter]").count(), 0, "Hakkında'da Filtre yok");
  assert.equal(await page.locator("[data-view-toggle]").count(), 0, "Hakkında'da görünüm düğmesi yok");
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

// 9 — Kaydedilenler: "Koleksiyonlarım" rafı (docs/history/234-*): kendi koleksiyonları (özel olan da), her biri kendi sayfasını açar
await scenario("9. Kaydedilenler: 'Koleksiyonlarım' rafı kendi koleksiyonlarını (özel dahil) gösterir, kart koleksiyon sayfasını açar", async ({ page, db }) => {
  withCollections(db, U.alice);
  await page.goto(`${BASE}/saved`);
  const shelf = page.locator("[data-saved-collections]");
  await shelf.waitFor();
  const names = (await shelf.locator("a p.truncate").allTextContents()).map((x) => x.trim());
  for (const wanted of ["Işık denemeleri", "Genel", "Gizli klasör"]) assert.ok(names.includes(wanted), `${wanted}: ${names.join(" | ")}`);
  assert.match((await shelf.locator("a").first().getAttribute("href")) ?? "", /\/collections\/local\/?\?id=/);
  assert.equal(await overflowFree(page), true);
});

// 10 — Kütüphanem (/my-content) ve Moderasyon (docs/history/235-*): tek bölüm menüsü + simge satırı
await scenario("10. Kütüphanem: sekme satırı yok; 'Promptlar ▾' menüsü (Taslaklar çizgiden sonra), arama simgesi alanı açar, Filtre'de görünürlük, '+' oluşturmaya gider", async ({ page, db }) => {
  withCollections(db, U.alice);
  withPrompts(db, U.alice);
  await page.goto(`${BASE}/my-content`);
  const menu = page.locator("[data-section-menu]");
  await menu.waitFor();
  assert.equal(await page.getByRole("tablist").count(), 0, "sekme satırı yok");
  await menu.click();
  const names = (await page.getByRole("radio").allInnerTexts()).map((x) => x.split("\n")[0].replace(/\d+$/, "").trim());
  assert.deepEqual(names.slice(-1), ["Taslaklar"]);
  assert.ok(names.includes("Workflow'lar") || names.some((n) => /Workflow/.test(n)));
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  assert.match((await page.locator("[data-list-create]").getAttribute("href")) ?? "", /create|prompt/);
  await page.locator("[data-list-search]").click();
  await page.getByRole("searchbox").waitFor();
  await page.locator("[data-list-filter]").click();
  await page.getByRole("dialog").getByRole("heading", { name: /Görünürlük|Visibility/i }).waitFor();
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 390, height: 844 } });

await scenario("11. Moderasyon: 4 sekme yerine tek menü; şikâyet durumu Filtre penceresinde; menüden Kullanıcılar seçilir", async ({ page, db }) => {
  db.rpc.is_moderator = () => ({ body: true });
  await page.goto(`${BASE}/moderation`);
  const menu = page.locator("[data-section-menu]");
  await menu.waitFor();
  assert.equal(await page.getByRole("tablist").count(), 0, "sekme satırı yok");
  await page.locator("[data-list-filter]").click();
  await page.getByRole("dialog").getByRole("button", { name: /Açık|Open/ }).first().waitFor();
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await menu.click();
  await page.getByRole("radio", { name: /Kullanıcılar|Users/ }).click();
  assert.match(await menu.textContent(), /Kullanıcılar|Users/);
  assert.equal(await page.locator("[data-list-filter]").count(), 0, "Filtre yalnız Şikâyetler'de");
});

// 12 — Sade profil (docs/history/243-*): tek şerit (hikâye + koleksiyon, aralarında çizgi), sekme tıklayınca bölüm değişir, telefonda sekme satırı + "Daha fazla" tek satır
await scenario("12. Sade profil: sekme seçimi başlığı değiştirir; şeritte koleksiyonlar tek kaydırma satırında; 390px'te sekmeler + Daha fazla tek satırda, taşma yok", async ({ page, db }) => {
  withCollections(db, U.bob);
  withPrompts(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.locator("[data-profile-band] h1", { hasText: U.bob.display_name }).waitFor();
  await rings(page).first().waitFor();
  assert.equal(await page.locator("[data-profile-rail]").count(), 1, "tek şerit");
  assert.equal(await page.locator("[data-profile-rail] [data-collection-rings]").count(), 1, "koleksiyonlar şeridin içinde");
  const tab = (name) => page.getByRole("tab", { name: new RegExp(name) });
  await tab("Workflow").click();
  assert.equal(await tab("Workflow").getAttribute("aria-selected"), "true");
  assert.match(await page.locator("[data-profile-section-title]").textContent(), /Workflow/);
  const row = await page.locator("[data-profile-tabs]").evaluate((el) => {
    const top = (node) => Math.round(node.getBoundingClientRect().top);
    return [...el.querySelectorAll("[role=tab], [data-section-menu]")].map(top);
  });
  assert.equal(new Set(row).size, 1, `sekmeler ve Daha fazla tek satırda ${JSON.stringify(row)}`);
  assert.equal(await overflowFree(page), true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/profile-sade-phone.png`, fullPage: true });
}, { viewport: { width: 390, height: 844 } });

await scenario("13. Sade profil: hikâye ve koleksiyon yoksa şerit hiç yer kaplamaz; Hakkında sekmesi bilgileri + katkı haritasını taşır, yan sütun yok", async ({ page, db }) => {
  db.extraRoutes = async (ctx) => byUsername(ctx) ?? (ctx.table === "collections" || ctx.table === "collection_items" ? ctx.rows([]) : null);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.locator("[data-profile-band] h1").waitFor();
  await page.waitForTimeout(500);
  assert.equal(await page.locator("[data-profile-rail]").isVisible(), false, "boş şerit görünmez");
  assert.equal(await page.locator("[data-profile-aside]").count(), 0, "yan sütun yok");
  await page.locator("[data-section-menu]").click();
  await page.locator('[data-section-option="about"]').click();
  await page.getByText(/tarihinde katıldı/).last().waitFor();
  assert.equal(await overflowFree(page), true);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/profile-sade-desktop.png`, fullPage: true });
});

await browser.close(); server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
