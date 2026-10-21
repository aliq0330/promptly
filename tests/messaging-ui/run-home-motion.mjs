// Ana Sayfa hareket paketi (docs/history/209-*): canlı vitrin (misafir), "Sana özel" (neden satırı, ilgi alanı çipleri,
// yeniden dizilme), görsel rengi/önizlemesi, kart → detay büyümesi ve geri dönüşte küçülme. Ağ taklitli; gerçek Supabase'e
// KARŞI DENENMEDİ — sıralamanın kendisi sunucu kuralıdır ve supabase/tests/for-you.sql'de sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4186/promptly";
const server = await serve(4186);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const COLORS = [["#6d5bd0", "#d9d2c3"], ["#76592e", "#e8c27a"], ["#2a6f6a", "#e9d8a6"], ["#ab8d61", "#f2d6b3"], ["#1b2a49", "#e86a3c"], ["#7a3e2e", "#f2d6b3"], ["#3a5a40", "#a3b18a"], ["#5e548e", "#e0b1cb"]];
const pid = (i) => `b0000000-0000-4000-8000-00000000000${i}`;
function promptRow(i, { category = null, appearance = true } = {}) {
  const [a, b] = COLORS[i % COLORS.length];
  return {
    id: pid(i), title: `Görsel prompt ${i}`, description: "d", prompt_text: `cinematic photo number ${i}, soft light, 85mm, shallow depth of field`, tool: null, tools: [],
    content_type: "image", category, subcategory: null, status: "published", origin_type: "original", request_id: null,
    like_count: 20 - i, save_count: 0, comment_count: 0, copy_count: 0, created_at: `2026-10-${10 + i}T10:00:00Z`, show_on_profile: true,
    requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
    profiles: author(i % 2 ? U.bob : U.carol),
    prompt_media: [{ id: `m${i}`, url: svg(a, b, 1200, i % 2 ? 900 : 1300), width: 1200, height: i % 2 ? 900 : 1300, alt: `Görsel ${i}`, position: 0,
      dominant_color: appearance ? a : null, placeholder: appearance ? svg(a, b, 24, 18) : null }],
    prompt_tags: [{ tags: { slug: "resim", label: "Resim" } }],
  };
}

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", guest = false, count = 8, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const rows = Array.from({ length: count }, (_, i) => promptRow(i + 1, { category: i === 2 ? "photography" : null }));
  const state = { interests: [], forYouCalls: [], patches: [] };
  // "Sana özel": ilgi alanında Fotoğrafçılık varsa 3. prompt öne çıkar (sunucu kuralının kaba taklidi).
  db.rpc.feed_page = () => ({ body: rows.map((r) => ({ kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 0 })) });
  db.rpc.for_you_page = (body) => {
    state.forYouCalls.push(body);
    const photo = state.interests.includes("Fotoğrafçılık");
    const ordered = photo ? [rows[2], ...rows.filter((_, i) => i !== 2)] : rows;
    return {
      body: ordered.map((r, i) => ({
        kind: "prompt", id: r.id, created_at: r.created_at, sort_rank: 100 - i,
        reason_kind: r.id === pid(3) && photo ? "interest" : i === 0 ? "creator" : i === 1 ? "tag" : "popular",
        reason_ref: r.id === pid(3) && photo ? "Fotoğrafçılık" : i === 1 ? "resim" : null,
      })),
    };
  };
  setup?.({ db, rows, state });
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
  await context.route(/\/rest\/v1\/profiles\?/, (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const patch = JSON.parse(route.request().postData() || "{}");
    state.patches.push(patch);
    if (patch.interests) state.interests = patch.interests;
    const me = Object.values(U).find((u) => u.id === ME);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...me, interests: state.interests }) });
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
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/hm-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

// 1 — misafir vitrini
await scenario("1. misafir: canlı vitrin akar; görsele dokununca akış durur, prompt + Kopyala + Gönderiyi aç görünür", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const wall = page.locator(".showcase-wall");
  await wall.waitFor();
  await page.getByRole("heading", { name: "Görselin arkasındaki prompt'u gör." }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".showcase-wall button[aria-expanded]").length >= 8);
  const anim = await page.locator(".showcase-track").first().evaluate((el) => getComputedStyle(el).animationName);
  assert.equal(anim, "showcase-drift");
  // Kopya liste ekran okuyucu ve sekme sırasından gizli: yalnız 8 erişilebilir döşeme.
  assert.equal(await page.getByRole("button", { name: /promptu göster/ }).count(), 8);
  await shot(page, "1-showcase");
  const tile = page.getByRole("button", { name: "Görsel prompt 1: promptu göster" });
  await tile.evaluate((el) => el.click());
  await page.waitForTimeout(600);
  assert.equal(await tile.getAttribute("aria-expanded"), "true");
  assert.equal(await wall.evaluate((el) => el.classList.contains("showcase-paused")), true, "drift paused");
  assert.equal(await page.locator(".showcase-track").first().evaluate((el) => getComputedStyle(el).animationPlayState), "paused");
  const overlay = tile.locator("xpath=following-sibling::div");
  await overlay.getByText("cinematic photo number 1").waitFor();
  await overlay.getByRole("button", { name: /Kopyala/ }).waitFor();
  assert.match(await overlay.getByRole("link", { name: /Gönderiyi aç/ }).getAttribute("href"), /\/prompts\/local\/?\?id=b0000000-0000-4000-8000-000000000001/);
  await shot(page, "1-showcase-open");
  assert.equal(await overflowFree(page), true);
}, { guest: true });

await scenario("2. misafir: 4'ten az görsel → kompakt tanıtım (boş duvar yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Promptları keşfet, geliştir, paylaş." }).waitFor();
  assert.equal(await page.locator(".showcase-wall").count(), 0);
}, { guest: true, count: 3 });

// 3 — Sana özel
await scenario("3. üye: varsayılan sekme Sana özel; her kartta gerçek neden; ilgi alanı çipleri", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  const tab = page.getByRole("tab", { name: "Sana özel" });
  await tab.waitFor();
  assert.equal(await tab.getAttribute("aria-selected"), "true");
  await page.getByText("Takip ettiğin Bob paylaştı").waitFor();
  await page.getByText("Takip ettiğin #Resim etiketinden").waitFor();
  assert.ok((await page.getByText("Şu an popüler").count()) >= 1);
  await page.getByRole("heading", { name: "İLGİ ALANLARIN" }).or(page.getByRole("heading", { name: "İlgi alanların" })).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Fotoğrafçılık" }).getAttribute("aria-pressed"), "false");
  assert.ok(state.forYouCalls.length >= 1 && state.forYouCalls[0].p_as_of, "for_you_page called with a fixed as_of");
  await shot(page, "3-for-you");
  assert.equal(await overflowFree(page), true);
});

await scenario("4. üye: ilgi alanı seçilince kaydedilir, akış yeniden sıralanır ve kartlar yeni yerine kayar", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await page.getByText("Takip ettiğin Bob paylaştı").waitFor();
  const firstTitleBefore = await page.locator("[data-flip-key] h2").first().innerText();
  assert.equal(firstTitleBefore, "Görsel prompt 1");
  // Yeniden dizilirken animasyonları yakala.
  await page.evaluate(() => {
    window.__flipAnimations = 0;
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.hasAttribute?.("data-flip-key")) window.__flipAnimations += 1;
      return orig.apply(this, args);
    };
  });
  await page.getByRole("button", { name: "Fotoğrafçılık" }).click();
  await page.getByText("İlgi alanın: Fotoğrafçılık").waitFor();
  assert.deepEqual(state.patches.at(-1), { interests: ["Fotoğrafçılık"] }, "only interests are written");
  assert.equal(await page.getByRole("button", { name: "Fotoğrafçılık" }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator("[data-flip-key] h2").first().innerText(), "Görsel prompt 3");
  assert.ok((await page.evaluate(() => window.__flipAnimations)) > 0, "cards glided to their new places");
  assert.ok(state.forYouCalls.length >= 2);
});

await scenario("5. İngilizce: For you sekmesi ve nedenler çevrilmiş", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByRole("tab", { name: "For you" }).waitFor();
  await page.getByText("Shared by Bob, who you follow").waitFor();
  await page.getByText("From #Resim, a tag you follow").waitFor();
  await page.getByRole("heading", { name: /Your interests/i }).waitFor();
}, { lang: "en" });

// 6 — görsel rengi / önizleme
await scenario("6. kartlar kayıtlı renkle boyanır (bulanık kopya yok), önizleme sonra kalkar; renksiz eski kart eski bandı çizer", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByText("Takip ettiğin Bob paylaştı").waitFor();
  const card = page.locator("article").filter({ hasText: "Görsel prompt 1" }).first();
  const band = await card.evaluate((el) => {
    const tint = el.querySelector("[aria-hidden][style*='color-mix']");
    return { tint: tint ? getComputedStyle(tint).backgroundColor : null, blurCopies: el.querySelectorAll(".blur-2xl").length };
  });
  assert.ok(band.tint, "band tinted from the stored colour");
  assert.equal(band.blurCopies, 0, "no enlarged blurred copy behind the card");
  const frame = card.locator("[data-card-media]");
  assert.ok(await frame.locator("span[aria-hidden][style*='background-color']").count() >= 1, "the frame starts in the picture's colour");
  await page.waitForTimeout(900);
  assert.equal(await frame.locator("img.blur-xl").count(), 0, "the blurred preview is dropped once the picture is in");
  const old = page.locator("article").filter({ hasText: "Görsel prompt 2" }).first();
  assert.ok((await old.locator(".blur-2xl").count()) >= 1, "a row without colour keeps the blurred backdrop");
}, { setup: ({ rows }) => { rows[1].prompt_media[0].dominant_color = null; rows[1].prompt_media[0].placeholder = null; } });

// 7 — kart → detay → geri
await scenario("7. kart → detay: detay iskeletsiz hemen çizilir ve kapak büyür; geri dönünce liste yerinde, kapak kartına küçülür", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByText("Takip ettiğin Bob paylaştı").waitFor();
  await page.evaluate(() => {
    window.__heroAnimated = false;
    window.__coverAnimated = false;
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.closest?.("[data-detail-band]")) window.__heroAnimated = true;
      if (this.matches?.("[data-card-media]")) window.__coverAnimated = true;
      return orig.apply(this, args);
    };
  });
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(400);
  const card = page.locator("article").filter({ hasText: "Görsel prompt 2" }).first();
  await card.getByRole("link", { name: "Görsel prompt 2" }).click();
  await page.locator("[data-detail-band]").waitFor({ timeout: 1500 });
  assert.equal(await page.locator("[data-detail-band] h1").innerText(), "Görsel prompt 2");
  assert.equal(await page.evaluate(() => window.__heroAnimated), true, "the cover grew into the hero");
  const tint = await page.locator("[data-detail-band]").evaluate((el) => el.getAttribute("style") ?? "");
  assert.match(tint, /color-mix/, "the band has the picture's colour at once");
  await page.waitForTimeout(600);
  await page.goBack();
  await page.getByText("Takip ettiğin Bob paylaştı").waitFor({ timeout: 1500 });
  assert.equal(await page.locator("[data-flip-key]").count(), 8, "the list came back as it was (no skeleton)");
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__coverAnimated), true, "the hero shrank back into the card");
});

await scenario("8. hareket azaltma: vitrin akmaz, kapak büyümez", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${BASE}/`);
  await page.locator(".showcase-wall").waitFor();
  await page.waitForTimeout(300);
  const t = await page.locator(".showcase-track").first().evaluate((el) => getComputedStyle(el).transform);
  assert.ok(t === "none" || t === "matrix(1, 0, 0, 1, 0, 0)", `drift stopped (${t})`);
}, { guest: true });

await scenario("9. masaüstü 1280: vitrin iki sütunlu yerleşim, taşma yok", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.locator(".showcase-wall").waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".showcase-wall button[aria-expanded]").length >= 8);
  await shot(page, "9-showcase-desktop");
  assert.equal(await overflowFree(page), true);
}, { guest: true, viewport: { width: 1280, height: 900 } });

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(passed === results.length ? 0 : 1);
