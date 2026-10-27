// Sayfalama (docs/history/254-*): 3000+ gönderili profil "1000" diyordu ve hepsini tek seferde çekip çiziyordu. Profilin Promptlar/Beğeniler listesi,
// Kütüphanem, Kaydedilenler, koleksiyon sayfası: 24'erli sayfalar + sunucu süzgeci; sayılar sunucudan (`profile_content_stats`); Taslaklar 50'şer çizilir;
// etiket kataloğu 1000'i aşınca sayfa sayfa okunur. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (sorgu kuralları: supabase/tests/feed-page-media.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4203/promptly";
const server = await serve(4203);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const TYPES = ["image", "text", "audio", "video"];

/** The i-th prompt of a big library, newest first (i = 0 is the newest): types cycle, every 7th is "Sadece ben". */
const promptRow = (i, owner) => ({
  id: `b1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Prompt ${i + 1}`, description: "d", prompt_text: `text ${i + 1}`, tool: null, tools: [], content_type: TYPES[i % 4], category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: i % 50, save_count: 0, comment_count: 0, copy_count: 1, created_at: new Date(Date.UTC(2026, 9, 1) - i * 60000).toISOString(), show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: i % 7 === 6 ? "private" : "public", deleted_at: null, community_id: null,
  profiles: pubOf(owner), prompt_media: [], prompt_tags: [],
});

const respond = (ctx, list, { offset, total }) =>
  ctx.route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-range": list.length ? `${offset}-${offset + list.length - 1}/${total}` : `*/${total}` },
    body: JSON.stringify(list),
  });

/**
 * A `total`-prompt library for `owner`. Answers the way PostgREST does: filters, order, `offset`/`limit` (`.range`), and — only when the request asks
 * (`Prefer: count=exact`) — the total in `Content-Range`. Every prompts request is recorded in `db.promptQueries`.
 */
function withLibrary(db, owner, { total = 3016, likes = 0, collections = [], drafts = 0, tags = 0, other = 0, blocked = 0, people = 0 } = {}) {
  const all = Array.from({ length: total }, (_, i) => promptRow(i, owner));
  db.promptQueries = [];
  db.itemQueries = [];
  db.tagQueries = [];
  db.otherQueries = [];
  db.blockQueries = [];
  db.followQueries = [];
  db.feedRpcCalls = [];
  db.rpc.profile_content_stats = () => ({ body: { prompts: total, requests: other, workflows: other, presets: other, reuse: total } });
  db.extraRoutes = async (ctx) => {
    const { table, q, method } = ctx;
    const profileName = q.get("username")?.replace(/^eq\./, "");
    if (table === "profiles" && profileName) return ctx.rows(Object.values(U).filter((u) => u.username === profileName).map(pubOf));
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? 100000);
    const wantsCount = /count=exact/.test(ctx.route.request().headers()["prefer"] ?? "");
    if (method === "HEAD") return false;
    if (table === "prompts" && q.get("author_id") && q.get("status") === "eq.draft") {
      const rows = Array.from({ length: drafts }, (_, i) => ({ id: `d1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: `Taslak ${i + 1}`, updated_at: new Date(Date.UTC(2026, 9, 1) - i * 1000).toISOString() }));
      respond(ctx, rows.slice(offset, offset + limit), { offset, total: rows.length });
      return true;
    }
    if (table === "prompts" && q.get("author_id")) {
      db.promptQueries.push({ ...Object.fromEntries(q.entries()), prefer: wantsCount ? "count=exact" : "" });
      let list = all;
      if (q.get("content_type")) list = list.filter((r) => `eq.${r.content_type}` === q.get("content_type"));
      if (q.get("visibility")) list = list.filter((r) => `eq.${r.visibility}` === q.get("visibility"));
      const text = /ilike\.%([^%]+)%/.exec(q.get("or") ?? "")?.[1];
      if (text) list = list.filter((r) => r.title.toLowerCase().includes(text.toLowerCase()));
      const order = q.get("order") ?? "";
      if (order.startsWith("created_at.asc")) list = [...list].reverse();
      else if (order.startsWith("like_count.desc")) list = [...list].sort((a, b) => b.like_count - a.like_count || a.id.localeCompare(b.id));
      respond(ctx, list.slice(offset, offset + limit), { offset, total: list.length });
      return true;
    }
    if (table === "prompt_likes" && q.get("user_id") && /prompts\s*\(/.test(ctx.sel ?? "")) {
      const rows = Array.from({ length: likes }, (_, i) => ({ created_at: new Date(Date.UTC(2026, 9, 2) - i * 60000).toISOString(), prompts: promptRow(i, U.bob) }));
      db.likeQueries = [...(db.likeQueries ?? []), { offset, limit }];
      respond(ctx, rows.slice(offset, offset + limit), { offset, total: rows.length });
      return true;
    }
    // Save-state lookups (the bookmark on each card): every prompt of the library is saved, as the real rows would say.
    if (table === "collection_items" && !/prompts\s*\(/.test(ctx.sel ?? "")) {
      const asked = (q.get("prompt_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").filter(Boolean).map((x) => x.replace(/"/g, ""));
      return ctx.rows(asked.map((id) => ({ prompt_id: id, collections: { owner_id: owner.id } })));
    }
    if (table === "collection_items") {
      db.itemQueries.push({ ...Object.fromEntries(q.entries()), prefer: wantsCount ? "count=exact" : "" });
      const rows = Array.from({ length: 60 }, (_, i) => ({ id: `e1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, created_at: new Date(Date.UTC(2026, 9, 3) - i * 60000).toISOString(), community_post_id: null, collections: { owner_id: owner.id }, prompts: promptRow(i, owner), workflows: null, presets: null }));
      respond(ctx, rows.slice(offset, offset + limit), { offset, total: rows.length });
      return true;
    }
    if (table === "collections") {
      const list = collections.filter((c) => !q.get("id") || `eq.${c.id}` === q.get("id"));
      return ctx.rows(list.map((c) => ({ ...c, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(owner) })));
    }
    // İstekler / Workflow'lar / Hazır ayarlar (yazar süzgeçli listeler): `other` satır, PostgREST gibi süzgeç + sıra + offset/limit.
    const otherKind = { prompt_requests: ["Request", "author_id", "created_at"], workflows: ["Workflow", "creator_id", "created_at"], presets: ["Preset", "creator_id", "created_at"] }[table];
    if (otherKind && q.get(otherKind[1]) && method === "GET") {
      db.otherQueries.push({ table, ...Object.fromEntries(q.entries()), prefer: wantsCount ? "count=exact" : "" });
      let list = Array.from({ length: other }, (_, i) => otherRow(table, i, owner));
      if (q.get("visibility")) list = list.filter((r) => `eq.${r.visibility}` === q.get("visibility"));
      const text = /ilike\.%([^%]+)%/.exec(q.get("or") ?? "")?.[1];
      if (text) list = list.filter((r) => r.title.toLowerCase().includes(text.toLowerCase()));
      if ((q.get("order") ?? "").startsWith("created_at.asc")) list = [...list].reverse();
      respond(ctx, list.slice(offset, offset + limit), { offset, total: list.length });
      return true;
    }
    if (table === "preset_fields") return ctx.rows([]);
    // Takipçiler / takip ettiklerim: `people` kişi, PostgREST gibi offset/limit; her istek kaydedilir.
    if (table === "follows" && method === "GET" && /profiles:/.test(ctx.sel ?? "")) {
      const side = q.get("following_id") ? "followers" : "following";
      db.followQueries.push({ side, offset, limit, order: q.get("order") ?? "" });
      const list = Array.from({ length: people }, (_, i) => ({ profiles: { id: `a2000000-0000-4000-8000-${String(i).padStart(12, "0")}`, username: `kisi${i + 1}`, display_name: `Kişi ${i + 1}`, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [] } }));
      respond(ctx, list.slice(offset, offset + limit), { offset, total: list.length });
      return true;
    }
    // Engelliler: kimlik kümesi (süzgeç için, 1000'lik sayfalarla TAMAMI) ve ayarlar listesi (profil gömülü, 30'arlı sayfa).
    if (table === "blocks" && method === "GET") {
      const people = Array.from({ length: blocked }, (_, i) => ({ id: `a1000000-0000-4000-8000-${String(i).padStart(12, "0")}`, username: `engelli${i + 1}`, display_name: `Engelli ${i + 1}`, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 0, following_count: 0, created_at: "2026-01-01T00:00:00Z", interests: [] }));
      const embedded = /profiles/.test(ctx.sel ?? "");
      db.blockQueries.push({ embedded, offset, limit, prefer: wantsCount ? "count=exact" : "" });
      const rows = people.map((u) => (embedded ? { blocked_id: u.id, profiles: u } : { blocked_id: u.id }));
      respond(ctx, rows.slice(offset, offset + limit), { offset, total: rows.length });
      return true;
    }
    if (table === "tags" && method === "GET") {
      db.tagQueries.push({ offset, limit });
      const rows = Array.from({ length: tags }, (_, i) => ({ slug: `etiket-${String(i).padStart(4, "0")}`, label: `Etiket ${String(i).padStart(4, "0")}`, prompt_usage_count: 1, request_usage_count: 0, usage_count: 1, created_at: "2026-01-01T00:00:00Z" }));
      respond(ctx, rows.slice(offset, offset + limit), { offset, total: rows.length });
      return true;
    }
    return false;
  };
}

/** The i-th request / workflow / preset of a person's library (i = 0 newest); every 5th is "Sadece ben". */
function otherRow(table, i, owner) {
  const base = {
    id: `${{ prompt_requests: "f1", workflows: "f2", presets: "f3" }[table]}000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    title: `${{ prompt_requests: "İstek", workflows: "Akış", presets: "Ayar" }[table]} ${i + 1}`,
    description: "d", tools: [], category: null, subcategory: null, like_count: 0, comment_count: 0, save_count: 0, quote_count: 0,
    created_at: new Date(Date.UTC(2026, 9, 1) - i * 60000).toISOString(), updated_at: new Date(Date.UTC(2026, 9, 1) - i * 60000).toISOString(),
    visibility: i % 5 === 4 ? "private" : "public", community_id: null, profiles: pubOf(owner),
  };
  if (table === "prompt_requests") return { ...base, creative_direction: "", preferred_tool: null, content_type: null, reference_image_url: null, status: "open", selected_response_prompt_id: null, response_count: 0, deleted_at: null, is_draft: false, prompt_request_tags: [], prompt_request_media: [] };
  if (table === "workflows") return { ...base, creator_id: owner.id, cover_url: null, content_types: [], status: "published", workflow_steps: [{ count: 2 }], workflow_tags: [], workflow_media: [] };
  return { ...base, creator_id: owner.id, cover_url: null, content_type: "text", selection: {}, status: "published", preset_tags: [] };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/pagfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
/** The profile / library list: the link carrying a card's title (a card has other links to the same prompt — picture, button). */
const titleLinks = (page) => page.locator("main a[href*='/prompts/local']").filter({ hasText: /^Prompt \d+$/ });
const titleTexts = (page) => page.evaluate(() => [...document.querySelectorAll("main a[href*='/prompts/local']")].map((a) => (a.textContent ?? "").trim()).filter((t) => /^Prompt \d+$/.test(t)));
/** Waits until `n` cards are drawn, pressing "Daha fazla" while it is there (a page may also come by itself when the button is near the screen). */
async function untilCards(page, n) {
  for (let i = 0; i < 40; i += 1) {
    if ((await titleLinks(page).count()) >= n) return;
    await page.getByTestId("load-more").click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  assert.fail(`${n} cards were never drawn (have ${await titleLinks(page).count()})`);
}

await scenario("1. Profil (3016 prompt): sayı sunucudan (3016, 1000 değil); ilk istek 24'lük ve toplamı sayar; yalnız 24 kart çizilir; Daha fazla sonraki 24'ü ekler (offset 24)", async ({ page, db }) => {
  withLibrary(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  const tab = page.getByRole("tab", { name: /^Promptlar/ });
  assert.match(await tab.innerText(), /3016/, "sekme sayısı veritabanından");
  const first = db.promptQueries[0];
  assert.equal(first.limit, "24");
  assert.equal(first.offset, "0");
  assert.equal(first.prefer, "count=exact", "toplam ilk sayfayla sayılır");
  assert.equal(first.author_id, `eq.${U.bob.id}`);
  assert.equal(first.status, "eq.published");
  assert.equal(first.community_id, "is.null");
  assert.equal(first.deleted_at, "is.null");
  assert.equal(first.or, "(origin_type.eq.original,show_on_profile.is.true)", "yalnızca orijinal / profilde gösterilen yanıt");
  assert.match(first.order, /^created_at\.desc,id\.desc$/);
  assert.equal(await titleLinks(page).count(), 24, "3016 değil 24 kart çizildi");
  assert.equal(db.promptQueries.filter((x) => !x.limit).length, 0, "sınırsız (tüm listeyi çeken) istek yok");
  await untilCards(page, 48);
  const second = db.promptQueries.find((x) => x.offset === "24");
  assert.ok(second, "ikinci sayfa offset=24 ile istendi");
  assert.equal(second.prefer, "", "sayım yalnız ilk sayfada");
  assert.ok((await titleLinks(page).count()) >= 48);
  assert.equal(await overflowFree(page), true);
});

await scenario("2. Profil: kaydırınca sonraki sayfa kendiliğinden gelir (düğme görünür alana girince); sıra ve tekrar yok", async ({ page, db }) => {
  withLibrary(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  await page.getByTestId("load-more").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll("main a[href*='/prompts/local']")].filter((a) => /^Prompt \d+$/.test((a.textContent ?? "").trim())).length >= 48);
  const titles = await titleTexts(page);
  assert.equal(new Set(titles).size, titles.length, "hiçbir prompt iki kez çizilmedi");
  assert.equal(titles[0], "Prompt 1");
  assert.equal(titles[24], "Prompt 25");
});

await scenario("3. Profil süzgeçleri sunucuda: sıralama (En eski), tür (Metin) ve arama sorguya gider; ilk sayfadan yeniden başlar; Filtre simgesi liste yenilenirken kaybolmaz", async ({ page, db }) => {
  withLibrary(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  const filter = page.locator("[data-profile-filter]");
  await filter.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "En eski" }).click();
  await dialog.getByRole("button", { name: "Filtreleri Uygula" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.waitForFunction(() => [...document.querySelectorAll("main a[href*='/prompts/local']")].map((a) => (a.textContent ?? "").trim()).find((t) => /^Prompt \d+$/.test(t)) === "Prompt 3016");
  const asc = db.promptQueries.at(-1);
  assert.match(asc.order, /^created_at\.asc,id\.asc$/);
  assert.equal(asc.offset, "0");
  await filter.click();
  await page.getByRole("dialog").getByRole("button", { name: "Metin", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Filtreleri Uygula" }).click();
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll("main a[href*='/prompts/local']")].map((a) => (a.textContent ?? "").trim()).filter((t) => /^Prompt \d+$/.test(t));
    return titles.length > 0 && titles.every((t) => Number(/\d+/.exec(t)[0]) % 4 === 2);
  });
  assert.equal(db.promptQueries.at(-1).content_type, "eq.text");
  assert.ok(await filter.count(), "Filtre simgesi yerinde");
});

await scenario("4. Profilde arama sorguya gider: başlık/açıklama eşleşmesi tek 'or' grubunda (görünürlük kuralıyla VE); yazarken her tuşta değil, bekleyip tek istek", async ({ page, db }) => {
  withLibrary(db, U.bob, { total: 200 });
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  await page.locator("[data-profile-filter]").click();
  const box = page.getByRole("dialog").getByRole("textbox");
  await box.waitFor();
  const before = db.promptQueries.length;
  await box.pressSequentially("Prompt 15", { delay: 40 });
  await page.getByRole("dialog").getByRole("button", { name: "Filtreleri Uygula" }).click();
  await page.waitForFunction(() => {
    const titles = [...document.querySelectorAll("main a[href*='/prompts/local']")].map((a) => (a.textContent ?? "").trim()).filter((t) => /^Prompt \d+$/.test(t));
    return titles.length > 0 && titles.every((t) => /^Prompt 15/.test(t));
  });
  const searched = db.promptQueries.slice(before);
  assert.ok(searched.length <= 2, `tuş başına değil, bekleyerek (${searched.length} istek)`);
  assert.match(searched.at(-1).or, /^\(and\(or\(origin_type\.eq\.original,show_on_profile\.is\.true\),or\(title\.ilike\.%Prompt 15%,description\.ilike\.%Prompt 15%\)\)\)$/);
}, {});

await scenario("5. Kendi profilim → Beğeniler: 24'erli sayfalar (offset 0, 24); sayı ilk sayfayla gelir", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 10, likes: 60 });
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /Beğeniler/ }).click();
  await titleLinks(page).first().waitFor();
  assert.deepEqual(db.likeQueries[0], { offset: 0, limit: 24 });
  assert.equal(await titleLinks(page).count(), 24);
  await untilCards(page, 48);
  assert.ok(db.likeQueries.some((x) => x.offset === 24 && x.limit === 24), JSON.stringify(db.likeQueries));
});

await scenario("6. Kütüphanem: Promptlar 24'erli sayfa, sayı menüde sunucudan (3016), 'Sadece ben' süzgeci sorguya gider", async ({ page, db }) => {
  withLibrary(db, U.alice);
  await page.goto(`${BASE}/my-content`);
  await titleLinks(page).first().waitFor();
  assert.equal(await titleLinks(page).count(), 24);
  assert.equal(db.promptQueries[0].limit, "24");
  await untilCards(page, 48);
  assert.ok(db.promptQueries.some((x) => x.offset === "24"));
  await page.locator("[data-section-menu]").click();
  assert.match(await page.getByRole("radio", { name: /^Promptlar/ }).innerText(), /3016/, "menüdeki sayı sunucudan");
  await page.keyboard.press("Escape");
  await page.locator("button[aria-label^='Filtre'], button[title='Filtre']").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sadece ben" }).click();
  await page.waitForTimeout(800);
  assert.equal(db.promptQueries.at(-1).visibility, "eq.private");
  assert.equal(db.promptQueries.at(-1).offset, "0");
});

await scenario("7. Kaydedilenler ve koleksiyon: 24'erli sayfa (offset 0, 24, 48) ve 'Daha fazla'; hepsini bir kerede çeken istek yok", async ({ page, db }) => {
  const collection = { id: "c1000000-0000-4000-8000-000000000001", name: "Büyük koleksiyon", visibility: "public", item_count: 60, follower_count: 0, is_default: false };
  withLibrary(db, U.alice, { total: 5, collections: [collection] });
  await page.goto(`${BASE}/saved`);
  await titleLinks(page).first().waitFor();
  assert.equal(await titleLinks(page).count(), 24);
  assert.equal(db.itemQueries.find((x) => x.limit)?.limit, "24");
  await untilCards(page, 60).catch(async (e) => { throw new Error(`${e.message}; queries: ${JSON.stringify(db.itemQueries.map((x) => [x.offset, x.limit]))}; last titles: ${JSON.stringify((await titleTexts(page)).slice(-3))}; has60: ${await page.evaluate(() => document.body.innerText.includes("Prompt 60"))}; hasMoreBtn: ${await page.getByTestId("load-more").count()}; items: ${await page.locator("main li, main article").count()}`); });
  assert.deepEqual(db.itemQueries.filter((x) => x.limit).map((x) => x.offset), ["0", "24", "48"], "yalnız 24'erli sayfalar");
  assert.equal(db.itemQueries.filter((x) => x.limit === "24" && x.prefer === "count=exact").length, 1, "toplam yalnız ilk sayfada sayıldı");
  assert.equal(await page.getByTestId("load-more").count(), 0, "son sayfadan sonra düğme yok");
  db.itemQueries.length = 0;
  await page.goto(`${BASE}/collections/local?id=${collection.id}`);
  await titleLinks(page).first().waitFor();
  const mine = db.itemQueries.find((x) => x.collection_id === `eq.${collection.id}` && x.limit);
  assert.equal(mine?.limit, "24");
  assert.equal(await titleLinks(page).count(), 24);
});

await scenario("8. Taslaklar (130): hepsi okunur ama 50'şer çizilir; Daha fazla 100'e, sonra 130'a çıkarır", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 3, drafts: 130 });
  await page.goto(`${BASE}/my-content`);
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: /Taslaklar/ }).click();
  const rows = page.locator("main li").filter({ hasText: /Taslak \d+/ });
  await rows.first().waitFor();
  assert.ok((await rows.count()) >= 50 && (await rows.count()) < 130, "yalnız ilk pencere çizildi (50), hepsi değil");
  for (let i = 0; i < 10 && (await rows.count()) < 130; i += 1) {
    await page.getByTestId("load-more").click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  assert.equal(await rows.count(), 130);
  assert.equal(await page.getByTestId("load-more").count(), 0);
});

await scenario("9. Etiket kataloğu 1516 etiket: 1000'lik sayfalarla tamamı okunur (offset 0 ve 1000) — eskiden 1000'de kesiliyordu", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 1, tags: 1516 });
  await page.goto(`${BASE}/tags`);
  await page.waitForTimeout(1500);
  const offsets = db.tagQueries.filter((x) => x.limit === 1000).map((x) => x.offset);
  assert.ok(offsets.includes(0) && offsets.includes(1000), `1000'lik sayfalar: ${JSON.stringify(db.tagQueries)}`);
  assert.ok(!db.tagQueries.some((x) => x.limit === 100000), "sınırsız tek istek yok");
});

await scenario("10. İngilizce ve telefon (390px): profil listesi Load more, taşma yok", async ({ page, db }) => {
  withLibrary(db, U.bob);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  assert.equal(await page.getByTestId("load-more").innerText(), "Load more");
  assert.equal(await overflowFree(page), true);
}, { lang: "en", viewport: { width: 390, height: 844 } });

const otherLinks = (page, re) => page.locator("main a").filter({ hasText: re });
async function untilLinks(page, re, n) {
  for (let i = 0; i < 40; i += 1) {
    if ((await otherLinks(page, re).count()) >= n) return;
    await page.getByTestId("load-more").click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
  assert.fail(`${n} ${re} links were never drawn (have ${await otherLinks(page, re).count()})`);
}

await scenario("11. Profil → İstekler / Workflow'lar / Hazır ayarlar (60'ar): 24'erli sayfalar, sayı sunucudan, 'Daha fazla' kendiliğinden sonraki sayfayı getirir; sınırsız istek yok", async ({ page, db }) => {
  withLibrary(db, U.bob, { total: 3, other: 60 });
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  for (const [tab, table, re] of [[/^Prompt İstekleri/, "prompt_requests", /^İstek \d+$/], [/^Workflow/, "workflows", /^Akış \d+$/], [/^Hazır Ayarlar/, "presets", /^Ayar \d+$/]]) {
    const before = db.otherQueries.length;
    const tabEl = page.getByRole("tab", { name: tab });
    assert.match(await tabEl.innerText(), /60/, `${table}: sekme sayısı sunucudan`);
    await tabEl.click();
    await otherLinks(page, re).first().waitFor();
    const first = db.otherQueries.slice(before).find((x) => x.table === table);
    assert.ok(first, `${table} istendi`);
    assert.equal(first.limit, "24");
    assert.equal(first.offset, "0");
    assert.equal(first.prefer, "count=exact", "toplam ilk sayfada");
    await page.getByTestId("load-more").scrollIntoViewIfNeeded();
    await page.waitForFunction(([src, flags]) => [...document.querySelectorAll("main a")].filter((a) => new RegExp(src, flags).test((a.textContent ?? "").trim())).length >= 48, [re.source, re.flags]);
    assert.ok(db.otherQueries.slice(before).some((x) => x.table === table && x.offset === "24" && x.prefer === ""), `${table}: ikinci sayfa kendiliğinden geldi`);
    assert.equal(db.otherQueries.slice(before).filter((x) => x.table === table && !x.limit).length, 0, "sınırsız istek yok");
  }
});

await scenario("12. Kütüphanem → İstekler / Workflow'lar / Hazır ayarlar: 24'erli sayfa, menü sayısı sunucudan, 'Sadece ben' + arama + sıralama sorguya gider", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 3, other: 60 });
  await page.goto(`${BASE}/my-content`);
  await titleLinks(page).first().waitFor();
  for (const [name, table, re] of [["Prompt İstekleri", "prompt_requests", /^İstek \d+$/], ["Workflow", "workflows", /^Akış \d+$/], ["Hazır Ayarlar", "presets", /^Ayar \d+$/]]) {
    await page.locator("[data-section-menu]").click();
    assert.match(await page.getByRole("radio", { name: new RegExp(`^${name}`) }).innerText(), /60/, `${table}: menü sayısı sunucudan`);
    await page.getByRole("radio", { name: new RegExp(`^${name}`) }).click();
    await otherLinks(page, re).first().waitFor();
    assert.equal(db.otherQueries.filter((x) => x.table === table).at(0).limit, "24");
    await untilLinks(page, re, 48);
    assert.ok(db.otherQueries.some((x) => x.table === table && x.offset === "24"), `${table}: ikinci sayfa`);
  }
  await page.locator("button[aria-label^='Filtre'], button[title='Filtre']").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Sadece ben" }).click();
  await page.waitForTimeout(800);
  const last = db.otherQueries.at(-1);
  assert.equal(last.table, "presets");
  assert.equal(last.visibility, "eq.private");
  assert.equal(last.offset, "0");
});

await scenario("13. 'Daha fazla yükle' hep kendiliğinden yüklenir: düğmeye basmadan, yalnız kaydırınca 3. sayfaya kadar iner; hata olunca döngüye girmez ('Tekrar dene')", async ({ page, db }) => {
  withLibrary(db, U.bob, { total: 200 });
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await titleLinks(page).first().waitFor();
  for (let i = 0; i < 6 && (await titleLinks(page).count()) < 72; i += 1) {
    await page.getByTestId("load-more").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  assert.ok((await titleLinks(page).count()) >= 72, "düğmeye basılmadan 72 kart geldi");
  // Sonraki sayfa hata verince: bir kez denenir, sonra düğme "Tekrar dene" olur ve kendiliğinden tekrar denemez.
  const baseRoute = db.extraRoutes;
  let fail = true;
  let hits = 0;
  db.extraRoutes = async (ctx) => {
    if (fail && ctx.table === "prompts" && ctx.q.get("author_id") && ctx.q.get("offset") === String((await titleLinks(page).count())) ) { hits += 1; await ctx.route.fulfill({ status: 500, contentType: "application/json", body: "{}" }); return true; }
    return baseRoute(ctx);
  };
  await page.getByTestId("load-more").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  assert.ok(hits <= 2, `hata sonrası döngü yok (${hits} istek)`);
  assert.match(await page.getByTestId("load-more").innerText(), /Tekrar dene/);
});

await scenario("14. Keşfet → Etiketler (1516 etiket): 30'arlı sayfa, toplam ilk sayfada sayılır, sonraki sayfa kaydırınca kendiliğinden gelir; hepsini çeken istek yok", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 1, tags: 1516 });
  await page.goto(`${BASE}/discover`);
  await page.locator("[data-section-menu]").click();
  await page.getByRole("radio", { name: "Etiketler", exact: true }).click();
  const rows = page.locator("[data-tags-section] li");
  await rows.first().waitFor();
  const first = db.tagQueries.find((x) => x.limit === 30);
  assert.ok(first, JSON.stringify(db.tagQueries));
  assert.equal(first.offset, 0);
  assert.ok((await rows.count()) >= 30 && (await rows.count()) < 200, "1516 değil birkaç sayfa çizildi (ilk sayfa 30; kısa liste kendiliğinden devam edebilir)");
  await page.getByTestId("load-more").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll("[data-tags-section] li").length >= 60);
  assert.ok(db.tagQueries.some((x) => x.limit === 30 && x.offset === 30), "ikinci sayfa offset=30 ile");
  assert.ok(!db.tagQueries.some((x) => x.limit === 1000), "tüm kataloğu çeken istek yok (Keşfet bölümünde)");
});

await scenario("15. Ayarlar → Engellenenler (75 kişi): 30'arlı sayfa, kaydırınca kendiliğinden devam; engeli kaldırınca satır gider; içerik süzgeci için kimlik kümesi eksiksiz okunur", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 1, blocked: 75 });
  await page.goto(`${BASE}/settings/blocked`);
  const rows = page.getByRole("button", { name: "Engeli kaldır" });
  await rows.first().waitFor();
  const first = db.blockQueries.find((x) => x.embedded);
  assert.equal(first.limit, 30);
  assert.equal(first.offset, 0);
  assert.equal(first.prefer, "count=exact");
  assert.ok((await rows.count()) >= 30);
  await page.getByTestId("load-more").scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll("main button")].filter((b) => b.textContent.trim() === "Engeli kaldır").length >= 60);
  await page.getByTestId("load-more").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForFunction(() => [...document.querySelectorAll("main button")].filter((b) => b.textContent.trim() === "Engeli kaldır").length >= 75);
  assert.equal(await page.getByTestId("load-more").count(), 0, "son sayfadan sonra düğme yok");
});

await scenario("16. Takipçiler (130 kişi): 50'şerli sayfa, kaydırınca kendiliğinden devam; sınırsız istek yok. Takip ettiklerim aynı; son paylaşımlar feed_page ile (takip edilenlerin kimlikleri istemciden gitmez)", async ({ page, db }) => {
  withLibrary(db, U.alice, { total: 1, people: 130 });
  db.rpc.feed_page = (args) => { db.feedRpcCalls.push(args); return { body: [] }; };
  await page.goto(`${BASE}/followers`);
  const rows = page.getByText(/^Kişi \d+$/);
  await rows.first().waitFor();
  assert.equal(db.followQueries[0].limit, 50);
  assert.equal(db.followQueries[0].offset, 0);
  assert.match(db.followQueries[0].order, /^created_at\.desc,follower_id\.asc$/);
  assert.ok((await rows.count()) >= 50 && (await rows.count()) < 130, "130 değil ilk sayfalar çizildi");
  for (let i = 0; i < 8 && (await rows.count()) < 130; i += 1) {
    await page.getByTestId("load-more").scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
  }
  assert.equal(await rows.count(), 130, "kaydırınca hepsi geldi");
  assert.deepEqual(db.followQueries.map((x) => x.offset), [0, 50, 100]);
  await page.goto(`${BASE}/following`);
  await rows.first().waitFor();
  assert.equal(db.followQueries.at(-1).side, "following");
  assert.equal(db.followQueries.at(-1).limit, 50);
  await page.waitForFunction(() => true);
  await page.waitForTimeout(500);
  assert.ok(db.feedRpcCalls.some((c) => c.p_scope === "following"), JSON.stringify(db.feedRpcCalls));
});

await browser.close();
server.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
