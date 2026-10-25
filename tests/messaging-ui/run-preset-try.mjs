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
const shotView = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const promptUrl = `${BASE}/prompts/local?id=${ID.prompt}`;

const openSheet = async (page, name = "Hazır ayarla dene") => {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("[data-preset-option]").first().waitFor();
  return dialog;
};

await scenario("1. prompt sayfası: hazır ayar sayfada gömülü değil; birleşik Kopyala | Çalıştır, Studio'da aç, sayaçlı 'Hazır ayarla dene'; araç ve Düzenleme öner kutunun altında", async ({ page }) => {
  await page.goto(promptUrl);
  const block = page.locator("[data-prompt-block]");
  await block.waitFor();
  const trigger = page.getByRole("button", { name: /^Hazır ayarla dene/ });
  await trigger.waitFor();
  assert.equal(await page.locator("#prompt-try").count(), 0, "gömülü hazır ayar bölümü yok");
  assert.equal(await page.locator("[data-preset-option]").count(), 0, "pencere kapalıyken ayar listesi çizilmez");
  assert.equal((await trigger.locator("[data-fit-count]").textContent()).trim(), "1", "yalnız tam uyan ayarlar sayılır");
  const joined = page.locator("div.divide-x", { has: page.getByRole("button", { name: "Kopyala" }) });
  await joined.getByRole("button", { name: "Çalıştır" }).waitFor();
  await page.getByRole("link", { name: "Studio'da aç" }).waitFor();
  assert.match(await block.textContent(), /Önerilen araç: GPT Image/);
  assert.match(await block.textContent(), /\d+ karakter/);
  await block.getByRole("button", { name: "Düzenleme öner" }).waitFor();
  assert.equal(await overflowFree(page), true);
  await shot(page, "1-prompt-desktop");
});

await scenario("1b. 'Hazır ayarla dene' penceresi: varsayılan yalnız uyumlu olanlar; süzgeç kalkınca aynı türdeki hepsi uyuma göre dizilir (eşleşti → kısmen), farklı tür hiç gelmez, nedeni yazılır", async ({ page }) => {
  await page.goto(promptUrl);
  const dialog = await openSheet(page);
  const options = dialog.locator("[data-preset-option]");
  assert.equal(await options.count(), 1, "'Uyumlu olanlar' açık: yalnız tam uyan");
  assert.match(await options.first().textContent(), /Genel portre ayarı/);
  await dialog.getByRole("button", { name: "Uyumlu olanlar" }).click();
  assert.equal(await options.count(), 3, "metin türündeki hazır ayar listede yok");
  assert.deepEqual(await options.evaluateAll((els) => els.map((el) => el.getAttribute("data-preset-option"))), [P.match, P.mj, P.portrait]);
  assert.equal(await options.first().getAttribute("aria-checked"), "true", "en uyumlu olan varsayılan seçili");
  assert.match(await options.nth(0).textContent(), /ile eşleşti/);
  assert.match(await options.nth(0).textContent(), /Araçtan bağımsız/);
  assert.match(await options.nth(1).textContent(), /Kısmen.*Başka araç: Midjourney/s);
  assert.match(await options.nth(2).textContent(), /Kısmen.*Farklı kategori/s);
  await dialog.getByPlaceholder("Hazır ayar ara").fill("odaklı");
  assert.equal(await options.count(), 1);
  assert.match(await options.first().textContent(), /Portre odaklı ayar/);
  await shot(page, "1b-sheet-desktop");
});

await scenario("2. pencere: son prompt kaynağı gösterir; Midjourney alanı (--ar) GPT Image'da kapalı, kalan alanlar tek tek açılıp kapanır; Studio bağlantısı ikisini taşır", async ({ page }) => {
  await page.goto(promptUrl);
  const dialog = await openSheet(page);
  await dialog.getByRole("button", { name: "Uyumlu olanlar" }).click();
  const preview = dialog.locator("[data-final-prompt]");
  assert.ok((await preview.locator("[data-from=preset]").count()) >= 2, "ayarın eklediği parçalar ayrı boyalı");
  assert.ok((await preview.locator("[data-from=prompt]").count()) >= 1);
  assert.match(await preview.textContent(), /85mm/);
  assert.doesNotMatch(await preview.textContent(), /--ar/, "Midjourney parametresi GPT Image'a eklenmez");
  const mj = dialog.getByRole("button", { name: /Oran \(--ar\)/ });
  assert.equal(await mj.isDisabled(), true);
  await dialog.getByText(/Midjourney parametresi: bu modelde kullanılmaz/).waitFor();
  const lens = dialog.getByRole("button", { name: "Lens", exact: true });
  assert.equal(await lens.getAttribute("aria-pressed"), "true");
  await lens.click();
  assert.doesNotMatch(await preview.textContent(), /85mm/, "kapatılan alan son prompttan çıkar");
  const studio = dialog.getByRole("link", { name: "Studio'da dene" });
  assert.match(await studio.getAttribute("href"), new RegExp(`/studio/?\\?prompt=${ID.prompt}&preset=${P.match}$`));
  await dialog.locator("[data-preset-option]").nth(1).click();
  assert.match(await studio.getAttribute("href"), new RegExp(`preset=${P.mj}$`), "seçim değişince bağlantı da değişir");
  await shot(page, "2-sheet-fields");
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
  if (SHOTS) await preview.locator("xpath=..").screenshot({ path: `${SHOTS}/3-final-prompt.png` });
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

await scenario("3c. Studio: Çalıştır / API anahtarıyla üret iki seçenek; Çalıştır birleşik Kopyala | Çalıştır + araç seçici; Yayınla promptu oluşturma ekranına taşır (docs/history/230-*)", async ({ page }) => {
  await page.goto(`${BASE}/studio?prompt=${ID.prompt}&preset=${P.match}`);
  await page.locator("[data-final-prompt]").waitFor();
  const options = page.getByRole("radiogroup", { name: "Nasıl çalıştıralım?" });
  await options.waitFor();
  assert.equal(await options.getByRole("radio").count(), 2);
  assert.equal(await options.getByRole("radio", { name: /API anahtarıyla üret/ }).getAttribute("aria-checked"), "true", "varsayılan: API ile üret (eski akış)");
  await page.getByRole("button", { name: /^Üret/ }).waitFor();
  await options.getByRole("radio", { name: /^Çalıştır/ }).click();
  const panel = page.locator("[data-run-panel]");
  await panel.waitFor();
  assert.equal(await page.getByRole("button", { name: /^Üret/ }).count(), 0, "API paneli kapanır");
  await panel.getByRole("button", { name: "Kopyala" }).waitFor();
  await panel.getByRole("button", { name: "Çalıştır" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText(/GPT Image/).first().waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await shot(page, "3c-studio-run");
  const publish = page.getByRole("button", { name: "Yayınla" });
  await publish.click();
  await page.waitForURL((url) => url.pathname.includes("/create") && url.searchParams.get("fromGenerate") === "1");
  const box = page.locator("textarea").first();
  await box.waitFor();
  assert.match(await box.inputValue(), /85mm/, "ayarlı son prompt oluşturma ekranına düştü");
});

await scenario("3d. Studio telefon 390px: iki seçenek alt alta, Çalıştır paneli taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/studio?prompt=${ID.prompt}&preset=${P.match}`);
  const options = page.getByRole("radiogroup", { name: "Nasıl çalıştıralım?" });
  await options.waitFor();
  await options.getByRole("radio", { name: /^Çalıştır/ }).click();
  await page.locator("[data-run-panel]").waitFor();
  assert.equal(await overflowFree(page), true);
  await page.getByRole("button", { name: "Yayınla" }).waitFor();
  await shot(page, "3d-studio-run-mobile");
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

await scenario("5. telefon 390px: eylemler ve pencere taşmaz; birleşik düğme tam genişlik, alt çubuk düğmeleri görünür", async ({ page }) => {
  await page.goto(promptUrl);
  await page.getByRole("button", { name: /^Hazır ayarla dene/ }).waitFor();
  assert.equal(await overflowFree(page), true);
  const copy = await page.getByRole("button", { name: "Kopyala" }).boundingBox();
  const run = await page.getByRole("button", { name: "Çalıştır" }).boundingBox();
  assert.ok(Math.abs(copy.y - run.y) < 2 && run.x > copy.x, "Kopyala | Çalıştır yan yana, tek hap");
  await shot(page, "5-prompt-phone");
  await page.locator("[data-prompt-block]").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 160));
  await shotView(page, "5-actions-phone");
  const dialog = await openSheet(page);
  assert.equal(await overflowFree(page), true);
  await shotView(page, "5-sheet-phone-view");
  await dialog.getByRole("link", { name: "Studio'da dene" }).waitFor();
  await dialog.getByRole("button", { name: "Ayarlı metni kopyala" }).waitFor();
  await shot(page, "5-sheet-phone");
}, { viewport: { width: 390, height: 844 } });

await scenario("6. İngilizce: eylemler, araç satırı, uyum nedenleri ve alan notu çevrili", async ({ page }) => {
  await page.goto(promptUrl);
  const block = page.locator("[data-prompt-block]");
  await block.waitFor();
  assert.match(await block.textContent(), /Recommended tool: GPT Image/);
  assert.match(await block.textContent(), /\d+ characters/);
  const dialog = await openSheet(page, "Try with a preset");
  await dialog.getByRole("button", { name: "Compatible ones" }).click();
  const options = dialog.locator("[data-preset-option]");
  assert.match(await options.nth(0).textContent(), /Matches .* · Any tool/);
  assert.match(await options.nth(1).textContent(), /Partly.*For another tool: Midjourney/s);
  await dialog.getByText(/Midjourney parameter: not used with this model/).waitFor();
  await dialog.getByRole("button", { name: "Copy adjusted text" }).waitFor();
  await dialog.getByRole("link", { name: "Try in Studio" }).waitFor();
}, { lang: "en" });

await browser.close(); server.close();
let failed = 0;
for (const [status, name] of results) { console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`); if (status === "FAIL") failed += 1; }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
