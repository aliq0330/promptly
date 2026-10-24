// Hazır ayarla dene / Bir promptla dene / Studio'da prompt + hazır ayar (docs/history/228-*): uyum kuralı (aynı tür zorunlu; kategori ve araç "Uyumlu" ↔ "Kısmen"),
// araca özel alan (Midjourney --ar) başka araçta kapalı, alan alan açıp kapama, son prompt kaynak rengi, adres `?prompt=&preset=`.
// Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ — uyum kurallarının kendisi `src/lib/preset-fit.test.ts` ile birim testlidir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { ID, installDetailData, svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4190/promptly";
const server = await serve(4190);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const author = (u) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "", website: null, follower_count: 3, following_count: 2, created_at: "2026-01-01T00:00:00Z", interests: [] });
const P = { match: "c0000000-0000-4000-8000-000000000001", mj: "c0000000-0000-4000-8000-000000000002", portrait: "c0000000-0000-4000-8000-000000000003", text: "c0000000-0000-4000-8000-000000000004" };
const presetRow = (id, title, over) => ({
  id, creator_id: U.carol.id, title, description: "d", cover_url: null, content_type: "image", category: "photography", subcategory: null, tools: [], selection: {}, status: "published", visibility: "public", community_id: null,
  like_count: 0, comment_count: 0, save_count: 0, quote_count: 0, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z", profiles: author(U.carol), preset_tags: [], ...over,
});
const PRESETS = [
  presetRow(P.match, "Genel portre ayarı", { selection: { lens: "85mm", lighting: "soft", mj_ar: "16_9" } }),
  presetRow(P.mj, "Midjourney ayarı", { tools: ["midjourney"], selection: { lens: "50mm" } }),
  presetRow(P.portrait, "Portre odaklı ayar", { category: "human_character", selection: { lens: "35mm" } }),
  presetRow(P.text, "Metin ayarı", { content_type: "text", category: null, selection: {} }),
];

const pr = (n, category, contentType = "image") => ({
  id: `d0000000-0000-4000-8000-00000000000${n}`, title: `Prompt ${n}`, description: "d", prompt_text: `a photo ${n}`, tool: null, tools: [], content_type: contentType, category, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 5, save_count: 0, comment_count: 0, copy_count: 0, created_at: `2026-10-0${n}T10:00:00Z`, show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null, profiles: author(U.bob),
  prompt_media: contentType === "image" ? [{ id: `m${n}`, url: svg("#6d5bd0", "#d9d2c3"), width: 1200, height: 900, alt: "x", position: 0 }] : [], prompt_tags: [],
});
// Gerçek sınıflandırma kimlikleri (taxonomy-seed): bilinmeyen bir kategori kimliği prompt eşlenirken null olur.
const PROMPTS = [pr(1, "photography"), pr(2, "design"), pr(3, null, "text"), { ...pr(9, "photography"), id: ID.prompt, title: "Sinematik sokak portresi", tools: ["gpt-image:gpt-image-1"] }];

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  await context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const idEq = url.searchParams.get("id");
    const single = (route.request().headers().accept ?? "").includes("vnd.pgrst.object");
    const send = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (table === "presets") {
      if (idEq?.startsWith("eq.")) {
        const row = PRESETS.find((p) => p.id === idEq.slice(3));
        return row ? send(single ? row : [row]) : route.fallback();
      }
      if (url.searchParams.get("status") === "eq.published") return send(PRESETS);
    }
    if (table === "preset_fields") return send([]);
    if (table === "prompts") {
      if (idEq?.startsWith("eq.")) {
        const row = PROMPTS.find((p) => p.id === idEq.slice(3));
        return row ? send(single ? row : [row]) : route.fallback();
      }
      if (url.searchParams.get("status") === "eq.published" && !idEq) return send(PROMPTS);
    }
    return route.fallback();
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/ptry-fail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const promptUrl = `${BASE}/prompts/local?id=${ID.prompt}`;

await scenario("1. prompt sayfası: aynı türdeki hazır ayarlar uyuma göre dizilir (eşleşti → kısmen), farklı tür hiç gelmez, nedeni yazılır", async ({ page }) => {
  await page.goto(promptUrl);
  const section = page.locator("#prompt-try");
  await section.getByRole("heading", { name: "Hazır ayarla dene" }).waitFor();
  const options = section.locator("[data-preset-option]");
  assert.equal(await options.count(), 3, "metin türündeki hazır ayar listede yok");
  assert.deepEqual(await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-preset-option"))), [P.match, P.mj, P.portrait]);
  assert.equal(await options.first().getAttribute("aria-checked"), "true", "en uyumlu olan varsayılan seçili");
  assert.match(await options.nth(0).textContent(), /ile eşleşti/);
  assert.match(await options.nth(0).textContent(), /Araçtan bağımsız/);
  assert.match(await options.nth(1).textContent(), /Kısmen.*Başka araç: Midjourney/s);
  assert.match(await options.nth(2).textContent(), /Kısmen.*Farklı kategori/s);
  assert.equal(await overflowFree(page), true);
  await shot(page, "1-prompt-desktop");
});

await scenario("2. prompt sayfası: son prompt kaynağı gösterir; Midjourney alanı (--ar) GPT Image'da kapalı, kalan alanlar tek tek açılıp kapanır; Studio bağlantısı ikisini taşır", async ({ page }) => {
  await page.goto(promptUrl);
  const section = page.locator("#prompt-try");
  await section.locator("[data-preset-option]").first().waitFor();
  const preview = section.locator("[data-final-prompt]");
  assert.ok((await preview.locator("[data-from=preset]").count()) >= 2, "ayarın eklediği parçalar ayrı boyalı");
  assert.ok((await preview.locator("[data-from=prompt]").count()) >= 1);
  assert.match(await preview.textContent(), /85mm/);
  assert.doesNotMatch(await preview.textContent(), /--ar/, "Midjourney parametresi GPT Image'a eklenmez");
  const mj = section.getByRole("button", { name: /Oran \(--ar\)/ });
  assert.equal(await mj.isDisabled(), true);
  await section.getByText(/Midjourney parametresi: bu modelde kullanılmaz/).waitFor();
  const lens = section.getByRole("button", { name: "Lens", exact: true });
  assert.equal(await lens.getAttribute("aria-pressed"), "true");
  await lens.click();
  assert.doesNotMatch(await preview.textContent(), /85mm/, "kapatılan alan son prompttan çıkar");
  const studio = section.getByRole("link", { name: "Studio'da dene" });
  assert.match(await studio.getAttribute("href"), new RegExp(`/studio/?\\?prompt=${ID.prompt}&preset=${P.match}$`));
  await section.locator("[data-preset-option]").nth(1).click();
  assert.match(await studio.getAttribute("href"), new RegExp(`preset=${P.mj}$`), "seçim değişince bağlantı da değişir");
  await shot(page, "2-prompt-fields");
});

await scenario("3. Studio: ?prompt=&preset= ikisi birden — prompt taban, hazır ayar katman; neden/uyum görünür; araca özel alan kapalı; kaldırınca prompt kalır", async ({ page }) => {
  await page.goto(`${BASE}/studio?prompt=${ID.prompt}&preset=${P.match}`);
  const layer = page.locator("[data-studio-preset-layer]");
  await layer.waitFor();
  assert.match(await layer.textContent(), /Genel portre ayarı/);
  assert.match(await layer.textContent(), /ile eşleşti/);
  const preview = page.locator("[data-final-prompt]");
  await preview.waitFor();
  assert.ok((await preview.locator("[data-from=preset]").count()) >= 1);
  assert.doesNotMatch(await preview.textContent(), /--ar/, "Studio Gemini'ye gönderir: Midjourney parametresi yok");
  await page.getByText(/Midjourney parametresi: bu modelde kullanılmaz/).waitFor();
  await shot(page, "3-studio-combo");
  await layer.getByRole("button", { name: /Kaldır/ }).click();
  await page.waitForURL((url) => url.searchParams.get("prompt") === ID.prompt && !url.searchParams.has("preset"));
  await page.getByRole("button", { name: "Hazır ayar ekle (isteğe bağlı)" }).waitFor();
  assert.equal(await page.locator("[data-from=preset]").count(), 0);
});

await scenario("3b. Studio telefon 390px: kart düzeni taşmaz, Üret düğmesi ve son prompt görünür", async ({ page }) => {
  await page.goto(`${BASE}/studio?prompt=${ID.prompt}&preset=${P.match}`);
  await page.locator("[data-studio-preset-layer]").waitFor();
  await page.locator("[data-final-prompt]").waitFor();
  assert.equal(await overflowFree(page), true);
  await page.getByRole("button", { name: /^Üret/ }).first().waitFor();
  await shot(page, "3b-studio-combo-mobile");
}, { viewport: { width: 390, height: 844 } });

await scenario("4. hazır ayar sayfası: 'Bir promptla dene' uyumlu promptları gösterir (Uyumlu olanlar süzgeci), seçince Studio iki kaynakla açılır", async ({ page }) => {
  await page.goto(`${BASE}/presets/local?id=${P.match}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.getByRole("button", { name: "Bir promptla dene" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Prompt 1").waitFor();
  assert.equal(await dialog.getByText("Prompt 2").count(), 0, "kısmen uyumlu olan 'Uyumlu olanlar' açıkken gizli");
  assert.equal(await dialog.getByText("Prompt 3").count(), 0, "farklı tür hiç gelmez");
  await dialog.getByRole("button", { name: "Uyumlu olanlar" }).click();
  await dialog.getByText("Prompt 2").waitFor();
  assert.match(await dialog.locator("li", { hasText: "Prompt 2" }).textContent(), /Kısmen.*Farklı kategori/s);
  assert.equal(await dialog.getByText("Prompt 3").count(), 0);
  await dialog.getByText("Prompt 1").click();
  await page.waitForURL((url) => url.pathname.includes("/studio") && url.searchParams.get("preset") === P.match && url.searchParams.get("prompt") === PROMPTS[0].id);
});

await scenario("5. telefon 390px: bölüm taşmaz, hazır ayar kartları yatay kayar, düğmeler görünür", async ({ page }) => {
  await page.goto(promptUrl);
  const section = page.locator("#prompt-try");
  await section.locator("[data-preset-option]").first().waitFor();
  assert.equal(await overflowFree(page), true);
  await section.getByRole("link", { name: "Studio'da dene" }).waitFor();
  await section.getByRole("button", { name: "Ayarlı metni kopyala" }).waitFor();
  await shot(page, "5-prompt-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("6. İngilizce: bölüm, uyum nedenleri ve alan notu çevrili", async ({ page }) => {
  await page.goto(promptUrl);
  const section = page.locator("#prompt-try");
  await section.getByRole("heading", { name: "Try with a preset" }).waitFor();
  const options = section.locator("[data-preset-option]");
  assert.match(await options.nth(0).textContent(), /Matches .* · Any tool/);
  assert.match(await options.nth(1).textContent(), /Partly.*For another tool: Midjourney/s);
  await section.getByText(/Midjourney parameter: not used with this model/).waitFor();
  await section.getByRole("button", { name: "Copy adjusted text" }).waitFor();
  await section.getByRole("link", { name: "Try in Studio" }).waitFor();
}, { lang: "en" });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
