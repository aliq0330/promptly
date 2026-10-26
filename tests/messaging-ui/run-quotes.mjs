// Alıntıla (docs/history/217-*): akışta alıntı kartı (beğeni sekizinci hedefe `quote_id`), alıntı sayfası (not, orijinale bağlantı, yorum yazma),
// Paylaş penceresinde "Alıntıla" (create_quote çağrısı, hata iletisi, sonuç bağlantısı), profildeki "Alıntılar" sekmesi, Keşfet → Alıntılar,
// aramada Alıntılar grubu, kendi alıntını silme, orijinalde "N kez alıntılandı". Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ
// (kurallar: supabase/tests/quotes.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupSpaces } from "./mock-spaces.mjs";
import { installDetailData, svg } from "./detail-fixtures.mjs";

const PORT = 4198;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const PROMPT = "b0000000-0000-4000-8000-000000000001";
const Q_BOB = "a0000000-0000-4000-8000-0000000000a1"; // Bob'un alıntısı (PROMPT'u alıntılar)
const Q_ME = "a0000000-0000-4000-8000-0000000000a2"; // Benim alıntım

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 1, following_count: 1, created_at: "2026-01-01T00:00:00Z", interests: [] });
const promptRow = (extra = {}) => ({
  id: PROMPT, title: "Ay ışığında bekleyen kitsune", description: "d", prompt_text: "cinematic portrait, soft light", tool: null, tools: [],
  content_type: "image", category: "photography", subcategory: null, status: "published", origin_type: "original", request_id: null,
  like_count: 3, save_count: 0, comment_count: 0, copy_count: 0, quote_count: 0, created_at: "2026-09-20T10:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: author(U.carol),
  prompt_media: [{ id: "m1", url: svg("#6d5bd0", "#d9d2c3", 1200, 1000), width: 1200, height: 1000, alt: "", position: 0, dominant_color: "#6d5bd0", placeholder: null }],
  prompt_tags: [],
  ...extra,
});

const quoteCard = (id, who, note, likes = 2, comments = 1) => ({
  id, author_id: who.id, author_username: who.username, author_display_name: who.display_name, author_avatar_url: null,
  content_type: "prompt", target_id: PROMPT, note, like_count: likes, comment_count: comments, created_at: "2026-09-21T09:00:00Z", is_liked: false,
});

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupSpaces(db);
  const quotes = [quoteCard(Q_BOB, U.bob, "Bu ışık gerçekten çok iyi, ekibimize örnek olsun.", 2, 1), quoteCard(Q_ME, U.alice, "Kendi notum", 0, 0)];
  const state = { feedCalls: [], likes: [], comments: [], deleted: [], created: [], quotes, profileCalls: [], searchCalls: [], promptQuoteCount: 0 };
  db.rpc.feed_page = (body) => {
    state.feedCalls.push(body);
    const kinds = body.p_kinds;
    const out = [];
    if (!kinds || kinds.includes("quote")) for (const q of state.quotes) out.push({ kind: "quote", id: q.id, created_at: q.created_at, sort_rank: q.like_count });
    if (!kinds || kinds.includes("prompt")) out.push({ kind: "prompt", id: PROMPT, created_at: "2026-09-20T10:00:00Z", sort_rank: 3 });
    return { body: out };
  };
  db.rpc.quote_feed_cards = (body) => ({ body: state.quotes.filter((q) => body.p_ids.includes(q.id)) });
  db.rpc.profile_quote_count = (body) => ({ body: state.quotes.filter((q) => q.author_id === body.p_author).length });
  db.rpc.profile_quotes_page = (body) => {
    state.profileCalls.push(body);
    return { body: state.quotes.filter((q) => q.author_id === body.p_author).map((q) => ({ id: q.id, created_at: q.created_at })) };
  };
  db.rpc.search_quotes = (body) => {
    state.searchCalls.push(body);
    return { body: state.quotes.filter((q) => (q.note ?? "").toLowerCase().includes(String(body.p_query).toLowerCase())).map((q) => ({ id: q.id, created_at: q.created_at })) };
  };
  db.rpc.create_quote = (body) => {
    db.calls.push({ method: "RPC", table: "create_quote", body });
    state.created.push(body);
    if (state.created.length > 1) return { status: 400, body: { code: "P0001", message: "already_quoted", details: "", hint: "" } };
    return { body: "a0000000-0000-4000-8000-0000000000a3" };
  };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  // Mock'tan SONRA bağlananlar önce cevaplar.
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const row = promptRow({ quote_count: state.promptQuoteCount });
    return json(route, (route.request().headers().accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
  });
  await context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      state.likes.push(JSON.parse(req.postData() || "{}"));
      return route.fulfill({ status: 201, body: "" });
    }
    return json(route, []);
  });
  await context.route(/\/rest\/v1\/prompt_comments/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.comments.push(body);
      return json(route, {
        id: "c1", body: body.body, parent_id: null, like_count: 0, created_at: "2026-09-22T10:00:00Z", edited_at: null, deleted_at: null,
        profiles: author(U.alice),
      }, 201);
    }
    return req.method() === "GET" ? json(route, []) : route.fallback();
  });
  await context.route(/\/rest\/v1\/content_quotes/, (route) => {
    const req = route.request();
    if (req.method() === "DELETE") {
      const id = new URL(req.url()).searchParams.get("id")?.replace("eq.", "");
      state.deleted.push(id);
      state.quotes = state.quotes.filter((q) => q.id !== id);
      return json(route, { id });
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/qt-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

/**
 * alıntı genel akışta Keşfet'te görünür (docs/history/221-*): Ana Sayfa yalnız "Sana özel" + "Takip Ettiklerim"dir, "En yeni" balonu kalktı.
 * `label` eski çağrı imzasını korur (artık kullanılmaz).
 */
const openNewest = async (page, label = "") => {
  void label;
  await page.goto(`${BASE}/discover`);
};
/** Akıştaki ALINTI olmayan kart (alıntı kartları da aynı başlığı gösterir). */
const promptCard = (page) => page.locator("main article").filter({ hasText: "Ay ışığında bekleyen kitsune" }).filter({ hasNotText: /alıntıladı|quoted/ }).first();
const bobQuote = (page) => page.locator("main article").filter({ hasText: "Bu ışık gerçekten çok iyi" }).first();
const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const waitFor = async (cond, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && !cond()) await new Promise((resolve) => setTimeout(resolve, 100));
};

await scenario("1. Ana Sayfa: alıntı normal gönderi kartıyla akışta — not, 'Alıntı' rozeti, alıntılayan + 'alıntıladı', sayaçlar; beğeni sekizinci hedefe (`quote_id`) yazılır", async ({ page, state }) => {
  await openNewest(page);
  const card = bobQuote(page);
  await card.waitFor();
  await card.locator("[data-quote-note]").waitFor();
  await card.getByText("Alıntı", { exact: true }).first().waitFor();
  assert.match(await card.innerText(), /alıntıladı/);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot(page, "qt-feed-card");
  await card.getByRole("button", { name: /Beğen/ }).first().click();
  await waitFor(() => state.likes.length > 0);
  assert.equal(state.likes.length, 1);
  assert.equal(state.likes[0].quote_id, Q_BOB);
  assert.ok(!state.likes[0].prompt_id);
});

await scenario("2. Alıntı sayfası: üstte alıntılayan + not, 'Orijinal içeriği aç' orijinale gider, ALINTININ yorumu `quote_id` ile yazılır", async ({ page, state }) => {
  await page.goto(`${BASE}/quotes/local?id=${Q_BOB}`);
  await page.locator(`[data-quote-page="${Q_BOB}"]`).waitFor();
  await page.locator("[data-quote-note]").getByText("Bu ışık gerçekten çok iyi").waitFor();
  const original = page.locator("[data-open-original]");
  assert.match((await original.getAttribute("href")) ?? "", /\/prompts\/local\/?\?id=b0000000/);
  // Topluluk gönderisiyle AYNI yapı: alıntılanan içeriğin NORMAL detay sayfası (Albüm bandı: başlık + prompt metni) altta çizilir.
  await page.getByRole("heading", { name: "Ay ışığında bekleyen kitsune" }).first().waitFor();
  await page.getByText("cinematic portrait, soft light").first().waitFor();
  assert.equal(await page.locator("[data-quote-engagement]").count(), 0, "ayrı alıntı etkileşim bloğu yok; detay sayfasının kendi eylem satırı kullanılır");
  const input = page.getByPlaceholder("Bir yorum yaz...").first();
  await input.fill("Aynı fikirdeyim");
  await input.press("Enter");
  await waitFor(() => state.comments.length > 0);
  assert.equal(state.comments.length, 1);
  assert.equal(state.comments[0].quote_id, Q_BOB);
  assert.ok(!state.comments[0].prompt_id);
  await shot(page, "qt-page");
});

await scenario("3. Alıntı sayfası: bilinmeyen alıntı 'bulunamadı' gösterir (varlık sızmaz)", async ({ page }) => {
  await page.goto(`${BASE}/quotes/local?id=a0000000-0000-4000-8000-0000000000ff`);
  await page.getByText("Alıntı bulunamadı").waitFor();
  await page.getByRole("link", { name: "Ana Sayfa'ya git" }).waitFor();
});

await scenario("4. Paylaş → Alıntıla: not + 'Akışta' seçili; create_quote(prompt, id, not) çağrılır, sonuç alıntı bağlantısı gösterilir; ikinci deneme hatayı açıklar", async ({ page, db, state }) => {
  await openNewest(page);
  const post = promptCard(page);
  await post.waitFor();
  await post.getByRole("button", { name: "Paylaş" }).first().click();
  const modal = page.locator('[data-share-modal="prompt"]');
  await modal.waitFor();
  await modal.locator("[data-quote-section] button[aria-expanded]").click();
  await modal.locator("[data-quote-destination=feed]").waitFor();
  await modal.locator("[data-quote-note-input]").fill("Harika bir ışık");
  await shot(page, "qt-share");
  await modal.locator("[data-quote-submit]").click();
  await modal.locator("[data-quote-open]").waitFor();
  assert.equal(state.created.length, 1);
  assert.deepEqual(state.created[0], { p_content_type: "prompt", p_content_id: PROMPT, p_note: "Harika bir ışık" });
  assert.match((await modal.locator("[data-quote-open]").getAttribute("href")) ?? "", /\/quotes\/local\/?\?id=a0000000-0000-4000-8000-0000000000a3/);
  // Aynı içeriği tekrar alıntılama denemesi: akış kutusu başarılı olduğu için kilitli; yeni kutu seçilemez.
  assert.equal(await modal.locator("[data-quote-destination=feed] input").isDisabled(), true);
  assert.ok(db.calls.filter((c) => c.table === "create_quote").length === 1);
});

await scenario("5. Alıntıla: sunucu hatası (already_quoted) nedeniyle açıklanır; sessiz başarı yok", async ({ page, state }) => {
  state.created.push({ warm: true }); // sonraki çağrı ikinci sayılır → already_quoted
  await openNewest(page);
  const post = promptCard(page);
  await post.getByRole("button", { name: "Paylaş" }).first().click();
  const modal = page.locator('[data-share-modal="prompt"]');
  await modal.locator("[data-quote-section] button[aria-expanded]").click();
  await modal.locator("[data-quote-submit]").click();
  await modal.getByText("Bu içeriği son 24 saatte zaten alıntıladın.").waitFor();
  assert.equal(await modal.locator("[data-quote-open]").count(), 0);
});

await scenario("6. Profil: 'Alıntılar' sekmesi sayıyla görünür, alıntı kartları normal ızgarada (profile_quotes_page); başka birinin boş profilinde sekme yok", async ({ page, state }) => {
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  // Profil: ilk dört bölüm sekme, "Alıntılar" "Daha fazla" menüsünde (docs/history/243-*) ve sayıyla görünür.
  await page.locator("[data-section-menu]").waitFor();
  await page.locator("[data-section-menu]").click();
  const tab = page.getByRole("radio", { name: /Alıntılar/ });
  await tab.waitFor();
  assert.match(await tab.innerText(), /1/);
  await tab.click();
  await page.locator(`[data-profile-quotes="${U.bob.id}"]`).waitFor();
  await page.locator("[data-quote-note]").getByText("Bu ışık gerçekten çok iyi").waitFor();
  assert.equal(state.profileCalls.at(-1).p_author, U.bob.id);
  await shot(page, "qt-profile");
  await page.goto(`${BASE}/profile/real?username=${U.dave.username}`);
  await page.locator("[data-section-menu]").waitFor();
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /Hakkında/ }).first().waitFor();
  assert.equal(await page.getByRole("radio", { name: /Alıntılar/ }).count(), 0);
});

await scenario("7. Keşfet → Alıntılar: `feed_page` yalnız `quote` türüyle çağrılır, tür çipleri çizilmez, alıntı kartları gelir", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("main article").first().waitFor();
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: "Alıntılar", exact: true }).click();
  await waitFor(() => state.feedCalls.some((c) => JSON.stringify(c.p_kinds) === JSON.stringify(["quote"])));
  assert.ok(state.feedCalls.some((c) => JSON.stringify(c.p_kinds) === JSON.stringify(["quote"])));
  await bobQuote(page).waitFor();
  assert.equal(await page.locator("main article").filter({ hasText: "Ay ışığında bekleyen kitsune" }).filter({ hasNotText: "alıntıladı" }).count(), 0);
});

await scenario("8. Arama: metin aramasında 'Alıntılar' grubu (search_quotes) normal gönderi kartlarıyla; eşleşme yoksa grup yok", async ({ page, state }) => {
  await page.goto(`${BASE}/discover?q=${encodeURIComponent("ışık gerçekten")}`);
  await page.locator("[data-search-quotes]").waitFor();
  await page.locator("[data-search-quotes] [data-quote-note]").getByText("Bu ışık gerçekten çok iyi").waitFor();
  assert.ok(state.searchCalls.length >= 1);
  assert.equal(state.searchCalls[0].p_query, "ışık gerçekten");
  await page.goto(`${BASE}/discover?q=${encodeURIComponent("yokboyle")}`);
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-search-quotes]").count(), 0);
});

await scenario("9. Kendi alıntını silme: ⋮ → 'Alıntıyı sil' → onay → content_quotes DELETE; kart kalkar; başkasının alıntısında silme yok", async ({ page, state }) => {
  await openNewest(page);
  const mine = page.locator("main article").filter({ hasText: "Kendi notum" }).first();
  await mine.waitFor();
  await mine.locator(`[data-quote-menu="${Q_ME}"] button[aria-haspopup=menu]`).click();
  await page.getByRole("menuitem", { name: "Alıntıyı sil" }).click();
  await page.locator("[data-quote-delete]").waitFor();
  await page.locator("[data-quote-delete-confirm]").click();
  await waitFor(() => state.deleted.length > 0);
  assert.deepEqual(state.deleted, [Q_ME]);
  await mine.waitFor({ state: "detached" });
  const other = bobQuote(page);
  await other.locator(`[data-quote-menu="${Q_BOB}"] button[aria-haspopup=menu]`).click();
  assert.equal(await page.getByRole("menuitem", { name: "Alıntıyı sil" }).count(), 0);
});

await scenario("10. Orijinalde 'N kez alıntılandı': prompt sayfasındaki meta kartında görünür; 0 ise çizilmez", async ({ page, state }) => {
  state.promptQuoteCount = 3;
  await page.goto(`${BASE}/prompts/local?id=${PROMPT}`);
  await page.locator("[data-quote-count]").waitFor();
  assert.match(await page.locator("[data-quote-count]").innerText(), /3 kez alıntılandı/);
});

await scenario("12. Alıntı sayfası = normal detay + ALINTININ eylemleri: beğeni `quote_id`, Kaydet yok, ⋮ menüsünde yalnız alıntı işleri (kendi alıntında sil, başkasınınkinde şikâyet)", async ({ page, state }) => {
  await page.goto(`${BASE}/quotes/local?id=${Q_BOB}`);
  await page.locator(`[data-quote-page="${Q_BOB}"]`).waitFor();
  await page.getByRole("heading", { name: "Ay ışığında bekleyen kitsune" }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: /^Kaydet/ }).count(), 0, "alıntı kaydedilmez");
  await page.getByRole("button", { name: /Beğen/ }).first().click();
  await waitFor(() => state.likes.length > 0);
  assert.equal(state.likes[0].quote_id, Q_BOB);
  assert.ok(!state.likes[0].prompt_id, "orijinalin beğenisine karışmaz");
  await page.getByRole("button", { name: "Paylaş" }).first().click();
  await page.locator("[data-quote-section]").waitFor({ state: "detached" }).catch(() => {});
  await page.keyboard.press("Escape");
  const menu = page.locator('button[aria-label="Gönderi seçenekleri"]').first();
  await menu.click();
  await page.getByRole("menuitem", { name: /Şikayet/ }).first().waitFor();
  assert.equal(await page.getByRole("menuitem", { name: "Bağlantıyı kopyala" }).count(), 0, "içeriğin kendi yönetimi orijinalde kalır");
  assert.equal(await page.getByRole("menuitem", { name: "Alıntıyı sil" }).count(), 0);
  await shot(page, "qt-page-scoped");
  await page.goto(`${BASE}/quotes/local?id=${Q_ME}`);
  await page.locator(`[data-quote-page="${Q_ME}"]`).waitFor();
  await page.locator('button[aria-label="Gönderi seçenekleri"]').first().click();
  await page.getByRole("menuitem", { name: "Alıntıyı sil" }).waitFor();
});

await scenario("11. İngilizce + telefon: kart, sayfa ve Alıntıla bölümü çevrilmiş, yatay taşma yok", async ({ page }) => {
  await openNewest(page, "Newest");
  const card = bobQuote(page);
  await card.waitFor();
  assert.match(await card.innerText(), /quoted/);
  await card.getByText("Quote", { exact: true }).first().waitFor();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  assert.equal(await overflowFree(page), true);
  await page.goto(`${BASE}/quotes/local?id=${Q_BOB}`);
  await page.locator(`[data-quote-page="${Q_BOB}"]`).waitFor();
  await page.getByText("Open the original").waitFor();
  assert.equal(await overflowFree(page), true);
  await shot(page, "qt-mobile");
}, { lang: "en", viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
for (const [s, n] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}`);
console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
