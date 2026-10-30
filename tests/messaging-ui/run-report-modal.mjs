// Merkezi şikâyet penceresi (docs/history/284-*): tüm şikâyet noktaları tek pencereyi açar — hazır nedenler (türe göre), isteğe bağlı ek bilgi, "Diğer" zorunlu açıklama,
// tek gönderim yolu (`submit_report` RPC'si), hata/yeniden deneme, çift gönderim, kapat-aç sıfırlanır, telefonda alt sayfa, koyu tema, İngilizce, ziyaretçi,
// moderatör kuyruğunda neden kodu + ayrıntı + süzgeç + eski satırlar. Ağ taklitli; gerçek Supabase'e KARŞI DENENMEDİ (kurallar: supabase/tests/report-reasons.sql).
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { installDetailData, seedComments, ID, PAGES } from "./detail-fixtures.mjs";

const PORT = 4201;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const byUsername = ({ table, q, rows }) => {
  const name = q.get("username")?.replace(/^eq\./, "");
  if (table === "profiles" && name) return rows(Object.values(U).filter((u) => u.username === name).map(pubOf));
  return null;
};

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", theme = null, guest = false, setup } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { reports: [] };
  setupCommunities(db);
  db.rpc.submit_report = (body) => {
    state.reports.push(body);
    if (state.fail) return state.fail(body, state.reports.length);
    return { body: crypto.randomUUID() };
  };
  setup?.(db, state);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { guest });
  await installDetailData(context);
  await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const directPosts = [];
  page.on("request", (r) => { if (r.method() === "POST" && /\/rest\/v1\/reports/.test(r.url())) directPosts.push(r.url()); });
  try {
    await fn({ page, context, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    assert.deepEqual(directPosts, [], "no direct insert into reports (single RPC entry)");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/report-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const modal = (page) => page.locator("[data-report-modal]");
const reasonCodes = (page) => modal(page).locator("[data-report-reason]").evaluateAll((els) => els.map((el) => el.getAttribute("data-report-reason")));
const submitBtn = (page) => page.locator("[data-report-submit]");
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/** Prompt detay sayfasında ⋮ menüsünden "Şikayet Et" (yazar carol, bakan alice). */
async function openPromptReport(page) {
  await page.goto(BASE + PAGES.prompt);
  await page.locator("[data-detail-actions]").waitFor();
  await page.getByRole("button", { name: /Gönderi seçenekleri|Post options/ }).first().click();
  await page.getByRole("menuitem", { name: /Şikayet Et|Report/ }).click();
  await modal(page).waitFor();
}

const PROMPT_REASONS = ["spam", "copyright", "sexual", "hate", "harassment", "violence", "privacy", "fraud", "wrongcat", "platform", "other"];

await scenario("1. Prompt şikâyeti: pencere önizlemeyle açılır, 11 neden sırayla, seçilince ek bilgi çıkar; gönderim TEK RPC'dir ve başarı ekranı içeriği kaldırılmış gibi göstermez", async ({ page, state }) => {
  await openPromptReport(page);
  await modal(page).getByRole("heading", { name: "İçeriği şikâyet et" }).waitFor();
  await modal(page).getByText("Bu içeriği neden şikâyet ettiğini seç.").waitFor();
  await modal(page).locator("[data-report-preview]").getByText("Prompt", { exact: true }).waitFor();
  await modal(page).locator("[data-report-preview]").getByText("Markalı mekanik klavye tuşları").waitFor();
  assert.deepEqual(await reasonCodes(page), PROMPT_REASONS);
  assert.equal(await modal(page).locator("textarea").count(), 0, "ek bilgi alanı neden seçilince çıkar");
  assert.equal(await submitBtn(page).getAttribute("aria-disabled"), "true");
  await modal(page).locator("[data-report-reason='spam']").click();
  assert.equal(await modal(page).locator("[data-report-reason='spam']").getAttribute("aria-checked"), "true");
  await modal(page).getByText("Ek bilgi").waitFor();
  await modal(page).getByText("(isteğe bağlı)").waitFor();
  await shot(page, "report-form");
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  await page.getByText("Şikâyetin alındı.").waitFor();
  await page.getByText("Bildirimini değerlendireceğiz.").waitFor();
  await page.getByText(/otomatik olarak kaldırılmaz/).first().waitFor();
  assert.deepEqual(state.reports, [{ p_target_type: "prompt", p_target_id: ID.prompt, p_reason_code: "spam", p_details: null }]);
  await shot(page, "report-success");
  await modal(page).getByRole("button", { name: "Kapat" }).click();
  await modal(page).waitFor({ state: "detached" });
});

await scenario("2. Neden seçmeden gönderilemez: düğme pasif, RPC çağrılmaz; ek bilgi boş bırakılabilir", async ({ page, state }) => {
  await openPromptReport(page);
  await submitBtn(page).click({ force: true });
  await page.waitForTimeout(250);
  assert.equal(state.reports.length, 0);
  assert.equal(await modal(page).locator("[data-report-error]").count(), 0);
  await modal(page).locator("[data-report-reason='fraud']").click();
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  assert.equal(state.reports.length, 1);
  assert.equal(state.reports[0].p_details, null, "boş ek bilgi null gider");
});

await scenario("3. «Diğer» açıklama ister: boşken gönderilmez (satır içi uyarı + Zorunlu), kısa metin de yetmez, yazınca gider (kırpılmış)", async ({ page, state }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='other']").click();
  await modal(page).getByText("Zorunlu").waitFor();
  await submitBtn(page).click();
  await modal(page).getByText("«Diğer» seçtiysen sorunu kısaca açıklaman gerekiyor.").waitFor();
  assert.equal(await modal(page).locator("textarea").getAttribute("aria-invalid"), "true");
  assert.equal(state.reports.length, 0);
  await modal(page).locator("textarea").fill("ab");
  await submitBtn(page).click();
  assert.equal(state.reports.length, 0, "2 karakter yetmez");
  await modal(page).locator("textarea").fill("  Sorun burada anlatılıyor  ");
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  assert.equal(state.reports[0].p_reason_code, "other");
  assert.equal(state.reports[0].p_details, "Sorun burada anlatılıyor");
});

await scenario("3b. Ek bilgi 1000 karakterde kesilir ve sayaç gösterir", async ({ page }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='harassment']").click();
  await modal(page).locator("textarea").fill("x".repeat(1200));
  assert.equal((await modal(page).locator("textarea").inputValue()).length, 1000);
  await modal(page).getByText("1000/1000").waitFor();
});

await scenario("4. Ağ hatası: iletişim kesilir → hata satırı, seçim ve metin KORUNUR, düğme «Tekrar dene»; bağlantı gelince aynı seçimle gider", async ({ page, context, state }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='hate']").click();
  await modal(page).locator("textarea").fill("Not metni");
  let blocked = true;
  await context.route(/\/rest\/v1\/rpc\/submit_report/, (route) => (blocked ? route.abort("connectionfailed") : route.fallback()));
  await submitBtn(page).click();
  await modal(page).locator("[data-report-error]").waitFor();
  await modal(page).getByText("Şikâyet gönderilemedi. Bağlantını kontrol edip tekrar dene; seçimin korundu.").waitFor();
  assert.equal(await modal(page).locator("[data-report-reason='hate']").getAttribute("aria-checked"), "true");
  assert.equal(await modal(page).locator("textarea").inputValue(), "Not metni");
  assert.match(await submitBtn(page).innerText(), /Tekrar dene/);
  await shot(page, "report-error");
  blocked = false;
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  assert.equal(state.reports.at(-1).p_reason_code, "hate");
  assert.equal(state.reports.at(-1).p_details, "Not metni");
});

await scenario("5. Sunucu hataları okunur cümleyle gösterilir: yinelenen şikâyet, hız sınırı, içerik bulunamadı — ham kod görünmez", async ({ page, state }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='spam']").click();
  const errors = [
    ["report_duplicate", "Bu içeriği zaten bildirdin; ekibimiz inceliyor."],
    ["rate_limit", "Çok hızlı işlem yapıyorsun"],
    ["report_target_not_found", "Bu içerik artık bulunamıyor."],
    ["invalid_report_reason", "Seçtiğin neden bu içerik için geçerli değil."],
  ];
  let i = 0;
  state.fail = () => ({ status: 400, body: { code: "P0001", message: errors[i][0], details: null, hint: null } });
  for (; i < errors.length; i += 1) {
    await submitBtn(page).click();
    await modal(page).locator("[data-report-error]").getByText(errors[i][1], { exact: false }).waitFor();
    assert.doesNotMatch(await modal(page).locator("[data-report-error]").innerText(), /report_duplicate|rate_limit|report_target_not_found|invalid_report_reason/);
    assert.equal(await page.locator("[data-report-success]").count(), 0);
  }
});

await scenario("6. Tekrarlanan gönderim: hızlı çift tıklama TEK istek yapar (yanıt gelene kadar kilitli)", async ({ page, context, state }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='spam']").click();
  await context.route(/\/rest\/v1\/rpc\/submit_report/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return route.fallback();
  });
  await submitBtn(page).dblclick();
  await submitBtn(page).click({ force: true, timeout: 500 }).catch(() => undefined);
  await page.locator("[data-report-success]").waitFor();
  assert.equal(state.reports.length, 1, "tek RPC çağrısı");
});

await scenario("7. Kapat-aç sıfırlanır: seçim ve metin kalmaz; Escape ve Vazgeç kapatır; gönderilmemiş şikâyet kaydedilmez", async ({ page, state }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='violence']").click();
  await modal(page).locator("textarea").fill("yarım kalan");
  await page.keyboard.press("Escape");
  await modal(page).waitFor({ state: "detached" });
  await page.getByRole("button", { name: /Gönderi seçenekleri|Post options/ }).first().click();
  await page.getByRole("menuitem", { name: "Şikayet Et" }).click();
  await modal(page).waitFor();
  assert.equal(await modal(page).locator("[data-report-reason][aria-checked='true']").count(), 0);
  assert.equal(await modal(page).locator("textarea").count(), 0);
  await modal(page).getByRole("button", { name: "Vazgeç" }).click();
  await modal(page).waitFor({ state: "detached" });
  assert.equal(state.reports.length, 0);
});

await scenario("8. Profil şikâyeti: Profil önizlemesi, 9 neden (Sahte hesap ilk), p_target_type=user", async ({ page, db, state }) => {
  db.extraRoutes = async (ctx) => byUsername(ctx);
  await page.goto(`${BASE}/profile/real?username=${U.bob.username}`);
  await page.getByRole("button", { name: "Profil seçenekleri" }).click();
  await page.getByRole("menuitem", { name: "Bu kullanıcıyı şikayet et" }).click();
  await modal(page).waitFor();
  await modal(page).locator("[data-report-preview]").getByText("Profil", { exact: true }).waitFor();
  await modal(page).locator("[data-report-preview]").getByText("Bob", { exact: true }).waitFor();
  assert.deepEqual(await reasonCodes(page), ["impersonation", "harassment", "spam", "hate", "sexual", "violence", "privacy", "fraud", "other"]);
  await modal(page).getByText("Sahte hesap veya kimliğe bürünme").waitFor();
  await modal(page).locator("[data-report-reason='impersonation']").click();
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  assert.deepEqual(state.reports, [{ p_target_type: "user", p_target_id: U.bob.id, p_reason_code: "impersonation", p_details: null }]);
});

await scenario("9. Yorum şikâyeti: Yorum önizlemesi (yorum metni), 8 neden, p_target_type=comment", async ({ page, db, state }) => {
  seedComments(db, "prompt");
  await page.goto(BASE + PAGES.prompt);
  await page.getByText("Deniz: Kare formatta").first().waitFor();
  await page.getByRole("button", { name: "Şikayet Et" }).first().click();
  await modal(page).waitFor();
  await modal(page).locator("[data-report-preview]").getByText("Yorum", { exact: true }).waitFor();
  assert.deepEqual(await reasonCodes(page), ["harassment", "spam", "hate", "sexual", "violence", "privacy", "fraud", "other"]);
  await modal(page).locator("[data-report-reason='harassment']").click();
  await submitBtn(page).click();
  await page.locator("[data-report-success]").waitFor();
  assert.equal(state.reports[0].p_target_type, "comment");
  assert.equal(state.reports[0].p_reason_code, "harassment");
  assert.equal(state.reports[0].p_target_id, db.comments[0].id);
});

await scenario("10. Telefon: pencere alttan açılan sayfa (tam genişlik, en çok %75 yükseklik), alt düğmeler sabit ve görünür, yatay taşma yok", async ({ page }) => {
  await openPromptReport(page);
  const frame = await modal(page).boundingBox();
  assert.ok(frame.width >= 388 && frame.x <= 1, `tam genişlik (${frame.width})`);
  assert.ok(frame.y + frame.height >= 798, "ekranın altına yapışık");
  assert.ok(frame.height <= 800 * 0.75 + 2, `yükseklik %75'i aşmaz (${frame.height})`);
  await modal(page).locator("[data-report-reason='spam']").click();
  const submit = await submitBtn(page).boundingBox();
  assert.ok(submit.y + submit.height <= 800 && submit.y > 0, "Gönder düğmesi ekranda");
  // Neden listesi kayar, başlık ve alt satır yerinde kalır.
  const before = await submitBtn(page).boundingBox();
  await modal(page).locator("[data-report-reason='other']").scrollIntoViewIfNeeded();
  const after = await submitBtn(page).boundingBox();
  assert.equal(Math.round(before.y), Math.round(after.y), "alt satır sabit");
  assert.equal(await overflowFree(page), true);
  await shot(page, "report-phone");
}, { viewport: { width: 390, height: 800 } });

await scenario("11. Koyu tema: pencere koyu yüzey, metin okunur; seçili neden vurgulanır", async ({ page }) => {
  await openPromptReport(page);
  await modal(page).locator("[data-report-reason='copyright']").click();
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
  const bg = await modal(page).evaluate((el) => getComputedStyle(el).backgroundColor);
  const fg = await modal(page).getByRole("heading", { name: "İçeriği şikâyet et" }).evaluate((el) => getComputedStyle(el).color);
  assert.ok(lum(bg) < 0.25, `koyu yüzey (${bg})`);
  assert.ok(lum(fg) > 0.7, `açık metin (${fg})`);
  await shot(page, "report-dark");
}, { theme: "dark" });

await scenario("12. İngilizce: başlık, nedenler, düğmeler ve başarı ekranı İngilizce", async ({ page, state }) => {
  await openPromptReport(page);
  await modal(page).getByRole("heading", { name: "Report content" }).waitFor();
  await modal(page).getByText("Choose why you're reporting this.").waitFor();
  await modal(page).getByText("Spam or misleading content").waitFor();
  await modal(page).getByText("Violation of AI, prompt or platform rules").waitFor();
  assert.equal(await modal(page).getByText("Spam veya yanıltıcı içerik").count(), 0);
  await modal(page).locator("[data-report-reason='other']").click();
  await modal(page).getByText("Required").waitFor();
  await submitBtn(page).click();
  await modal(page).getByText("If you chose “Other”, please briefly describe the problem.").waitFor();
  await modal(page).locator("textarea").fill("Details here");
  await modal(page).getByRole("button", { name: "Submit report" }).click();
  await page.getByText("Report received.").waitFor();
  await page.getByText("We'll review your report.").waitFor();
  assert.equal(state.reports[0].p_reason_code, "other");
}, { lang: "en" });

await scenario("13. Ziyaretçi (oturumsuz): şikâyet noktası hiç çizilmez, pencere açılmaz", async ({ page }) => {
  await page.goto(BASE + PAGES.prompt);
  await page.locator("[data-detail-actions]").waitFor();
  assert.equal(await page.getByRole("menuitem", { name: /Şikayet Et/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Şikayet Et" }).count(), 0);
  assert.equal(await modal(page).count(), 0);
}, { guest: true });

await scenario("14. Kendi içeriğini şikâyet etme noktası yok: sahibinin ⋮ menüsünde «Şikayet Et» çıkmaz", async ({ page, db }) => {
  db.extraRoutes = async (ctx) => (ctx.table === "profiles" ? null : null);
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await page.getByRole("heading", { name: U.alice.display_name }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Bu kullanıcıyı şikayet et" }).count(), 0);
});

// ---- Moderatör tarafı ----------------------------------------------------------------------------------------------------------
const QUEUE = [
  { id: "d0000000-0000-4000-8000-000000000001", status: "open", reason: "Spam veya yanıltıcı içerik\nAynı bağlantıyı tekrar tekrar yapıştırıyor.", reason_code: "spam", details: "Aynı bağlantıyı tekrar tekrar yapıştırıyor.", created_at: "2026-09-21T10:00:00Z", reviewed_at: null, resolution_note: null, target_type: "prompt", target_id: ID.prompt, reporter_id: U.bob.id, reporter_username: "bobby", target_exists: true, target_title: "Markalı mekanik klavye tuşları", target_author_id: U.carol.id, target_author_username: "carol", target_href: `/prompts/local?id=${ID.prompt}` },
  { id: "d0000000-0000-4000-8000-000000000002", status: "open", reason: "Yanlış kategori veya topluluk kuralı ihlali", reason_code: "wrongcat", details: null, created_at: "2026-09-21T09:00:00Z", reviewed_at: null, resolution_note: null, target_type: "community", target_id: "e0000000-0000-4000-8000-0000000000c1", reporter_id: U.dave.id, reporter_username: "dave", target_exists: true, target_title: "Görsel Prompt Topluluğu", target_author_id: null, target_author_username: null, target_href: "/communities/local?id=e0000000-0000-4000-8000-0000000000c1" },
  { id: "d0000000-0000-4000-8000-000000000003", status: "open", reason: "eski serbest metin şikâyeti", reason_code: null, details: null, created_at: "2026-09-20T09:00:00Z", reviewed_at: null, resolution_note: null, target_type: "comment", target_id: "e0000000-0000-4000-8000-0000000000c2", reporter_id: U.carol.id, reporter_username: "carol", target_exists: false, target_title: null, target_author_id: null, target_author_username: null, target_href: null },
];

function queueMock(db, state) {
  db.rpc.is_moderator = () => ({ body: true });
  db.rpc.moderation_report_queue = (body) => {
    state.queueCalls = [...(state.queueCalls ?? []), body];
    if (state.queueFallback && "p_reason" in body) return { status: 404, body: { code: "PGRST202", message: "Could not find the function public.moderation_report_queue(p_reason, p_status) in the schema cache" } };
    const rows = QUEUE.filter((r) => !body.p_reason || body.p_reason === "all" || (body.p_reason === "legacy" ? r.reason_code === null : r.reason_code === body.p_reason));
    // Eski tek argümanlı imza neden kodu/ayrıntı döndürmez.
    return { body: "p_reason" in body ? rows : rows.map((r) => { const copy = { ...r }; delete copy.reason_code; delete copy.details; return copy; }) };
  };
}

await scenario("15. Moderatör kuyruğu: hazır neden adı + ek bilgi, topluluk hedefi adıyla (Kaldır yok), kodsuz eski şikâyet ham metin + «Eski şikâyet» etiketi", async ({ page, db, state }) => {
  queueMock(db, state);
  await page.goto(`${BASE}/moderation`);
  const cards = page.locator("[data-report-id]");
  await cards.first().waitFor();
  assert.equal(await cards.count(), 3);
  const first = page.locator("[data-report-id='d0000000-0000-4000-8000-000000000001']");
  await first.locator("[data-report-reason-code='spam']").getByText("Spam veya yanıltıcı içerik").waitFor();
  await first.locator("[data-report-details]").getByText("Aynı bağlantıyı tekrar tekrar yapıştırıyor.").waitFor();
  await first.getByRole("button", { name: "İçeriği kaldır" }).waitFor();
  const community = page.locator("[data-report-id='d0000000-0000-4000-8000-000000000002']");
  await community.getByText("Topluluk", { exact: true }).first().waitFor();
  await community.getByText("Görsel Prompt Topluluğu").waitFor();
  await community.locator("[data-report-reason-code='wrongcat']").waitFor();
  assert.equal(await community.getByRole("button", { name: "İçeriği kaldır" }).count(), 0, "topluluk şikâyetinde kaldırma yok");
  const legacy = page.locator("[data-report-id='d0000000-0000-4000-8000-000000000003']");
  await legacy.getByText("eski serbest metin şikâyeti").waitFor();
  await legacy.getByText("Eski şikâyet (serbest metin)").waitFor();
  await shot(page, "report-moderation");
  assert.deepEqual(state.queueCalls[0], { p_status: "open", p_reason: "all" });
});

await scenario("16. Moderatör neden süzgeci: seçilen neden sunucuya p_reason olarak gider; «Eski şikâyet» kodsuz satırları getirir", async ({ page, db, state }) => {
  queueMock(db, state);
  await page.goto(`${BASE}/moderation`);
  await page.locator("[data-report-id]").first().waitFor();
  // Filtre penceresi (telefonda/masaüstünde aynı kontrol): neden çiplerini içerir.
  await page.getByRole("button", { name: /Filtre|Filter/ }).first().click();
  await page.locator("[data-reason-filter='wrongcat']").click();
  await page.locator("[data-report-id='d0000000-0000-4000-8000-000000000002']").waitFor();
  await page.locator("[data-report-id='d0000000-0000-4000-8000-000000000001']").waitFor({ state: "detached" });
  assert.equal(state.queueCalls.at(-1).p_reason, "wrongcat");
  await page.locator("[data-reason-filter='legacy']").click();
  await page.locator("[data-report-id='d0000000-0000-4000-8000-000000000003']").waitFor();
  assert.equal(state.queueCalls.at(-1).p_reason, "legacy");
});

await scenario("17. Migration henüz uygulanmadıysa kuyruk eski tek argümanlı imzaya düşer (sayfa açılır, neden kodu yok)", async ({ page, db, state }) => {
  state.queueFallback = true;
  queueMock(db, state);
  await page.goto(`${BASE}/moderation`);
  await page.locator("[data-report-id]").first().waitFor();
  assert.equal(await page.locator("[data-report-reason-code]").count(), 0);
  assert.deepEqual(state.queueCalls.map((c) => Object.keys(c).sort().join()), ["p_reason,p_status", "p_status"]);
  await page.getByText("Spam veya yanıltıcı içerik").first().waitFor();
});

console.log("\n" + results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
server.close?.();
process.exit(failed ? 1 : 0);
