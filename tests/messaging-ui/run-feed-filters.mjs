// Ana Sayfa / Keşfet süzgeç düzeni (docs/history/221-*): Ana Sayfa = Sana özel + Takip Ettiklerim, gönderi türü çipleri, "takip ettiklerim"
// süzgeçleri (kişi / etiket / AI aracı → feed_page p_authors / p_tags / p_tools); Keşfet = içerik kategorileri + sıralama (Önerilen · En yeni · Popüler ·
// En çok kullanılan) + AI Araçları / Etiketler / Yaratıcılar / Topluluklar bölümleri + seçili bölüme göre arama.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — süzgeçlerin kendisi sunucu kuralıdır ve supabase/tests/feed-filters.sql'de sınanır
// (burada `feed_page` taklidi o kuralı kabaca yineler: farklı süzgeçler VE, kişi/araç VEYA, etiketlerin HEPSİ).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4191/promptly";
const server = await serve(4191);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (i) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const TAG = (slug, label) => ({ slug, label });
// 1 bob · resim+kedi · midjourney:v7 | 2 carol · resim · midjourney | 3 carol · kedi · flux | 4 bob · (etiketsiz) · flux | 5 carol · resim+kedi · flux | 6 bob · resim · —
const SPEC = [
  { i: 1, by: U.bob, tags: ["resim", "kedi"], tools: ["midjourney:v7"] },
  { i: 2, by: U.carol, tags: ["resim"], tools: ["midjourney"] },
  { i: 3, by: U.carol, tags: ["kedi"], tools: ["flux"] },
  { i: 4, by: U.bob, tags: [], tools: ["flux"] },
  { i: 5, by: U.carol, tags: ["resim", "kedi"], tools: ["flux"] },
  { i: 6, by: U.bob, tags: ["resim"], tools: [] },
];
const LABELS = { resim: "Resim", kedi: "Kedi" };
function promptRow({ i, by, tags, tools }) {
  return {
    id: pid(i), title: `Prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: null, tools,
    content_type: "image", category: "photography", subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 10 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.UTC(2026, 9, 20, 12 - i)).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(by),
    prompt_media: [{ id: `m${i}`, url: svg("#6d5bd0", "#d9d2c3", 1200, 900), width: 1200, height: 900, alt: `Görsel ${i}`, position: 0, dominant_color: "#6d5bd0", placeholder: svg("#6d5bd0", "#d9d2c3", 24, 18) }],
    prompt_tags: tags.map((slug) => ({ tags: TAG(slug, LABELS[slug]) })),
  };
}
/** `many` → 30 gönderi: ilk altı yukarıdaki; 7..30 tek sayılar Bob, çiftler Carol, hepsi #resim (tek sayfaya sığmaz: sayfalama sınanır). */
const makeRows = (many) => [...SPEC, ...(many ? Array.from({ length: 24 }, (_, k) => ({ i: 7 + k, by: (7 + k) % 2 ? U.bob : U.carol, tags: ["resim"], tools: [] })) : [])].map(promptRow);
const toolMatch = (row, tools) => row.tools.some((r) => tools.includes(r.split(":")[0]));

/** `feed_page` taklidi: sunucu kuralının kabası (kapsam, tür, tek araç, çoklu kişi/etiket/araç). */
function feedPage(body, state) {
  state.feedCalls.push(body);
  let list = state.rows.filter((r) => r.status === "published");
  if (body.p_scope === "following") list = list.filter((r) => state.followedIds.includes(r.profiles.id));
  if (body.p_authors?.length) list = list.filter((r) => body.p_authors.includes(r.profiles.id));
  if (body.p_tags?.length) list = list.filter((r) => body.p_tags.every((slug) => r.prompt_tags.some((t) => t.tags.slug === slug)));
  if (body.p_tools?.length) list = list.filter((r) => toolMatch(r, body.p_tools));
  if (body.p_tool) list = list.filter((r) => toolMatch(r, [body.p_tool]));
  if (body.p_kinds && !body.p_kinds.includes("prompt")) list = [];
  list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const limit = Math.min(body.p_limit ?? 18, 50);
  if (body.p_after_id) {
    const at = list.findIndex((r) => r.id === body.p_after_id);
    list = list.slice(at + 1);
  }
  return { body: list.slice(0, limit).map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 0 })) };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false, many = false, follows = true, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = makeRows(many);
  const state = { rows, feedCalls: [], forYouCalls: [], followedIds: follows ? [U.bob.id, U.carol.id] : [], toolFollows: ["midjourney"], tagFollows: ["resim", "kedi"], writes: [], requests: [] };
  if (follows) {
    db.follow({ id: ME }, U.bob);
    db.follow({ id: ME }, U.carol);
  }
  db.rpc.feed_page = (body) => feedPage(body, state);
  db.rpc.for_you_page = (body) => {
    state.forYouCalls.push(body);
    return { body: state.rows.slice(0, 3).map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i, reason_kind: "creator", reason_ref: null })) };
  };
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.discover_tool_counts = () => ({ body: [{ tool_id: "flux", post_count: 3 }, { tool_id: "midjourney", post_count: 7 }] });
  db.rpc.search_content = (body) => {
    state.searchCalls = [...(state.searchCalls ?? []), body];
    return { body: [] };
  };
  db.rpc.browse_communities = () => ({ body: [] });
  db.rpc.search_communities = () => ({ body: [] });
  setup?.({ db, state });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  // Kayıtlar mock'tan SONRA bağlanır: önce bunlar cevaplar.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    const list = rows.filter((r) => ids.includes(r.id));
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/tag_follows/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.tagFollows.map((slug) => ({ tag_slug: slug, tags: TAG(slug, LABELS[slug] ?? slug) }))) });
    if (req.method() === "POST") {
      const row = JSON.parse(req.postData() || "{}");
      state.writes.push(["tag-follow", row.tag_slug]);
      state.tagFollows.unshift(row.tag_slug);
      return route.fulfill({ status: 201, body: "" });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  await context.route(/\/rest\/v1\/tool_follows/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.toolFollows.map((tool_id) => ({ tool_id }))) });
    if (req.method() === "POST") {
      const row = JSON.parse(req.postData() || "{}");
      state.writes.push(["tool-follow", row.tool_id]);
      state.toolFollows.unshift(row.tool_id);
      return route.fulfill({ status: 201, body: "" });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => {
    const stats = (slug, label, n) => ({ slug, label, prompt_usage_count: n, request_usage_count: 0, usage_count: n, created_at: "2026-01-01T00:00:00Z" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([stats("resim", "Resim", 30), stats("kedi", "Kedi", 20), stats("logo", "Logo", 5)]) });
  });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("request", (req) => state.requests.push(req.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ff-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const waitFor = async (cond, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await new Promise((resolve) => setTimeout(resolve, 100));
};
/** Görünen kartların başlıkları (sıralı). */
const titles = (page) => page.locator("main article h2, main article h3").allInnerTexts().then((list) => list.map((s) => s.trim()).filter((s) => /^Prompt \d+$/.test(s)));
const waitTitles = async (page, expected) => {
  const end = Date.now() + 8000;
  let last = [];
  while (Date.now() < end) {
    last = await titles(page);
    if (JSON.stringify(last) === JSON.stringify(expected)) return last;
    await page.waitForTimeout(100);
  }
  assert.deepEqual(last, expected);
};
const openFilter = async (page) => {
  // İlk eşleşme katlanmış çubuğun (inert) kopyası olabilir: asıl kontrol satırındaki düğme sonuncudur.
  await page.getByRole("button", { name: /^(Filtre|Filter)(,|$)/ }).last().evaluate((el) => el.click());
  await page.getByRole("dialog").waitFor();
};
const closeFilter = async (page) => {
  await page.getByRole("dialog").getByRole("button", { name: /Filtreleri Uygula|Apply filters/ }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
};
const sheetChip = (page, name) => page.getByRole("dialog").getByRole("button", { name, exact: true });
const lastFollowingCall = (state) => [...state.feedCalls].reverse().find((c) => c.p_scope === "following");
/** Ana Sayfa'yı açar ve hidrasyonu bekler (statik HTML'deki düğmelere hidrasyondan önce dokunmak kaybolur): oturumlu = Sana özel yüklendi, misafir = vitrin yüklendi. */
const gotoHome = async (page, state, { guest = false } = {}) => {
  await page.goto(`${BASE}/`);
  await waitFor(() => (guest ? state.feedCalls.length : state.forYouCalls.length) > 0, 8000);
};
const homeTab = (page, name) => page.getByRole("tablist", { name: /Akış görünümü|Feed view/ }).getByRole("tab", { name, exact: true });
/**
 * Sekmeyi seçer ve seçildiğini doğrular; soğuk açılışta (build'ten hemen sonra) bir tıklama React olayları yeniden oynatırken kaybolabiliyor —
 * kullanıcı gibi bir kez daha dokunulur. Üç denemeden sonra da seçilmediyse test düşer.
 */
const selectHomeTab = async (page, name) => {
  const tab = homeTab(page, name);
  for (let attempt = 0; attempt < 3; attempt++) {
    await tab.click();
    const end = Date.now() + 1500;
    while (Date.now() < end) {
      if ((await tab.getAttribute("aria-selected")) === "true") return;
      await page.waitForTimeout(100);
    }
  }
  assert.equal(await tab.getAttribute("aria-selected"), "true", `${name} sekmesi seçilmedi`);
};

// ───────────────────────────── Ana Sayfa ─────────────────────────────
await scenario("1. Ana Sayfa: yalnız Sana özel + Takip Ettiklerim; En yeni / Popüler / Etiketlerim kalktı; tür çipleri; kategori süzgeci Ana Sayfa'da yok", async ({ page, state }) => {
  await gotoHome(page, state);
  const tabs = page.getByRole("tablist", { name: "Akış görünümü" });
  await tabs.waitFor();
  assert.deepEqual((await tabs.getByRole("tab").allInnerTexts()).map((s) => s.trim()), ["Sana özel", "Takip Ettiklerim"]);
  assert.equal(await homeTab(page, "Sana özel").getAttribute("aria-selected"), "true", "oturumlu varsayılan Sana özel");
  for (const gone of ["En yeni", "Popüler", "Etiketlerim"]) assert.equal(await page.getByRole("tab", { name: gone, exact: true }).count(), 0, `${gone} balonu yok`);
  const kinds = page.getByRole("group", { name: "Gönderi türü" }).first();
  assert.equal(await kinds.getByRole("button").count(), 5, "Hepsi + dört tür");
  await openFilter(page);
  await page.getByRole("dialog").getByRole("heading", { name: "Gönderi türü" }).waitFor();
  for (const taxonomy of ["İçerik türü", "Kategori", "Alt kategori"]) assert.equal(await page.getByRole("dialog").getByRole("heading", { name: taxonomy }).count(), 0, `${taxonomy} yalnız Keşfet'te`);
  assert.equal(await page.getByRole("dialog").getByRole("heading", { name: "Kişiler" }).count(), 0, "Sana özel'de takip edilenler süzgeci yok");
  assert.equal(await overflowFree(page), true);
});

await scenario("2. Takip Ettiklerim: takip edilen kişilerin gönderileri KRONOLOJİK (feed_page following + newest), süzgeçsiz çağrıda yeni argüman yok", async ({ page, state }) => {
  await gotoHome(page, state);
  await selectHomeTab(page, "Takip Ettiklerim");
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
  const call = lastFollowingCall(state);
  assert.equal(call.p_scope, "following");
  assert.equal(call.p_order, "newest", "kronolojik; yeniden sıralama yok");
  assert.equal(call.p_kinds, null);
  for (const key of ["p_authors", "p_tags", "p_tools", "p_tag", "p_tool"]) assert.ok(!(key in call), `${key} süzgeçsiz çağrıda gönderilmez (eski imza çalışmaya devam eder)`);
  assert.equal(call.p_content_type, null);
  const forYouBefore = state.forYouCalls.length;
  await page.waitForTimeout(300);
  assert.equal(state.forYouCalls.length, forYouBefore, "Takip Ettiklerim açıkken Sana özel yeniden istenmez");
});

await scenario("3. Takip edilenler süzgeci: kişi / etiket / araç seçilir, özetle görünür, sunucuya p_authors / p_tags / p_tools gider; sonuç daralır", async ({ page, state }) => {
  await gotoHome(page, state);
  await selectHomeTab(page, "Takip Ettiklerim");
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
  await openFilter(page);
  const dialog = page.getByRole("dialog");
  for (const heading of ["Kişiler", "Etiketler", "AI araçları"]) await dialog.getByRole("heading", { name: heading }).waitFor();
  assert.ok(await sheetChip(page, "Bob").count(), "takip edilen kişi çipi");
  assert.ok(await sheetChip(page, "Carol").count());
  await sheetChip(page, "#Resim").waitFor();
  await sheetChip(page, "Midjourney").waitFor();
  assert.equal(await sheetChip(page, "Flux").count(), 0, "takip edilmeyen araç çip değil");
  // Kişi: Bob → yalnız Bob'un gönderileri.
  await sheetChip(page, "Bob").click();
  await waitFor(() => lastFollowingCall(state)?.p_authors);
  assert.deepEqual(lastFollowingCall(state).p_authors, [U.bob.id]);
  assert.ok(!lastFollowingCall(state).p_tags && !lastFollowingCall(state).p_tools);
  await closeFilter(page);
  await waitTitles(page, ["Prompt 1", "Prompt 4", "Prompt 6"]);
  const summary = page.locator("[data-followed-filter-summary]");
  await summary.getByRole("button", { name: "Bob filtresini kaldır" }).waitFor();
  // Etiket (HEPSİ): Bob + #Resim.
  await openFilter(page);
  await sheetChip(page, "#Resim").click();
  await closeFilter(page);
  await waitTitles(page, ["Prompt 1", "Prompt 6"]);
  assert.deepEqual(lastFollowingCall(state).p_tags, ["resim"]);
  // İkinci etiket: Resim VE Kedi birlikte olmalı → Bob + resim + kedi = yalnız Prompt 1.
  await openFilter(page);
  await sheetChip(page, "#Kedi").click();
  await closeFilter(page);
  await waitTitles(page, ["Prompt 1"]);
  assert.deepEqual([...lastFollowingCall(state).p_tags].sort(), ["kedi", "resim"]);
  // Araç: Midjourney (v7 modeli de eşleşir) → hâlâ Prompt 1.
  await openFilter(page);
  await sheetChip(page, "Midjourney").click();
  await closeFilter(page);
  assert.deepEqual(lastFollowingCall(state).p_tools, ["midjourney"]);
  await waitTitles(page, ["Prompt 1"]);
  assert.equal(await summary.getByRole("button").count(), 5, "dört kaldırılabilir hap (Bob, #Resim, #Kedi, Midjourney) + Filtreleri temizle");
  await shot(page, "ff-home-filters");
  // Tek bir hapı kaldırmak yalnız onu çıkarır.
  await summary.getByRole("button", { name: "Bob filtresini kaldır" }).click();
  await waitFor(() => !lastFollowingCall(state).p_authors);
  assert.ok(!lastFollowingCall(state).p_authors);
  // Etiketler (resim VE kedi) + araç (Midjourney) hâlâ geçerli: Carol'ün Flux gönderisi (Prompt 5) araca takılır.
  await waitTitles(page, ["Prompt 1"]);
  await summary.getByRole("button", { name: "Midjourney filtresini kaldır" }).click();
  await waitFor(() => !lastFollowingCall(state).p_tools);
  await waitTitles(page, ["Prompt 1", "Prompt 5"]);
  // Hepsini temizle: süzgeçsiz çağrıya dönülür, özet kalkar.
  await summary.getByRole("button", { name: "Filtreleri temizle" }).click();
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
  const plain = lastFollowingCall(state);
  for (const key of ["p_authors", "p_tags", "p_tools"]) assert.ok(!(key in plain), `${key} temizlenince gönderilmez`);
  assert.equal(await summary.count(), 0);
  // Seçimler yalnız görünümdür: takip yazımı yok.
  assert.deepEqual(state.writes, []);
});

await scenario("4. Sayfalama ve süzgeç: süzgeç değişince ilk sayfa baştan gelir (imleç sıfırlanır), eski sonuçlar karışmaz", async ({ page, state }) => {
  const names = (list) => list.map((r) => `Prompt ${Number(r.id.slice(-12))}`);
  const newest = (list) => [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const all = names(newest(state.rows));
  const bob = names(newest(state.rows.filter((r) => r.profiles.id === U.bob.id)));
  await page.goto(`${BASE}/`);
  await selectHomeTab(page, "Takip Ettiklerim");
  await waitTitles(page, all.slice(0, 18));
  await page.getByRole("button", { name: "Daha fazla yükle" }).click();
  await waitTitles(page, all);
  const more = state.feedCalls.filter((c) => c.p_scope === "following" && c.p_after_id);
  assert.equal(more[0].p_after_id, pid(18), "sonraki sayfa son satırın imlecinden");
  // Süzgeç → yeni sorgu: imleç yok, önceki sayfaların kartları gitti, yalnız Bob'un listesi.
  await openFilter(page);
  await sheetChip(page, "Bob").click();
  await closeFilter(page);
  await waitTitles(page, bob);
  const afterFilter = lastFollowingCall(state);
  assert.equal(afterFilter.p_after_id, null, "yeni sorgu imleç taşımaz");
  assert.deepEqual(afterFilter.p_authors, [U.bob.id]);
  // Süzgeç kalkınca ilk sayfaya (18 kart) dönülür; önceki "daha fazla" sonucu geri gelmez.
  await openFilter(page);
  await sheetChip(page, "Bob").click();
  await closeFilter(page);
  await waitTitles(page, all.slice(0, 18));
  assert.equal(lastFollowingCall(state).p_after_id, null);
}, { many: true });

await scenario("5. Filtreye uyan paylaşım yoksa: dürüst boş durum + 'Filtreleri temizle' sonuçları geri getirir", async ({ page, state }) => {
  await gotoHome(page, state);
  await selectHomeTab(page, "Takip Ettiklerim");
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
  await openFilter(page);
  await sheetChip(page, "Bob").click();
  await sheetChip(page, "#Kedi").click();
  await sheetChip(page, "Midjourney").click();
  await closeFilter(page);
  // Bob'un kedi etiketli Midjourney gönderisi = Prompt 1 var; Carol'ü seç → Carol + kedi + midjourney = yok.
  await openFilter(page);
  await sheetChip(page, "Bob").click();
  await sheetChip(page, "Carol").click();
  await closeFilter(page);
  await page.getByText("Bu filtrelere uyan paylaşım yok").waitFor();
  await page.getByRole("button", { name: "Filtreleri temizle" }).last().click();
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
});

await scenario("6. Sana özel: süzgeç bölümü yok, for_you_page'e yeni argüman gitmez; tür çipi p_kinds'ı süzer; Takip'e geçip dönünce tür seçimi korunur", async ({ page, state }) => {
  await gotoHome(page, state);
  await homeTab(page, "Sana özel").waitFor();
  await page.getByRole("group", { name: "Gönderi türü" }).first().getByRole("button", { name: "Promptlar" }).click();
  await waitFor(() => state.forYouCalls.some((c) => c.p_kinds?.[0] === "prompt"));
  const call = state.forYouCalls.find((c) => c.p_kinds?.[0] === "prompt");
  for (const key of ["p_authors", "p_tags", "p_tools"]) assert.ok(!(key in call), `Sana özel ${key} almaz`);
  await selectHomeTab(page, "Takip Ettiklerim");
  await waitFor(() => lastFollowingCall(state));
  assert.deepEqual(lastFollowingCall(state).p_kinds, ["prompt"], "tür çipi iki görünümde ortak");
});

await scenario("7. Misafir: iki görünüm de giriş ister, hiçbir akış isteği yapılmaz", async ({ page, state }) => {
  await gotoHome(page, state, { guest: true });
  await page.getByText("Sana özel akış için giriş yap").waitFor();
  await selectHomeTab(page, "Takip Ettiklerim");
  await page.getByText("Takip ettiklerin burada görünür").waitFor();
  assert.equal(state.feedCalls.filter((c) => c.p_scope === "following").length, 0, "takip akışı istenmez");
  assert.equal(state.forYouCalls.length, 0, "Sana özel istenmez");
}, { guest: true });

await scenario("8. İngilizce + telefon: sekmeler, süzgeç bölümleri ve özet çevrili; yatay taşma yok", async ({ page, state }) => {
  await gotoHome(page, state);
  const tabs = page.getByRole("tablist", { name: "Feed view" });
  await tabs.waitFor();
  assert.deepEqual((await tabs.getByRole("tab").allInnerTexts()).map((s) => s.trim()), ["For you", "Following"]);
  await selectHomeTab(page, "Following");
  await waitTitles(page, ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]);
  await openFilter(page);
  for (const heading of ["People", "Tags", "AI tools"]) await page.getByRole("dialog").getByRole("heading", { name: heading }).waitFor();
  await sheetChip(page, "Bob").click();
  await closeFilter(page);
  await page.locator("[data-followed-filter-summary]").getByRole("button", { name: "Remove the Bob filter" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).first().waitFor();
  assert.equal(await overflowFree(page), true);
  await shot(page, "ff-home-mobile-en");
  assert.ok(state.feedCalls.length > 0);
}, { lang: "en", viewport: { width: 390, height: 844 } });

// ───────────────────────────── Keşfet ─────────────────────────────
// Keşfet bölümleri TEK menüdedir (docs/history/233-*): "Tümü ▾" → radyo satırları; sıralama Filtre penceresindedir.
const sectionMenu = (page) => page.locator("[data-section-menu]").first();
const openMenu = async (page) => {
  await sectionMenu(page).click();
  await page.getByRole("radiogroup", { name: /Keşfet bölümleri|Discover sections/ }).waitFor();
};
const sectionNames = async (page) => {
  await openMenu(page);
  const names = (await page.getByRole("radiogroup", { name: /Keşfet bölümleri|Discover sections/ }).getByRole("radio").allInnerTexts()).map((s) => s.trim());
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  return names;
};
const sortRadios = (page) => page.getByRole("dialog").getByRole("radiogroup", { name: /Sırala|Sort/ }).getByRole("radio");
const sortNames = async (page) => {
  await openFilter(page);
  const names = (await sortRadios(page).allInnerTexts()).map((s) => s.trim());
  await closeFilter(page);
  return names;
};
const pickSort = async (page, name) => {
  await openFilter(page);
  await sortRadios(page).filter({ hasText: name }).first().click();
  await closeFilter(page);
};
const lastDiscoverCall = (state) => state.feedCalls[state.feedCalls.length - 1];
const openSection = async (page, name) => {
  await openMenu(page);
  await page.getByRole("radio", { name, exact: true }).click();
};

await scenario("10. Keşfet bölümleri: dört içerik kategorisi + Spaces/Alıntılar + AI Araçları · Etiketler · Yaratıcılar · Topluluklar", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  await sectionMenu(page).waitFor();
  const names = await sectionNames(page);
  assert.equal(names[0], "Tümü");
  for (const wanted of ["Promptlar", "AI Araçları", "Etiketler", "Yaratıcılar", "Topluluklar", "Spaces"]) assert.ok(names.includes(wanted), `${wanted} bölümü var: ${names.join(" | ")}`);
  assert.ok(names.indexOf("Promptlar") < names.indexOf("AI Araçları") && names.indexOf("Spaces") < names.indexOf("AI Araçları"), "içerikler önce, takip edilecekler sonra");
  assert.equal(await overflowFree(page), true);
});

await scenario("11. Keşfet sıralama: Önerilen (varsayılan, recommended) · En yeni · Popüler; En çok kullanılan yalnız Promptlar'da; başka bölüme geçince Önerilen'e döner", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await waitFor(() => state.feedCalls.length > 0);
  await sectionMenu(page).waitFor();
  assert.deepEqual(await sortNames(page), ["Önerilen", "En yeni", "Popüler"]);
  await openFilter(page);
  assert.equal(await sortRadios(page).first().getAttribute("aria-checked"), "true", "Önerilen seçili");
  await closeFilter(page);
  assert.equal(state.feedCalls[0].p_order, "recommended", "varsayılan sıra Önerilen");
  await pickSort(page, "Popüler");
  await waitFor(() => lastDiscoverCall(state).p_order === "popular");
  assert.equal(lastDiscoverCall(state).p_order, "popular");
  await pickSort(page, "En yeni");
  await waitFor(() => lastDiscoverCall(state).p_order === "newest");
  // Promptlar: ek olarak En çok kullanılan (kopyalama sayacı gerçek).
  await openSection(page, "Promptlar");
  await waitFor(() => lastDiscoverCall(state).p_kinds?.[0] === "prompt");
  assert.deepEqual(await sortNames(page), ["Önerilen", "En yeni", "Popüler", "En çok kullanılan"]);
  await pickSort(page, "En çok kullanılan");
  await waitFor(() => lastDiscoverCall(state).p_order === "used");
  assert.equal(lastDiscoverCall(state).p_order, "used");
  // İstekler'de kullanım sayacı yok: seçenek yok ve sıra Önerilen'e düşer (anlamsız sıra gönderilmez).
  await openSection(page, "İstekler");
  await waitFor(() => lastDiscoverCall(state).p_kinds?.[0] === "request");
  assert.equal(lastDiscoverCall(state).p_order, "recommended");
  assert.deepEqual(await sortNames(page), ["Önerilen", "En yeni", "Popüler"]);
});

await scenario("12. Gelişmiş süzgeç seçili bölüme uyar: AI aracı (p_tool) içerik bölümlerinde; Spaces'te tür/kategori/araç sunucuya gitmez; Temizle hepsini sıfırlar", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await openSection(page, "Promptlar");
  await waitFor(() => lastDiscoverCall(state).p_kinds?.[0] === "prompt");
  await openFilter(page);
  await page.getByRole("dialog").getByRole("heading", { name: "AI aracı" }).waitFor();
  await sheetChip(page, "FLUX").click();
  await waitFor(() => lastDiscoverCall(state).p_tool === "flux");
  assert.equal(lastDiscoverCall(state).p_tool, "flux");
  await closeFilter(page);
  await waitTitles(page, ["Prompt 3", "Prompt 4", "Prompt 5"]);
  // İçerik türü çipi (Görsel) Filtre penceresindedir (docs/history/233-*): seçilir, Promptlar'da sunucuya gider.
  await openFilter(page);
  await sheetChip(page, "Görsel").click();
  await waitFor(() => lastDiscoverCall(state).p_content_type === "image");
  assert.equal(lastDiscoverCall(state).p_content_type, "image");
  await closeFilter(page);
  // Spaces: bu süzgeçlerin anlamı yok → sorguya karışmaz (sunucu aksi hâlde Space'i eler) ve sheet'te bölümleri çizilmez.
  await openSection(page, "Spaces");
  await waitFor(() => lastDiscoverCall(state).p_kinds?.[0] === "space");
  const spaceCall = lastDiscoverCall(state);
  assert.ok(!spaceCall.p_tool && spaceCall.p_content_type === null && spaceCall.p_category === null, "Spaces'e tür/kategori/araç taşınmaz (aksi hâlde sunucu Space'i eler)");
  await openFilter(page);
  assert.equal(await page.getByRole("dialog").getByRole("heading", { name: "AI aracı" }).count(), 0);
  await closeFilter(page);
  // Promptlar'a dönünce seçim durur; Temizle sıfırlar ve sıra (süzgeç değil) değişmez.
  await openSection(page, "Promptlar");
  await waitFor(() => lastDiscoverCall(state).p_tool === "flux");
  assert.equal(lastDiscoverCall(state).p_content_type, "image", "seçimler bölümler arasında korunur");
  await openFilter(page);
  await page.getByRole("dialog").getByRole("button", { name: "Temizle" }).click();
  await closeFilter(page);
  await waitFor(() => !lastDiscoverCall(state).p_tool);
  assert.ok(!lastDiscoverCall(state).p_tool);
});

await scenario("13. Keşfet → AI Araçları: araçlar gönderi sayısıyla (en çok gönderi önce), araç sayfasına bağlantı, Takip Et yazılır", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await openSection(page, "AI Araçları");
  const section = page.locator("[data-tools-section]");
  await section.waitFor();
  const rows = section.locator("li");
  await rows.first().waitFor();
  const first = await rows.first().innerText();
  assert.match(first, /Midjourney/);
  assert.match(first, /7 gönderi/);
  assert.match(await rows.nth(1).innerText(), /FLUX/);
  assert.match(await rows.nth(1).innerText(), /3 gönderi/);
  assert.match((await rows.first().getByRole("link").first().getAttribute("href")) ?? "", /\/tools\/local\/?\?id=midjourney/);
  // Süzgeç/sıralama denetimleri entity bölümünde yok.
  assert.equal(await page.getByRole("button", { name: /^(Filtre|Filter)(,|$)/ }).count(), 0);
  const flux = section.locator("li").filter({ hasText: "FLUX" }).first();
  await flux.getByRole("button", { name: /Takip Et|Follow/ }).click();
  await waitFor(() => state.writes.some((w) => w[0] === "tool-follow"));
  assert.deepEqual(state.writes.find((w) => w[0] === "tool-follow"), ["tool-follow", "flux"]);
  assert.equal(await overflowFree(page), true);
  await shot(page, "ff-discover-tools");
});

await scenario("14. Keşfet → Etiketler: etiketler gerçek kullanım sayısıyla, en çok kullanılan önce, her satırda Takip Et", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await openSection(page, "Etiketler");
  const section = page.locator("[data-tags-section]");
  await section.waitFor();
  const rows = section.locator("li");
  await rows.first().waitFor();
  assert.match(await rows.first().innerText(), /#Resim/);
  assert.match(await rows.first().innerText(), /30/);
  assert.match(await rows.nth(2).innerText(), /#Logo/);
  await rows.nth(2).getByRole("button", { name: /Takip Et/ }).click();
  await waitFor(() => state.writes.some((w) => w[0] === "tag-follow"));
  assert.deepEqual(state.writes.find((w) => w[0] === "tag-follow"), ["tag-follow", "logo"]);
});

await scenario("15. Keşfet → Topluluklar: gözat listesi gömülü, ikinci bir arama kutusu yok (üstteki kutu topluluk arar)", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await openSection(page, "Topluluklar");
  await page.getByText(/Henüz|topluluk/i).first().waitFor();
  await waitFor(() => state.requests.some((u) => u.includes("rpc/browse_communities")));
  assert.equal(await page.locator('main input[type="search"]').count(), 0, "bölümde ikinci arama kutusu yok");
  assert.equal(await page.getByTestId("all-search").count(), 0);
  assert.ok(await page.getByPlaceholder("Topluluklar içinde ara").count(), "üstteki kutu bölüme göre adlandırılır");
});

await scenario("16. Arama seçili bölüme göre: Promptlar'da yalnız prompt aranır (sekme yok), Tümü'nde dört tür + sekmeler; Yaratıcılar/Topluluklar/Etiketler/Araçlar kendi sonucunu arar", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  const box = () => page.getByRole("combobox").or(page.locator('main input[type="text"], main input:not([type])')).first();
  // Tümü: dört tür + sekmeler.
  await page.getByPlaceholder("Prompt veya kullanıcı ara").first().fill("kedi");
  await waitFor(() => (state.searchCalls ?? []).length >= 4);
  assert.deepEqual([...new Set(state.searchCalls.map((c) => c.p_kind))].sort(), ["preset", "prompt", "request", "workflow"]);
  await page.getByRole("tab", { name: "Gönderiler" }).waitFor();
  // Promptlar bölümü.
  await page.goto(`${BASE}/discover`);
  state.searchCalls = [];
  await openSection(page, "Promptlar");
  const scoped = page.getByPlaceholder("Promptlar içinde ara").first();
  await scoped.fill("kedi");
  await waitFor(() => (state.searchCalls ?? []).length >= 1);
  await page.waitForTimeout(500);
  assert.deepEqual([...new Set(state.searchCalls.map((c) => c.p_kind))], ["prompt"], "yalnız prompt aranır");
  assert.equal(await page.getByRole("tab", { name: "Gönderiler" }).count(), 0, "kapsamlı aramada sekme satırı yok");
  // Araçlar bölümü: ağ araması yok, katalog süzülür.
  await page.goto(`${BASE}/discover`);
  state.searchCalls = [];
  await openSection(page, "AI Araçları");
  await page.getByPlaceholder("AI Araçları içinde ara").first().fill("mid");
  const section = page.locator("[data-tools-section]");
  await section.locator("li").first().waitFor();
  assert.equal(await section.locator("li").count(), 1);
  assert.match(await section.locator("li").first().innerText(), /Midjourney/);
  assert.equal((state.searchCalls ?? []).length, 0);
  // Yaratıcılar bölümü: kişi araması (profiles), gönderi araması yok.
  await page.goto(`${BASE}/discover`);
  state.searchCalls = [];
  state.requests.length = 0;
  await openSection(page, "Yaratıcılar");
  await page.getByPlaceholder("Yaratıcılar içinde ara").first().fill("bob");
  await waitFor(() => state.requests.some((u) => u.includes("/rest/v1/profiles") && u.includes("ilike")));
  assert.ok(state.requests.some((u) => u.includes("/rest/v1/profiles") && u.includes("ilike")), "profil araması yapıldı");
  assert.equal((state.searchCalls ?? []).length, 0, "gönderi araması yapılmadı");
  void box;
});

await scenario("17. İngilizce + telefon: bölümler, sıralama ve süzgeç çevrili; yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/discover`);
  // Dile özgü ad: hidrasyondan ÖNCEKİ (Türkçe) HTML'i değil çevrilmiş menüyü bekler.
  await page.getByRole("button", { name: /^All/ }).first().waitFor();
  await page.waitForFunction(() => /All/.test(document.querySelector("[data-section-menu]")?.textContent ?? ""));
  const names = await sectionNames(page);
  for (const wanted of ["All", "Prompts", "AI tools", "Tags", "Creators", "Communities"]) assert.ok(names.includes(wanted), `${wanted}: ${names.join(" | ")}`);
  await openFilter(page);
  assert.deepEqual((await sortRadios(page).allInnerTexts()).map((x) => x.trim()), ["Recommended", "Newest", "Popular"]);
  await page.getByRole("dialog").getByRole("heading", { name: "AI tool" }).waitFor();
  await closeFilter(page);
  assert.equal(await overflowFree(page), true);
  await shot(page, "ff-discover-mobile-en");
}, { lang: "en", viewport: { width: 390, height: 844 } });

console.log(results.map(([s, n]) => `${s === "PASS" ? "✓" : "✗"} ${n}`).join("\n"));
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
