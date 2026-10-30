// "Takip edilecek kişiler" şeridi (docs/history/285-*): Ana Sayfa'da gönderilerin arasına giren kişi önerisi. Ağ taklitli; gerçek Supabase'e
// KARŞI DENENMEDİ — kişilerin KİMLER olduğu ve sırası sunucu kuralıdır (supabase/tests/creator-suggestions.sql); burada yalnız istemci davranışı
// sınanır: nerede çıktığı, kartın içeriği, ✕ kapatma, başlıktaki gizle, hata/boş durumlar, iki dil, taşma.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4190/promptly";
const server = await serve(4190);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const pid = (i) => `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const personId = (i) => `c0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
function promptRow(i) {
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}`, tool: null, tools: [],
    content_type: "image", category: null, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 90 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: new Date(Date.now() - i * 3600_000).toISOString(), show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg("#6d5bd0", "#d9d2c3", 1200, 1000), width: 1200, height: 1000, alt: `Görsel ${i}`, position: 0, dominant_color: "#6d5bd0", placeholder: svg("#6d5bd0", "#d9d2c3", 24, 20) }],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}
// Önerilen kişiler: ilk altısı her neden türünü gösterir; geri kalanı ikinci şerit içindir.
const REASONS = [
  { kind: "mutual", ref: "Bob", count: 1 },
  { kind: "mutual", ref: "Carol", count: 3 },
  { kind: "liked", ref: null, count: 2 },
  { kind: "tag", ref: "kedi", count: 1 },
  { kind: "tool", ref: "midjourney", count: 0 },
  { kind: "active", ref: null, count: 0 },
];
const person = (i) => ({
  id: personId(i), username: `kisi${i}`, display_name: `Kişi ${i}`, avatar_url: null, cover_url: null, bio: "", website: null,
  follower_count: 40 - i, following_count: 1, created_at: "2026-02-01T00:00:00Z", interests: [], is_demo: i === 5,
});

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, count = 16, people = 6, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1));
  // suggestCalls: suggest_creators çağrıları; dismissCalls: dismiss_creator_suggestion çağrıları; failDismiss: ✕ RPC'si hata verir.
  const state = { suggestCalls: [], dismissCalls: [], failDismiss: false, failSuggest: false, people: Array.from({ length: people }, (_, i) => person(i + 1)) };
  db.rpc.feed_page = () => ({ body: rows.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: r.like_count })) });
  db.rpc.for_you_page = () => ({ body: rows.map((r, i) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i, reason_kind: "popular", reason_ref: null })) });
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.suggest_creators = (body) => {
    state.suggestCalls.push(body);
    if (state.failSuggest) return { status: 500, body: { message: "boom" } };
    return { body: state.people.map((p, i) => ({ id: p.id, reason_kind: REASONS[i % REASONS.length].kind, reason_ref: REASONS[i % REASONS.length].ref, reason_count: REASONS[i % REASONS.length].count, score: 500 - i })) };
  };
  db.rpc.dismiss_creator_suggestion = (body) => {
    state.dismissCalls.push(body);
    return state.failDismiss ? { status: 400, body: { message: "boom" } } : { body: null };
  };
  setup?.({ db, rows, state });
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await context.route(/\/rest\/v1\/prompts\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const ids = (url.searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g);
    const list = ids ? rows.filter((r) => ids.includes(r.id)) : rows;
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? list[0] ?? null : list) });
  });
  await context.route(/\/rest\/v1\/tags\?/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
  // Önerilen kişilerin profilleri: `profiles?id=in.(…)`; diğer profil sorguları taklidin kendi yoluna gider.
  await context.route(/\/rest\/v1\/profiles\?.*id=in\.(\(|%28)/, (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state.people.filter((p) => ids.includes(p.id))) });
  });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, state, rows });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cs-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const waitFeed = async (page) => { await page.locator("[data-flip-key]").first().waitFor(); };
const strips = (page) => page.locator("[data-creator-strip]");
/** Kaç gönderi şeridin ÖNÜNDE: şerit yuvasından önce gelen gönderi hücrelerinin sayısı. */
const postsBeforeSlot = (page, n) =>
  page.evaluate((index) => {
    const slot = document.querySelectorAll("[data-creator-strip-slot]")[index];
    return slot ? [...document.querySelectorAll("[data-flip-key]")].filter((c) => c.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).length : -1;
  }, n);

// 1 — konum + kart içeriği
await scenario("1. Sana özel: şerit 12. gönderinin hemen altında; başlık, 'Tümünü gör' (Keşfet → Yaratıcılar), her kartta ad + neden + Takip Et", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await strips(page).first().waitFor();
  assert.equal(await strips(page).count(), 1, "16 gönderide tek şerit");
  assert.equal(await postsBeforeSlot(page, 0), 12, "şerit 12. gönderiden sonra");
  const strip = strips(page).first();
  await strip.getByRole("heading", { name: "Takip edilecek kişiler" }).waitFor();
  assert.match((await strip.locator("[data-creator-strip-all]").getAttribute("href")) ?? "", /\/discover\/?\?section=creators$/);
  assert.equal(await strip.locator("[data-creator-card]").count(), 6);
  const first = strip.locator("[data-creator-card]").first();
  await first.getByText("Kişi 1").waitFor();
  await first.getByText("Bob takip ediyor").waitFor();
  await first.getByRole("button", { name: /Takip Et/ }).waitFor();
  await first.getByRole("button", { name: "Kişi 1 kişisini önerme" }).waitFor();
  assert.match((await first.getByRole("link").first().getAttribute("href")) ?? "", /\/profile\/real\/?\?username=kisi1$/);
  // Her neden türünün cümlesi
  const text = (i) => strip.locator("[data-creator-card]").nth(i).locator("[data-creator-reason]").innerText();
  assert.equal(await text(1), "Carol ve 2 kişi daha takip ediyor");
  assert.equal(await text(2), "Beğendiğin içeriklerin yazarı");
  assert.equal(await text(3), "#kedi etiketiyle üretiyor");
  assert.equal(await text(4), "Takip ettiğin bir AI aracıyla üretiyor");
  assert.equal(await text(5), "Son zamanlarda aktif");
  // Örnek hesap rozeti (kişi 5)
  assert.equal(await strip.locator("[data-creator-card]").nth(4).locator("[data-demo-badge]").count(), 1);
  assert.equal(await strip.locator("[data-creator-card]").first().locator("[data-demo-badge]").count(), 0);
  await strip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await shot(page, "1-strip");
  assert.equal(await overflowFree(page), true);
});

// 2 — "ilgini çekiyor mu?" kartıyla aynı gönderide değil
await scenario("2. 'Bu gönderi ilgini çekiyor mu?' kartı 7. gönderide, şerit 12.'de — ikisi birbirinin yerine geçmez", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.locator("[data-interest-prompt]").first().waitFor();
  await strips(page).first().waitFor();
  assert.equal(await page.locator("[data-interest-prompt]").count(), 1);
  assert.equal(await strips(page).count(), 1);
  assert.equal(await page.locator("[data-flip-key]").nth(6).locator("[data-interest-prompt]").count(), 1);
});

// 3 — iki sekme, tek istek
await scenario("3. Takip Ettiklerim sekmesinde de şerit var; iki sekme arasında geçmek öneriyi yeniden istemez (tek suggest_creators)", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await strips(page).first().waitFor();
  await page.getByRole("tab", { name: /Takip Ettiklerim/ }).click();
  await page.waitForTimeout(500);
  await waitFeed(page);
  await strips(page).first().waitFor();
  assert.equal(await postsBeforeSlot(page, 0), 12);
  await page.getByRole("tab", { name: /Sana özel/ }).click();
  await strips(page).first().waitFor();
  assert.equal(state.suggestCalls.length, 1, "bir kez istendi");
  assert.deepEqual(state.suggestCalls[0], { p_limit: 30 });
});

// 4 — kişiyi kapat
await scenario("4. Karttaki ✕: kişi şeritten çıkar, dismiss_creator_suggestion(p_creator) çağrılır, diğer kartlar yerinde kalır", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = strips(page).first();
  await strip.waitFor();
  await strip.locator("[data-creator-card]").nth(1).getByRole("button", { name: "Kişi 2 kişisini önerme" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-creator-card]").length === 5);
  assert.deepEqual(state.dismissCalls, [{ p_creator: personId(2) }]);
  assert.equal(await strip.getByText("Kişi 2", { exact: true }).count(), 0);
  assert.equal(await strip.getByText("Kişi 1", { exact: true }).count(), 1);
  assert.equal(await strip.getByText("Kişi 3", { exact: true }).count(), 1);
  assert.equal(await page.locator("[data-flip-key]").count(), 16, "gönderiler yerinde");
});

await scenario("5. ✕ sunucuda başarısız olursa kişi geri gelir ve bildirim çıkar", async ({ page, state }) => {
  state.failDismiss = true;
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = strips(page).first();
  await strip.waitFor();
  await strip.locator("[data-creator-card]").first().getByRole("button", { name: "Kişi 1 kişisini önerme" }).click();
  await page.getByText("Kişi önerilerden kaldırılamadı. Tekrar dene.").waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-creator-card]").length === 6);
  assert.equal(state.dismissCalls.length, 1);
});

// 6 — şeridi gizle
await scenario("6. Başlıktaki ✕: şerit kalkar, 6 saatlik duraklama yazılır; sayfa yenilenince şerit yok ve öneri hiç istenmez", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await strips(page).first().waitFor();
  await page.locator("[data-creator-strip-pause]").click();
  await page.waitForFunction(() => document.querySelectorAll("[data-creator-strip]").length === 0);
  const until = Number(await page.evaluate(() => localStorage.getItem("promptly-creator-strip-paused-until")));
  const sixHours = 6 * 3600_000;
  assert.ok(until > Date.now() + sixHours - 60_000 && until <= Date.now() + sixHours + 5_000, "6 saat sonrasına yazıldı");
  assert.equal(state.dismissCalls.length, 0, "kimse kalıcı olarak kapatılmadı");
  assert.equal(await page.locator("[data-flip-key]").count(), 16);
  state.suggestCalls.length = 0;
  await page.reload();
  await waitFeed(page);
  await page.waitForTimeout(700);
  assert.equal(await strips(page).count(), 0);
  assert.equal(state.suggestCalls.length, 0, "duraklatılmışken sunucuya sorulmaz");
});

await scenario("7. Duraklama süresi dolmuşsa şerit yeniden çıkar", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("promptly-creator-strip-paused-until", String(Date.now() - 1000)); } catch {} });
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await strips(page).first().waitFor();
});

// 8 — uzun liste: ikinci şerit, kişiler tekrar etmez
await scenario("8. 45 gönderide iki şerit (12. ve 42. gönderiden sonra); ikinci şeritte öncekiler tekrar etmez", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.locator("[data-creator-strip]").nth(1).waitFor({ state: "attached" });
  assert.equal(await strips(page).count(), 2);
  assert.equal(await postsBeforeSlot(page, 0), 12);
  assert.equal(await postsBeforeSlot(page, 1), 42);
  const ids = await page.locator("[data-creator-card]").evaluateAll((els) => els.map((e) => e.getAttribute("data-creator-id")));
  assert.equal(new Set(ids).size, ids.length, "aynı kişi iki şeritte yok");
  assert.equal(await strips(page).nth(0).locator("[data-creator-card]").count(), 10);
  assert.equal(await strips(page).nth(1).locator("[data-creator-card]").count(), 4);
}, { count: 45, people: 14 });

// 9 — az kişi / boş / hata
await scenario("9. Öneri yoksa şerit hiç çizilmez; gönderiler olduğu gibi akar", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.waitForTimeout(700);
  assert.equal(await strips(page).count(), 0);
  assert.ok(state.suggestCalls.length >= 1);
  assert.equal(await page.locator("[data-flip-key]").count(), 16);
}, { people: 0 });

await scenario("10. Öneri isteği hata verirse şerit yok, akış bozulmaz, sayfa hatası yok", async ({ page, state }) => {
  state.failSuggest = true;
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.waitForTimeout(700);
  assert.equal(await strips(page).count(), 0);
  assert.equal(await page.locator("[data-flip-key]").count(), 16);
});

await scenario("11. 12'den az gönderide şerit yok (12. gönderi yoksa araya girecek yer yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  await page.waitForTimeout(700);
  assert.equal(await strips(page).count(), 0);
}, { count: 8 });

// 12 — misafir
await scenario("12. Misafirde şerit yok ve öneri istenmez (giriş istemi görünür)", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(900);
  assert.equal(await strips(page).count(), 0);
  assert.equal(state.suggestCalls.length, 0);
  assert.equal(state.dismissCalls.length, 0);
}, { guest: true });

// 13 — İngilizce + masaüstü
await scenario("13. İngilizce: başlık, neden cümleleri, düğmeler İngilizce; masaüstünde yatay taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = strips(page).first();
  await strip.waitFor();
  await strip.getByRole("heading", { name: "People to follow" }).waitFor();
  await strip.getByText("View all").waitFor();
  await strip.getByText("Followed by Bob").first().waitFor();
  await strip.getByText("Followed by Carol and 2 more").first().waitFor();
  await strip.getByText("Wrote something you liked").first().waitFor();
  await strip.getByText("Creates with #kedi").first().waitFor();
  await strip.getByText("Creates with an AI tool you follow").first().waitFor();
  await strip.getByText("Active lately").first().waitFor();
  await strip.getByRole("button", { name: "Don't suggest Kişi 1", exact: true }).waitFor();
  await strip.getByRole("button", { name: "Hide these suggestions for now" }).waitFor();
  assert.equal(await overflowFree(page), true);
  await shot(page, "13-desktop");
}, { lang: "en", viewport: { width: 1280, height: 900 }, people: 10 });

await scenario("14. Tablet genişliğinde şerit tam genişlikte, kartlar yatay kaydırılır, sayfa taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await waitFeed(page);
  const strip = strips(page).first();
  await strip.waitFor();
  const widths = await page.evaluate(() => {
    const s = document.querySelector("[data-creator-strip]");
    const first = document.querySelector("[data-flip-key]");
    return { strip: s.getBoundingClientRect().width, card: first.getBoundingClientRect().width };
  });
  assert.ok(widths.strip > widths.card * 1.6, `şerit sütundan geniş (şerit ${widths.strip}, kart ${widths.card})`);
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 820, height: 1000 }, people: 10 });

// 15 — "Tümünü gör" hedefi
await scenario("15. /discover?section=creators Keşfet'i Yaratıcılar bölümünde açar; parametresiz açılış 'Tümü' kalır", async ({ page }) => {
  const trigger = (label) => page.locator("button[aria-haspopup]", { hasText: new RegExp(`^${label}$`) });
  await page.goto(`${BASE}/discover/?section=creators`);
  await trigger("Yaratıcılar").first().waitFor();
  assert.equal(await trigger("Tümü").count(), 0);
  await page.goto(`${BASE}/discover/`);
  await trigger("Tümü").first().waitFor();
  assert.equal(await trigger("Yaratıcılar").count(), 0);
});

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
