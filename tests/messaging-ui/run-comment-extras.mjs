// Yorumda fotoğraf · GIF · içerik eki ve mesajda GIF (docs/history/307-*) — ağ taklitli arayüz testi.
// GIPHY ve Supabase taklit edilir; gerçek GIPHY'ye / Supabase'e / gerçek cihaza KARŞI DENENMEDİ. Derleme `NEXT_PUBLIC_GIPHY_API_KEY` ile alınmalıdır:
//   NEXT_PUBLIC_GIPHY_API_KEY=test-key NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy npm run build
//   CHROMIUM_PATH=… node tests/messaging-ui/run-comment-extras.mjs
// Veritabanı kuralları: supabase/tests/comment-media.sql.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { setupCommunities } from "./mock-communities.mjs";
import { ID, PAGES, installDetailData } from "./detail-fixtures.mjs";

const PORT = 4207;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const PHONE = { width: 390, height: 800 };
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const SVG = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="75"><rect width="100" height="75" fill="${c}"/></svg>`;
const json = (route, body, status = 200) => route.fulfill({ status, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*" }, contentType: "application/json", body: JSON.stringify(body) });

/** GIPHY taklidi: boş arama = trend (gif01…gif24), arama = `s<terim>01…`; sayfa 24'erli, toplam 48. */
const gifRow = (id) => ({ id, title: `GIF ${id}`, images: { fixed_width_small: { url: `https://media0.giphy.com/media/${id}/100w.gif`, width: "100", height: "75" }, fixed_width_small_still: { url: `https://media0.giphy.com/media/${id}/100w_s.gif`, width: "100", height: "75" } } });
const trendId = (n) => `gif${String(n).padStart(2, "0")}`;

/** Yorumun eki olarak okunabilen içerik (RLS + halka açık süzgeci): id → satır. */
const PUBLIC_PROMPT = { id: "b0000000-0000-4000-8000-000000000001", title: "Neon sokak portresi", status: "published", visibility: "public", community_id: null, deleted_at: null, profiles: { display_name: "Carol" }, prompt_media: [] };
const PRIVATE_PROMPT = { ...PUBLIC_PROMPT, id: "b0000000-0000-4000-8000-000000000002", title: "Sonradan özel yapılan", visibility: "private" };

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", setup, page: path = "prompt" } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  setupCommunities(db);
  db.ownContent.prompt = [{ id: PUBLIC_PROMPT.id, title: PUBLIC_PROMPT.title, visibility: "public" }];
  db.ownContent.workflow = [{ id: "b0000000-0000-4000-8000-0000000000a1", title: "Ürün akışı", visibility: "public" }];
  const state = { gifQueries: [], gifImages: [], cardQueries: [], attachableRows: [PUBLIC_PROMPT, PRIVATE_PROMPT], failNextPost: null, savedRows: [] };
  setup?.(db, state);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, {});
  await installDetailData(context);
  // GIPHY
  await context.route("https://api.giphy.com/**", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    state.gifQueries.push({ kind: url.pathname.split("/").pop(), q, offset, rating: url.searchParams.get("rating"), key: url.searchParams.get("api_key") });
    const tag = q ? `s${q.replace(/\W/g, "").slice(0, 6)}` : "gif";
    const data = Array.from({ length: 24 }, (_, i) => gifRow(q ? `${tag}${String(offset + i + 1).padStart(2, "0")}` : trendId(offset + i + 1)));
    return json(route, { data, pagination: { total_count: 48, count: 24, offset } });
  });
  await context.route(/https:\/\/media\d*\.giphy\.com\/.*/, (route) => {
    state.gifImages.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: SVG("#2f5bea") });
  });
  // Yorum eki kartları + kaydedilenler + yazma hatası (sonra kaydedilen route önce çalışır)
  await context.route("https://example.supabase.co/rest/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/").pop();
    if (req.method() === "GET" && table === "prompts" && (url.searchParams.get("id") ?? "").startsWith("in.(")) {
      state.cardQueries.push(url.searchParams.get("id"));
      const ids = url.searchParams.get("id").slice(4, -1).split(",").map((x) => x.replace(/"/g, ""));
      return json(route, state.attachableRows.filter((r) => ids.includes(r.id)));
    }
    if (req.method() === "GET" && table === "collection_items") return json(route, state.savedRows);
    if (req.method() === "POST" && table === "prompt_comments" && state.failNextPost) {
      const message = state.failNextPost;
      state.failNextPost = null;
      return json(route, { code: "P0001", message, details: "", hint: "" }, 400);
    }
    return route.fallback();
  });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    if (path === "prompt") {
      await page.goto(BASE + PAGES.prompt);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await page.locator("#comments").waitFor();
    }
    await fn({ page, db, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/cefail-${results.length}.png` }); } catch {}
  } finally { await context.close(); }
}

const SHOTS = process.env.SHOTS ?? "";
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const section = (page) => page.locator("#comments");
const composerInput = (page) => section(page).getByPlaceholder(/Bir yorum yaz|Write a comment/);
const sendButton = (page) => section(page).locator("form").first().getByRole("button", { name: /^(Gönder|Send)$/ });
const postsOf = (db) => db.calls.filter((c) => c.method === "POST" && c.table === "prompt_comments");
const extra = (page, kind) => section(page).locator(`[data-comment-extras-toolbar] [data-comment-extra='${kind}']`).first();
const overflowFree = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

await scenario("1. Giriş yapmış kullanıcıda yazma çubuğunun yanında Fotoğraf · GIF · İçerik düğmeleri var; ek yokken ipucu/önizleme çizilmez, 'Gönder' kapalı", async ({ page }) => {
  await composerInput(page).waitFor();
  for (const kind of ["photo", "gif", "content"]) await extra(page, kind).waitFor();
  assert.equal(await section(page).locator("[data-comment-extras]").count(), 0, "no preview without extras");
  assert.equal(await sendButton(page).isDisabled(), true);
});

await scenario("2. GIF: seçici açılır (trend, GIPHY ibaresi, sayfa=24); seçince pencere kapanır, önizleme çıkar; METİNSİZ 'Gönder' açılır ve yorum gönderilir", async ({ page, db, state }) => {
  await composerInput(page).waitFor();
  await extra(page, "gif").click();
  const picker = page.locator("[data-gif-picker]");
  await picker.waitFor();
  await picker.getByText("Powered by GIPHY").waitFor();
  await picker.getByText("GIF'ler GIPHY'den gelir").waitFor();
  await picker.locator("[data-gif-id]").first().waitFor();
  await shot(page, "gif-picker-desktop");
  assert.equal(await picker.locator("[data-gif-id]").count(), 24);
  assert.deepEqual(state.gifQueries[0], { kind: "trending", q: null, offset: 0, rating: "pg", key: "test-key" });
  await picker.locator("[data-gif-id='gif03']").click();
  await picker.waitFor({ state: "detached" });
  await section(page).locator("[data-comment-extra-preview='gif']").waitFor();
  assert.equal(await extra(page, "gif").getAttribute("aria-pressed"), "true");
  assert.equal(await sendButton(page).isDisabled(), false, "extras alone enable Send");
  await sendButton(page).click();
  await section(page).locator("[data-comment-media='gif'] img").waitFor();
  const [post] = postsOf(db);
  assert.equal(post.body.body, "");
  assert.equal(post.body.media_kind, "gif");
  assert.equal(post.body.media_ref, "gif03");
  assert.equal(post.body.media_width, 100);
  assert.equal(post.body.media_height, 75);
  assert.equal(post.body.attach_type, undefined);
  assert.match(await section(page).locator("[data-comment-media='gif'] img").getAttribute("src"), /media\/gif03\/200w\.gif$/);
  await section(page).scrollIntoViewIfNeeded();
  await shot(page, "comment-gif-desktop");
  assert.equal(await section(page).locator("[data-comment-extras]").count(), 0, "extras cleared after sending");
});

await scenario("3. GIF arama: konu çipi aramayı doldurur ve arar; yazı aranır (350 ms bekleme); sonraki sayfa kendiliğinden gelir (offset 24, yinelenen yok); X temizler", async ({ page, state }) => {
  await composerInput(page).waitFor();
  await extra(page, "gif").click();
  const picker = page.locator("[data-gif-picker]");
  await picker.locator("[data-gif-id]").first().waitFor();
  await picker.locator("[data-gif-topic='clap']").click();
  await picker.locator("[data-gif-id^='sAlk']").first().waitFor();
  assert.equal(await picker.locator("[data-gif-search]").inputValue(), "Alkış");
  assert.equal(state.gifQueries.at(-1).kind, "search");
  assert.equal(state.gifQueries.at(-1).q, "Alkış");
  await picker.locator("[data-gif-search]").fill("tebrik");
  await page.waitForFunction(() => document.querySelector("[data-gif-picker] [data-gif-id^='stebri']"));
  assert.equal(state.gifQueries.at(-1).q, "tebrik");
  // aşağı kaydırınca ikinci sayfa
  await picker.locator("[data-gif-grid]").scrollIntoViewIfNeeded();
  await picker.locator(".overflow-y-auto").first().evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll("[data-gif-picker] [data-gif-id]").length === 48, null, { timeout: 8000 });
  assert.equal(state.gifQueries.at(-1).offset, 24);
  const ids = await picker.locator("[data-gif-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-gif-id")));
  assert.equal(new Set(ids).size, ids.length, "no duplicates");
  await picker.getByRole("button", { name: "Aramayı temizle" }).click();
  await picker.locator("[data-gif-id='gif01']").waitFor();
  assert.equal(await picker.locator("[data-gif-topic='trend']").getAttribute("aria-pressed"), "true");
});

await scenario("4. Fotoğraf: seçilen dosya önizlenir (henüz yüklenmez); 'Gönder' → comment-media/<ben>/<uuid>.png yüklenir, yorum media_kind=photo ile yazılır, imzalı adresle görünür", async ({ page, db }) => {
  await composerInput(page).waitFor();
  await composerInput(page).fill("Sonucum bu");
  await section(page).locator("[data-comment-photo-input]").setInputFiles({ name: "sonuc.png", mimeType: "image/png", buffer: PNG });
  const preview = section(page).locator("[data-comment-extra-preview='photo']");
  await preview.waitFor();
  await preview.locator("[role='status']").waitFor({ state: "detached" });
  assert.equal(db.calls.filter((c) => c.method === "UPLOAD").length, 0, "nothing uploaded before Send");
  await sendButton(page).click();
  await section(page).locator("[data-comment-media='photo']").waitFor();
  const uploads = db.calls.filter((c) => c.method === "UPLOAD");
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].table, new RegExp(`^comment-media/${ME}/[0-9a-f-]{36}\\.png$`));
  const [post] = postsOf(db);
  assert.equal(post.body.media_kind, "photo");
  assert.ok(post.body.media_ref.startsWith(`${ME}/`) && post.body.media_ref.endsWith(".png"));
  assert.equal(post.body.media_width, 1);
  assert.equal(post.body.body, "Sonucum bu");
  await section(page).locator("[data-comment-media='photo'] img").waitFor();
  assert.ok(db.calls.some((c) => c.method === "SIGN" && c.table === "comment-media"), "photo shown through a signed URL");
  assert.equal(db.calls.filter((c) => c.method === "PUBLICGET").length, 0, "no public URL is ever requested");
});

await scenario("5. Yanlış dosya türü reddedilir (uyarı satırı), önizleme çıkmaz; fotoğraf seçip GIF'e geçmek fotoğrafın yerine geçer (tek görsel)", async ({ page }) => {
  await composerInput(page).waitFor();
  await section(page).locator("[data-comment-photo-input]").setInputFiles({ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("merhaba") });
  await section(page).getByRole("alert").filter({ hasText: "Yalnızca JPEG, PNG, WebP veya GIF" }).waitFor();
  assert.equal(await section(page).locator("[data-comment-extra-preview]").count(), 0);
  await section(page).locator("[data-comment-photo-input]").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await section(page).locator("[data-comment-extra-preview='photo']").waitFor();
  await extra(page, "gif").click();
  await page.locator("[data-gif-id='gif01']").click();
  await section(page).locator("[data-comment-extra-preview='gif']").waitFor();
  assert.equal(await section(page).locator("[data-comment-extra-preview='photo']").count(), 0, "GIF replaced the photo");
  assert.equal(await extra(page, "photo").getAttribute("aria-pressed"), "false");
});

await scenario("6. İçerik eki: seçici (Prompt/İstek/Workflow/Hazır ayar/Space, Benimkiler/Kaydettiklerim, yalnız herkese açık notu); seçince küçük önizleme kartı; gönderince attach_type/attach_id", async ({ page, db }) => {
  await composerInput(page).waitFor();
  await extra(page, "content").click();
  const picker = page.locator("[data-comment-content-picker]");
  await picker.waitFor();
  await picker.getByText("yalnızca herkese açık içerikler eklenebilir").waitFor();
  await picker.getByRole("tab", { name: "Benimkiler" }).waitFor();
  await picker.getByRole("tab", { name: "Kaydettiklerim" }).waitFor();
  assert.equal(await picker.locator("[data-comment-content-add]").isDisabled(), true, "nothing picked yet");
  await picker.locator(`[data-comment-content-item='${PUBLIC_PROMPT.id}']`).click();
  await picker.locator("[data-comment-content-add]").click();
  await picker.waitFor({ state: "detached" });
  const draft = section(page).locator("[data-comment-extras] [data-comment-attachment='prompt']");
  await draft.waitFor();
  await draft.getByText("Neon sokak portresi").waitFor();
  assert.equal(await draft.evaluate((el) => el.tagName), "DIV", "the draft is a preview, not a link");
  assert.equal(await sendButton(page).isDisabled(), false);
  await sendButton(page).click();
  const posted = section(page).locator("a[data-comment-attachment='prompt']");
  await posted.waitFor();
  await posted.getByText("Neon sokak portresi").waitFor();
  await posted.getByText("Carol").waitFor();
  assert.match(await posted.getAttribute("href"), new RegExp(`/prompts/local/?\\?id=${PUBLIC_PROMPT.id}`));
  await posted.scrollIntoViewIfNeeded();
  await shot(page, "comment-attachment-desktop");
  const [post] = postsOf(db);
  assert.equal(post.body.attach_type, "prompt");
  assert.equal(post.body.attach_id, PUBLIC_PROMPT.id);
  assert.equal(post.body.media_kind, undefined);
});

await scenario("7. Kaydettiklerim kaynağı: kendi koleksiyonlarındaki herkese açık içerik listelenir ve eklenebilir; İstek/Space türünde bu sekme yoktur", async ({ page }) => {
  await composerInput(page).waitFor();
  await extra(page, "content").click();
  const picker = page.locator("[data-comment-content-picker]");
  await picker.getByRole("tab", { name: "Kaydettiklerim" }).click();
  await picker.locator("[data-comment-content-item='b0000000-0000-4000-8000-0000000000c9']").waitFor();
  await picker.getByText("Başkasının kayıtlı promptu").waitFor();
  await picker.getByRole("tab", { name: "İstek" }).click();
  assert.equal(await picker.getByRole("tab", { name: "Kaydettiklerim" }).count(), 0, "requests cannot be saved");
  await picker.getByRole("tab", { name: "Space" }).click();
  assert.equal(await picker.getByRole("tab", { name: "Kaydettiklerim" }).count(), 0, "spaces cannot be saved");
}, {
  setup: (db, state) => { state.savedRows = [{ created_at: "2026-10-01T10:00:00Z", collections: { owner_id: ME }, prompts: { id: "b0000000-0000-4000-8000-0000000000c9", title: "Başkasının kayıtlı promptu" } }]; },
});

await scenario("8. Kayıtlı yorumlar: ekler SAYFA BAŞINA TEK sorguyla okunur (iki yorum, aynı içerik → 1 istek); okunamayan / sonradan özel yapılan içerik 'Sayfa gizli veya kaldırılmış' kartı olur", async ({ page, state }) => {
  // Liste 3 yorumla kısa açılır; dördüncüsü de dahil TÜM yüklenen yorumların ekleri tek sorguyla okunmuş olmalı.
  await section(page).getByRole("button", { name: /Tümünü gör/ }).click();
  await section(page).locator("a[data-comment-attachment='prompt']").first().waitFor();
  await section(page).locator("[data-comment-attachment-state='hidden']").first().waitFor();
  assert.equal(state.cardQueries.length, 1, `one batched card query, got ${state.cardQueries.length}`);
  assert.equal(await section(page).locator("a[data-comment-attachment='prompt']").count(), 2, "two comments, same public prompt");
  const hidden = section(page).locator("[data-comment-attachment-state='hidden']");
  assert.equal(await hidden.count(), 2, "removed + made-private both hidden");
  await hidden.first().getByText("Sayfa gizli veya kaldırılmış.").waitFor();
  assert.equal(await hidden.locator("a").count(), 0, "hidden cards are not links");
  assert.equal(await section(page).getByText("Sonradan özel yapılan").count(), 0, "a private title never leaks");
}, {
  setup: (db) => {
    const at = (n) => `2026-09-2${n}T10:00:00Z`;
    const base = { prompt_id: ID.prompt, parent_id: null };
    db.comments.push(
      { id: "d0000000-0000-4000-8000-000000000001", ...base, author_id: U.bob.id, body: "", attach_type: "prompt", attach_id: PUBLIC_PROMPT.id, created_at: at(1) },
      { id: "d0000000-0000-4000-8000-000000000002", ...base, author_id: U.dave.id, body: "Bu da güzel", attach_type: "prompt", attach_id: PUBLIC_PROMPT.id, created_at: at(2) },
      { id: "d0000000-0000-4000-8000-000000000003", ...base, author_id: U.amy.id, body: "silinmiş içerik", attach_type: "prompt", attach_id: "b0000000-0000-4000-8000-0000000000ff", created_at: at(3) },
      { id: "d0000000-0000-4000-8000-000000000004", ...base, author_id: U.zed.id, body: "özel içerik", attach_type: "prompt", attach_id: PRIVATE_PROMPT.id, created_at: at(4) },
    );
  },
});

await scenario("9. Yanıt kutusunda da aynı düğmeler: yanıta GIF eklenir, parent_id ile gönderilir; ana kutunun eki karışmaz", async ({ page, db }) => {
  await section(page).getByText("Ana yorum").waitFor();
  await section(page).getByRole("button", { name: "Yanıtla" }).first().click();
  const toolbars = section(page).locator("[data-comment-extras-toolbar]");
  assert.equal(await toolbars.count(), 2, "composer + reply box");
  await toolbars.nth(1).locator("[data-comment-extra='gif']").click();
  await page.locator("[data-gif-id='gif05']").click();
  const replyForm = section(page).locator("form").nth(1);
  await replyForm.locator("[data-comment-extra-preview='gif']").waitFor();
  assert.equal(await section(page).locator("form").first().locator("[data-comment-extra-preview]").count(), 0, "main composer untouched");
  await replyForm.getByRole("button", { name: "Gönder" }).click();
  await page.waitForFunction(() => document.querySelectorAll("#comments [data-comment-media='gif']").length >= 1);
  const [post] = postsOf(db);
  assert.equal(post.body.parent_id, "d0000000-0000-4000-8000-000000000001");
  assert.equal(post.body.media_ref, "gif05");
}, {
  setup: (db) => {
    db.comments.push({ id: "d0000000-0000-4000-8000-000000000001", prompt_id: ID.prompt, parent_id: null, author_id: U.bob.id, body: "Ana yorum", created_at: "2026-09-21T10:00:00Z" });
  },
});

await scenario("10. Ek kaldırma: ✕ GIF'i ve içerik önizlemesini siler, 'Gönder' yeniden kapanır; yazı varsa metinle gönderilebilir", async ({ page }) => {
  await composerInput(page).waitFor();
  await extra(page, "gif").click();
  await page.locator("[data-gif-id='gif02']").click();
  await extra(page, "content").click();
  await page.locator(`[data-comment-content-item='${PUBLIC_PROMPT.id}']`).click();
  await page.locator("[data-comment-content-add]").click();
  await section(page).getByText("Yoruma 1 görsel (fotoğraf ya da GIF) ve 1 içerik eklenebilir.").waitFor();
  assert.equal(await sendButton(page).isDisabled(), false);
  await section(page).getByRole("button", { name: "GIF'i kaldır" }).click();
  await section(page).getByRole("button", { name: "İçeriği kaldır" }).click();
  assert.equal(await section(page).locator("[data-comment-extras]").count(), 0);
  assert.equal(await sendButton(page).isDisabled(), true);
});

await scenario("11. Sunucu 'attachment_not_public' derse kullanıcı dilinde satır içi hata görünür, ek ve yazı KORUNUR (tekrar denenebilir)", async ({ page, state }) => {
  await composerInput(page).waitFor();
  await composerInput(page).fill("Bakın");
  await extra(page, "content").click();
  await page.locator(`[data-comment-content-item='${PUBLIC_PROMPT.id}']`).click();
  await page.locator("[data-comment-content-add]").click();
  state.failNextPost = "attachment_not_public";
  await sendButton(page).click();
  await section(page).getByText("Bu içerik artık herkese açık değil, yoruma eklenemez.").waitFor();
  assert.equal(await composerInput(page).inputValue(), "Bakın");
  await section(page).locator("[data-comment-extras] [data-comment-attachment='prompt']").waitFor();
});

await scenario("12. Dar ekran (390 px): yazma çubuğu + GIF seçici + içerik seçici taşmaz, düğmeler ≥36 px", async ({ page }) => {
  await composerInput(page).waitFor();
  for (const kind of ["photo", "gif", "content"]) {
    const b = await extra(page, kind).boundingBox();
    assert.ok(b.width >= 36 && b.height >= 36, `${kind} button ${b.width}x${b.height}`);
  }
  await extra(page, "gif").click();
  await page.locator("[data-gif-picker] [data-gif-id]").first().waitFor();
  assert.ok(await overflowFree(page), "gif picker fits 390px");
  await shot(page, "gif-picker-phone");
  const frame = await page.locator("[data-gif-picker]").boundingBox();
  assert.ok(frame.width <= 390 && frame.x >= -1, "picker inside the viewport");
  await page.keyboard.press("Escape");
  await extra(page, "content").click();
  await page.locator("[data-comment-content-picker]").waitFor();
  assert.ok(await overflowFree(page), "content picker fits 390px");
  await shot(page, "content-picker-phone");
}, { viewport: PHONE });

await scenario("13. İngilizce: düğme adları, GIF seçici ve içerik seçici metinleri çevrilidir", async ({ page }) => {
  await composerInput(page).waitFor();
  await section(page).getByRole("button", { name: "Add a photo" }).waitFor();
  await section(page).getByRole("button", { name: "Add a GIF" }).click();
  const picker = page.locator("[data-gif-picker]");
  await picker.getByRole("heading", { name: "Add a GIF" }).waitFor();
  await picker.getByText("GIFs come from GIPHY. Tap one to add it.").waitFor();
  await picker.getByRole("button", { name: "Applause" }).waitFor();
  await page.keyboard.press("Escape");
  await section(page).getByRole("button", { name: "Attach content" }).click();
  await page.locator("[data-comment-content-picker]").getByText("Only public content can be attached").waitFor();
}, { lang: "en" });

// ---- Mesajlaşma ----
const openThread = async (page) => { await page.goto(`${BASE}/messages/local?id=${CONV}`); await page.locator("[data-composer-plus]").waitFor(); await page.waitForTimeout(300); };
const seedChat = (db) => db.addConv(CONV, U.bob, { texts: ["merhaba", "selam"] });

await scenario("14. Mesaj: '+' sayfasında GIF satırı; seçilen GIF kendi başına mesaj olur (attachments[{path:'giphy:<kimlik>'}], metin yok); balonda GIF rozetiyle görünür; fotoğraf dosyası yüklenmez", async ({ page, db }) => {
  await openThread(page);
  await page.locator("[data-composer-plus]").click();
  const sheet = page.locator("[data-chat-attach]");
  await sheet.locator("[data-attach-gif]").waitFor();
  await sheet.getByText("GIPHY'de ara ve gönder").waitFor();
  await sheet.locator("[data-attach-gif]").click();
  await page.locator("[data-gif-picker] [data-gif-id='gif07']").click();
  await page.locator("[data-message-gif-badge]").waitFor();
  const sent = db.calls.filter((c) => c.method === "POST" && c.table === "messages");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.attachments, [{ path: "giphy:gif07", width: 100, height: 75, mime: "image/gif" }]);
  assert.ok(!sent[0].body.body, "no text");
  assert.equal(db.calls.filter((c) => c.method === "UPLOAD").length, 0, "no file is uploaded for a GIF");
  assert.equal(db.calls.filter((c) => c.method === "SIGN").length, 0, "a GIF is never signed");
  assert.match(await page.locator("[data-message-gif-badge]").locator("xpath=..").locator("img").getAttribute("src"), /media\/gif07\/200w\.gif$/);
  // Balonda GIF GERÇEKTEN çizilmiş olmalı (rozet/adres yetmez): ölçülebilir bir kutu ve yüklenmiş bir görsel.
  const cell = page.locator("[data-message-gif-badge]").locator("xpath=..");
  await page.waitForFunction(() => { const img = document.querySelector("[data-message-gif-badge]")?.parentElement?.querySelector("img"); return img && img.complete && img.naturalWidth > 0; });
  const box = await cell.boundingBox();
  assert.ok(box && box.width >= 90 && box.height >= 60, `GIF cell is drawn: ${JSON.stringify(box)}`);
  await shot(page, "chat-gif-phone");
}, { page: "none", setup: seedChat });

await scenario("15. Mesaj: yazılmakta olan metin GIF gönderilince silinmez (taslak aynen kalır)", async ({ page }) => {
  await openThread(page);
  await page.getByPlaceholder("Mesaj yaz").fill("sonra gönderirim");
  await page.locator("[data-composer-plus]").click();
  await page.locator("[data-attach-gif]").click();
  await page.locator("[data-gif-picker] [data-gif-id='gif01']").click();
  await page.locator("[data-message-gif-badge]").waitFor();
  assert.equal(await page.getByPlaceholder("Mesaj yaz").inputValue(), "sonra gönderirim");
}, { page: "none", setup: seedChat });

await scenario("16. Mesaj (İngilizce): '+' sayfasındaki GIF satırı ve seçici çevrilidir", async ({ page }) => {
  await openThread(page);
  await page.locator("[data-composer-plus]").click();
  await page.locator("[data-attach-gif]").getByText("Search GIPHY and send").waitFor();
  await page.locator("[data-attach-gif]").click();
  await page.locator("[data-gif-picker]").getByRole("heading", { name: "Add a GIF" }).waitFor();
}, { page: "none", setup: seedChat, lang: "en" });

server.close();
await browser.close();
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
