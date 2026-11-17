// İlk giriş kurulumu (docs/history/424-*): yeni kayıt olan, en az 2 konu seçmeden siteyi kullanamaz. Ağ taklitli; gerçek Supabase'e KARŞI
// DENENMEDİ — profilin `interests` sütununu yazmak ve `suggest_creators` sıralaması sunucu tarafıdır, burada yalnız istemci kapısı sınanır.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U, ME } from "./mock.mjs";

const PORT = 4291;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const NEW_AT = "2026-11-20T09:00:00Z"; // kesim tarihinden (2026-11-17) sonra açılan hesap
const OLD_AT = "2026-01-01T00:00:00Z";
const person = (u, extra = {}) => ({ id: u.id, username: u.username, display_name: u.display_name, avatar_url: null, cover_url: null, bio: "Prompt yazarı", website: null, follower_count: 12, following_count: 3, created_at: OLD_AT, interests: [], is_demo: false, ...extra });
const SUGGESTED = [U.bob, U.carol, U.dave];

async function scenario(name, fn, { viewport = { width: 390, height: 844 }, lang = "tr", createdAt = NEW_AT, interests = [], suggestFails = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { interests: [...interests], createdAt, patches: [], follows: [], signedOut: false, username: "kullanici_4821", avatarUrl: null, uploads: [], takenNames: ["ali", "alice", "elif"], usernameConflict: false };
  db.rpc.feed_page = () => ({ body: [] });
  db.rpc.for_you_page = () => ({ body: [] });
  db.rpc.trending_tags = () => ({ body: [] });
  db.rpc.suggest_creators = () =>
    suggestFails ? { status: 500, body: { message: "boom" } } : { body: SUGGESTED.map((u, i) => ({ id: u.id, reason_kind: "active", reason_ref: null, reason_count: 0, score: 100 - i })) };
  const context = await browser.newContext({ viewport });
  await installMock(context, db);
  // Kendi profil satırı (kimlik ME) + önerilenler; interests PATCH'i durumu günceller.
  await context.route(/\/rest\/v1\/profiles\?/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const single = (req.headers().accept ?? "").includes("vnd.pgrst.object");
    const own = () => person(U.alice, { created_at: state.createdAt, interests: state.interests, bio: null, username: state.username, avatar_url: state.avatarUrl });
    if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      state.patches.push(body);
      if (Array.isArray(body.interests)) state.interests = body.interests;
      if (typeof body.username === "string") {
        if (state.usernameConflict) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }) });
        state.username = body.username;
      }
      if ("avatar_url" in body) state.avatarUrl = body.avatar_url;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? own() : [own()]) });
    }
    if (req.method() !== "GET") return route.fallback();
    const nameFilter = url.searchParams.get("username") ?? "";
    if (nameFilter.startsWith("eq.")) {
      state.nameChecks = [...(state.nameChecks ?? []), nameFilter.slice(3)];
      const taken = state.takenNames.includes(nameFilter.slice(3));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(taken ? [{ id: U.bob.id }] : []) });
    }
    const idFilter = url.searchParams.get("id") ?? "";
    if (idFilter === `eq.${ME}`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(single ? own() : [own()]) });
    if (idFilter.startsWith("in.")) {
      const rows = SUGGESTED.filter((u) => idFilter.includes(u.id)).map((u) => person(u));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    }
    return route.fallback();
  });
  await context.route(/\/rest\/v1\/follows/, (route) => {
    const req = route.request();
    if (req.method() === "POST") state.follows.push(req.postDataJSON());
    if (req.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    return route.fulfill({ status: req.method() === "POST" ? 201 : 204, contentType: "application/json", body: req.method() === "POST" ? "[]" : "" });
  });
  await context.route(/\/storage\/v1\/object\/avatars\//, (route) => {
    state.uploads.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "avatars/x" }) });
  });
  await context.route(/\/auth\/v1\/logout/, (route) => {
    state.signedOut = true;
    return route.fulfill({ status: 204, body: "" });
  });
  await context.addInitScript((l) => {
    try {
      localStorage.setItem("promptly-language", l);
      localStorage.setItem("promptly-tour-seen", "1");
    } catch {}
  }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(9000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/fr-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const gate = (page) => page.locator("[data-first-run-setup]");
const shell = (page) => page.locator("#main-content");
const topic = (page, slug) => page.locator(`[data-first-run-topic="${slug}"]`);
const next = (page) => page.locator("[data-first-run-next]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(450); await page.screenshot({ path: `${SHOTS}/${name}.png` }); } };

await scenario("1. yeni hesap: kurulum ekranı açılır, site (menü + sayfa) hiç çizilmez; İleri pasif, ipucu 'en az 2'", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await page.getByRole("heading", { name: "Bir veya birkaç konu seçin" }).waitFor();
  assert.equal(await shell(page).count(), 0, "sayfa içeriği çizilmez");
  assert.equal(await page.locator("nav").count(), 0, "gezinme çizilmez");
  assert.equal(await page.locator("[data-first-run-topic]").count(), 14, "14 alan satırı");
  assert.equal(await topic(page, "photography").locator("img").count(), 3, "her satırda 3 görsel");
  assert.equal(await next(page).isDisabled(), true);
  assert.match(await page.locator("[data-first-run-hint]").innerText(), /en az 2 kategoriyi takip edin/);
  assert.equal(await page.getByRole("button", { name: /Atla|Kapat|Şimdilik/ }).count(), 0, "atlama / kapatma yok");
  await shot(page, "1-topics");
  assert.equal(await overflowFree(page), true);
});

await scenario("2. bir konu yetmez, iki konu İleri'yi açar; seçili satır 'Takip Edildi' der; en çok 5 konu", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "art").click();
  assert.equal(await topic(page, "art").getAttribute("aria-pressed"), "true");
  await topic(page, "art").getByText("Takip Edildi").waitFor();
  assert.equal(await next(page).isDisabled(), true);
  assert.match(await page.locator("[data-first-run-hint]").innerText(), /1 kategori daha/);
  await topic(page, "photography").click();
  assert.equal(await next(page).isDisabled(), false);
  assert.match(await page.locator("[data-first-run-hint]").innerText(), /İyi iş çıkardınız/);
  await shot(page, "2-two-picked");
  for (const s of ["design", "software", "writing"]) await topic(page, s).click();
  assert.equal(await topic(page, "video").getAttribute("aria-disabled"), "true", "dolunca diğer satırlar soluk");
  await topic(page, "video").click({ force: true });
  assert.equal(await topic(page, "video").getAttribute("aria-pressed"), "false", "6. konu eklenmez");
  assert.equal(await page.locator('[data-first-run-topic][aria-pressed="true"]').count(), 5);
  await topic(page, "writing").click();
  assert.equal(await page.locator('[data-first-run-topic][aria-pressed="true"]').count(), 4, "seçim geri alınabilir");
});

await scenario("3. tam akış: konular profile yazılır → kişi önerileri → takip → 'Özel akışın oluşturuluyor' → site açılır", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "art").click();
  await topic(page, "design").click();
  await next(page).click();
  const people = page.locator("[data-first-run-person]");
  await people.first().waitFor();
  assert.deepEqual(state.patches, [{ interests: ["art", "design"] }], "konular profiles.interests'e yazıldı");
  assert.equal(await people.count(), 3, "3 öneri");
  await page.getByRole("heading", { name: "Kimleri takip edelim?" }).waitFor();
  assert.match(await page.locator("[data-first-run-follow-hint]").innerText(), /0 \/ 3/);
  assert.equal(await shell(page).count(), 0, "kişi adımında da site yok");
  await shot(page, "3-people");
  await people.nth(0).getByRole("button", { name: "Takip Et" }).click();
  await people.nth(1).getByRole("button", { name: "Takip Et" }).click();
  await page.waitForFunction(() => /2 \/ 3/.test(document.querySelector("[data-first-run-follow-hint]")?.textContent ?? ""));
  await page.locator("[data-first-run-finish]").click();
  await page.getByRole("heading", { name: "Profilini tamamla" }).waitFor();
  assert.equal(await shell(page).count(), 0, "profil adımında da site yok");
  await page.locator("[data-first-run-profile-finish]").click();
  await page.locator("[data-first-run-building]").waitFor();
  await page.getByText("Özel akışın oluşturuluyor").waitFor();
  await page.getByText(/gönderileri toplanıyor/).waitFor();
  await shot(page, "3-building");
  await shell(page).waitFor({ timeout: 8000 });
  assert.equal(await gate(page).count(), 0, "kurulum kapandı");
  assert.equal(state.follows.length >= 2, true, "iki takip yazıldı");
  const flag = await page.evaluate((me) => localStorage.getItem(`promptly-first-run-done:${me}`), ME);
  assert.equal(flag, "1", "bu cihazda bitti işareti");
  await page.reload();
  await shell(page).waitFor();
  assert.equal(await gate(page).count(), 0, "yenilemede kurulum geri gelmez");
});

await scenario("4. kişi adımı isteğe bağlı: takip etmeden 'Şimdilik geç' siteyi açar", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "game-3d").click();
  await topic(page, "music-audio").click();
  await next(page).click();
  await page.locator("[data-first-run-person]").first().waitFor();
  await page.getByRole("button", { name: "Şimdilik geç" }).click();
  await page.getByRole("heading", { name: "Profilini tamamla" }).waitFor();
  await page.locator("[data-first-run-profile-finish]").click();
  await page.locator("[data-first-run-building]").waitFor();
  await shell(page).waitFor({ timeout: 8000 });
});

await scenario("5. kapı kaçınılmaz: başka adrese gitmek de kurulumu gösterir; Esc kapatmaz; çıkış yapılabilir", async ({ page, state }) => {
  await page.goto(`${BASE}/discover/`);
  await gate(page).waitFor();
  assert.equal(await shell(page).count(), 0);
  await page.keyboard.press("Escape");
  assert.equal(await gate(page).count(), 1, "Esc kapatmaz");
  await page.goto(`${BASE}/settings/`);
  await gate(page).waitFor();
  await page.locator("[data-first-run-signout]").click();
  await page.waitForFunction(() => !document.querySelector("[data-first-run-setup]"));
  assert.equal(state.signedOut, true, "oturum kapatıldı");
});

await scenario("6. eski hesap (kesim tarihinden önce) hiç zorlanmaz", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await shell(page).waitFor();
  assert.equal(await gate(page).count(), 0);
}, { createdAt: OLD_AT });

await scenario("7. yeni hesap ama 2 konusu zaten kayıtlı → zorlanmaz (kayıt sunucuda durur)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await shell(page).waitFor();
  assert.equal(await gate(page).count(), 0);
}, { interests: ["art", "photography"] });

await scenario("8. kayıt hatası: ekranda kalır, hata gösterilir, tekrar denenebilir", async ({ page, state }) => {
  await page.route(/\/rest\/v1\/profiles\?/, (route) => (route.request().method() === "PATCH" && !state.allowPatch ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "boom" }) }) : route.fallback()));
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "art").click();
  await topic(page, "photography").click();
  await next(page).click();
  await page.locator("[data-first-run-error]").waitFor();
  assert.equal(await page.locator("[data-first-run-person]").count(), 0, "kişi adımına geçilmedi");
  assert.equal(await next(page).isDisabled(), false, "tekrar denenebilir");
});

await scenario("9. öneriler yüklenemezse 'Tekrar dene' görünür ve kurulum yine bitirilebilir", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "art").click();
  await topic(page, "photography").click();
  await next(page).click();
  await page.getByText("Öneriler yüklenemedi.").waitFor();
  await page.getByRole("button", { name: "Tekrar dene" }).waitFor();
  await page.getByRole("button", { name: "Şimdilik geç" }).click();
  await page.getByRole("heading", { name: "Profilini tamamla" }).waitFor();
  await page.locator("[data-first-run-profile-finish]").click();
  await shell(page).waitFor({ timeout: 8000 });
}, { suggestFails: true });

await scenario("10. İngilizce metinler + masaüstü düzeni (taşma yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await page.getByRole("heading", { name: "Pick a few topics" }).waitFor();
  await page.getByText("Follow at least 2 topics to continue").waitFor();
  await topic(page, "art").click();
  await topic(page, "game-3d").click();
  await page.getByText("Nice work!").waitFor();
  await topic(page, "art").getByText("Following").waitFor();
  await shot(page, "10-en-desktop");
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 1280, height: 800 }, lang: "en" });


/** Konu + kişi adımlarını geçip profil adımına gelir. */
const toProfileStep = async (page, en = false) => {
  await page.goto(`${BASE}/`);
  await gate(page).waitFor();
  await topic(page, "art").click();
  await topic(page, "photography").click();
  await next(page).click();
  await page.locator("[data-first-run-person]").first().waitFor();
  await page.getByRole("button", { name: en ? "Skip for now" : "Şimdilik geç" }).click();
  await page.getByRole("heading", { name: en ? "Complete your profile" : "Profilini tamamla" }).waitFor();
};
const usernameInput = (page) => page.locator("[data-first-run-username]");
const usernameStatus = (page) => page.locator("[data-first-run-username-status]");
const profileFinish = (page) => page.locator("[data-first-run-profile-finish]");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

await scenario("11. profil adımı: otomatik kullanıcı adı dolu gelir ve müsait; canlı kontrol: kısa / geçersiz / alınmış (öneriyle) / müsait", async ({ page, state }) => {
  await toProfileStep(page);
  assert.equal(await usernameInput(page).inputValue(), "kullanici_4821", "kayıtta üretilen ad");
  assert.equal(await usernameStatus(page).getAttribute("data-first-run-username-status"), "available");
  assert.equal(await profileFinish(page).isDisabled(), false);
  assert.equal(state.nameChecks, undefined, "kendi adı sorgulanmaz");
  await shot(page, "11-profile");
  await usernameInput(page).fill("ab");
  await page.getByText("En az 3 karakter olmalı.").waitFor();
  assert.equal(await profileFinish(page).isDisabled(), true);
  await usernameInput(page).fill("Ali Veli!");
  assert.equal(await usernameInput(page).inputValue(), "aliveli!", "küçük harf + boşluksuz");
  await page.getByText("Yalnızca küçük harf, rakam, _ ve . kullanabilirsin.").first().waitFor();
  assert.equal(await profileFinish(page).isDisabled(), true);
  await usernameInput(page).fill("ali");
  await page.getByText("@ali alınmış. Şunları dene: ali_1, ali.tr").waitFor();
  assert.equal(await profileFinish(page).isDisabled(), true);
  await shot(page, "11-taken");
  await usernameInput(page).fill("merve_k");
  await page.getByText("@merve_k müsait").waitFor();
  assert.equal(await profileFinish(page).isDisabled(), false);
  assert.ok(state.nameChecks.includes("ali") && state.nameChecks.includes("merve_k"));
  assert.equal(state.nameChecks.includes("a"), false, "kısa ad sunucuya sorulmaz");
});

await scenario("12. kaydet: yeni ad + hazır renkli resim → kullanıcı adı PATCH'i, avatars'a yükleme, avatar_url PATCH'i; site açılır", async ({ page, state }) => {
  await toProfileStep(page);
  await usernameInput(page).fill("merve_k");
  await page.getByText("@merve_k müsait").waitFor();
  await page.locator('[data-first-run-color="2"]').click();
  assert.equal(await page.locator('[data-first-run-color="2"]').getAttribute("aria-pressed"), "true");
  await page.locator("[data-first-run-preview]").getByText("@merve_k").waitFor();
  await profileFinish(page).click();
  await page.locator("[data-first-run-building]").waitFor();
  assert.ok(state.patches.some((b) => b.username === "merve_k"), "kullanıcı adı yazıldı");
  assert.equal(state.uploads.length, 1, "resim avatars'a yüklendi");
  assert.ok(String(state.avatarUrl).includes("/avatars/"), "avatar_url yazıldı");
  await shell(page).waitFor({ timeout: 8000 });
});

await scenario("13. fotoğraf yükle: önizleme fotoğrafa döner, Kaldır renge geri döner; ad değişmediyse kullanıcı adı yazılmaz", async ({ page, state }) => {
  await toProfileStep(page);
  await page.locator("[data-first-run-file]").setInputFiles({ name: "ben.png", mimeType: "image/png", buffer: PNG });
  await page.locator("[data-first-run-photo-remove]").waitFor();
  assert.equal(await page.locator("[data-first-run-profile] img").count(), 2, "büyük önizleme + 'böyle görünürsün' kartı fotoğraf");
  await shot(page, "13-photo");
  await page.locator("[data-first-run-photo-remove]").click();
  assert.equal(await page.locator("[data-first-run-profile] img").count(), 0, "renkli baş harfe döndü");
  await page.locator("[data-first-run-file]").setInputFiles({ name: "ben.png", mimeType: "image/png", buffer: PNG });
  await page.locator("[data-first-run-photo-remove]").waitFor();
  await profileFinish(page).click();
  await shell(page).waitFor({ timeout: 8000 });
  assert.equal(state.patches.filter((b) => "username" in b).length, 0, "ad aynı: kullanıcı adı PATCH'i yok");
  assert.equal(state.uploads.length, 1);
});

await scenario("14. kullanıcı adı çakışması (başkası araya girdi): hata gösterilir, adımda kalınır", async ({ page, state }) => {
  state.usernameConflict = true;
  await toProfileStep(page);
  await usernameInput(page).fill("merve_k");
  await page.getByText("@merve_k müsait").waitFor();
  await profileFinish(page).click();
  await page.locator("[data-first-run-profile-error]").getByText("Bu kullanıcı adı alınmış.").waitFor();
  assert.equal(await shell(page).count(), 0, "site açılmadı");
  assert.equal(state.uploads.length, 0, "resim yüklenmedi");
  assert.equal(await profileFinish(page).isDisabled(), false, "tekrar denenebilir");
});

await scenario("15. profil adımı İngilizce + masaüstü: iki sütun, taşma yok", async ({ page }) => {
  await toProfileStep(page, true);
  await page.getByText("Step 3 of 3").waitFor();
  await page.getByRole("button", { name: "Upload photo" }).waitFor();
  await page.getByText("This is how you'll look").waitFor();
  await usernameInput(page).fill("ali");
  await page.getByText("@ali is taken. Try: ali_1, ali.tr").waitFor();
  await shot(page, "15-profile-en-desktop");
  assert.equal(await overflowFree(page), true);
}, { viewport: { width: 1280, height: 800 }, lang: "en" });

console.log(results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
