// Kart sanatları (docs/history/479-*): İstek (yanıt küçük resimleri + "+" kutusu), Workflow (adım düğümleri + oklar), Skill (paket kutusu),
// Ayar paketi (parametre kutusu). Ağ taklitli; gerçek Supabase'e / cihaza KARŞI DENENMEDİ.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";
import { svg } from "./detail-fixtures.mjs";

const BASE = "http://localhost:4320/promptly";
const server = await serve(4320);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";
const SHOTS = process.env.SHOTS ?? "";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const author = (u) => ({ ...pubOf(u), bio: "", website: null, interests: [] });
const ID = { request: "a1000000-0000-4000-8000-000000000002", workflow: "a1000000-0000-4000-8000-000000000003", preset: "a1000000-0000-4000-8000-000000000004", skill: "a1000000-0000-4000-8000-000000000005" };
const P = (i) => `a2000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
const created = "2026-11-20T10:00:00Z";

const rowsByTable = () => ({
  prompt_requests: {
    id: ID.request, title: "Retro-fütüristik sokak posteri", description: "Neon harfli, yağmurlu bir şehir akşamı posteri istiyorum.", creative_direction: "Blade Runner estetiği", preferred_tool: null, tools: [], content_type: "image",
    category: null, subcategory: null, reference_image_url: svg("#1b2a49", "#e86a3c", 1200, 800), reference_image_width: 1200, reference_image_height: 800, status: "open", selected_response_prompt_id: null,
    response_count: 3, like_count: 5, comment_count: 1, created_at: created, deleted_at: null, is_draft: false, visibility: "public", community_id: null, profiles: author(U.carol), prompt_request_tags: [], prompt_request_media: [],
  },
  workflows: {
    id: ID.workflow, creator_id: U.carol.id, title: "Ürün fotoğrafından kampanya görseli", description: "Üç adımlı akış.", cover_url: null, content_types: ["image", "text"], category: null, subcategory: null, tools: [], status: "published",
    visibility: "public", community_id: null, like_count: 9, save_count: 2, comment_count: 1, created_at: created, updated_at: created, profiles: author(U.carol), workflow_steps: [{ count: 3 }], workflow_tags: [], workflow_media: [],
  },
  presets: {
    id: ID.preset, creator_id: U.carol.id, title: "Sinematik portre ayarı", description: "Sıcak tonlama için hazır parametre seti.", cover_url: svg("#7a3e2e", "#f2d6b3", 1200, 675), content_type: "image", category: null, subcategory: null,
    tools: [], selection: { light_intensity: 70, detail_level: 40, accent_color: "#e86a3c" }, status: "published", visibility: "public", community_id: null, like_count: 6, comment_count: 1, save_count: 1, created_at: created, updated_at: created, profiles: author(U.carol), preset_tags: [],
  },
  skills: {
    id: ID.skill, author_id: U.carol.id, slug: "kod-inceleme", title: "Kod inceleme", summary: "Değişiklikleri satır satır gözden geçirir.", instructions: "", category: "software", compat: ["claude-code"], license: "mit", version: "1.2.0",
    status: "published", visibility: "public", use_count: 0, like_count: 3, comment_count: 2, save_count: 0, created_at: created, updated_at: created, profiles: pubOf(U.carol),
  },
});

async function scenario(name, fn, { viewport = { width: 1280, height: 1000 }, lang = "tr", withData = true } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const tables = rowsByTable();
  const state = { thumbCalls: 0, stepCalls: 0, versionCalls: 0 };
  const items = [["request", ID.request], ["workflow", ID.workflow], ["preset", ID.preset], ["skill", ID.skill]].map(([kind, id], i) => ({ kind, id, created_at: new Date(Date.now() - i * 3600_000).toISOString(), sort_rank: 10 - i }));
  db.rpc.feed_page = () => ({ body: items });
  db.rpc.for_you_page = () => ({ body: items.map((it, i) => ({ ...it, sort_rank: 100 - i, reason_kind: "popular", reason_ref: null })) });
  db.rpc.trending_tags = () => ({ body: [] });
  db.extraRoutes = async (ctx) => {
    const { table, q, method } = ctx;
    if (method !== "GET") return null;
    const ids = (q.get("id") ?? "").match(/[0-9a-f-]{36}/g) ?? [];
    const byId = { prompt_requests: ID.request, workflows: ID.workflow, presets: ID.preset, skills: ID.skill };
    if (byId[table] && ids.includes(byId[table])) return ctx.rows([tables[table]]);
    if (table === "prompts" && (q.get("select") ?? "").startsWith("request_id")) {
      state.thumbCalls += 1;
      return ctx.rows(withData ? [0, 1, 2].map((i) => ({ request_id: ID.request, created_at: created, prompt_media: [{ url: svg(["#6d5bd0", "#2a6f6a", "#ab8d61"][i], "#fff", 400, 400), position: 0 }] })) : []);
    }
    if (table === "workflow_steps" && (q.get("select") ?? "").startsWith("workflow_id")) {
      state.stepCalls += 1;
      return ctx.rows(withData ? [1, 2, 3].map((n) => ({ workflow_id: ID.workflow, position: n, title: `Adım ${n}`, prompt_id: P(n) })) : []);
    }
    if (table === "prompts" && (q.get("select") ?? "").startsWith("id,prompt_media")) {
      return ctx.rows([1, 2, 3].map((n) => ({ id: P(n), prompt_media: [{ url: svg(["#76592e", "#2a6f6a", "#1b2a49"][n - 1], "#e8c27a", 400, 300), position: 0 }] })));
    }
    if (table === "skill_versions" && (q.get("select") ?? "").startsWith("skill_id,version")) {
      state.versionCalls += 1;
      return ctx.rows(withData ? [{ skill_id: ID.skill, version: "1.2.0", manifest: { files: [{ path: "SKILL.md", script: false }, { path: "scripts/review.py", script: true }, { path: "references/style.md", script: false }] } }, { skill_id: ID.skill, version: "1.0.0", manifest: { files: [] } }] : []);
    }
    return null;
  };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { signedIn: U.bob.id });
  await context.route(/\/rest\/v1\/reaction_stats/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
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
    await fn({ page, state });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/art-fail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const card = (page, n) => page.locator("main article:has(a[data-card-link])").nth(n);

await scenario("1. İstek: yanıt küçük resimleri + kesikli '+' kutusu; ŞİMDİ durum çipi sol altta", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  const art = card(page, 0).locator("[data-card-media]");
  await art.waitFor();
  const thumbs = art.locator("[data-request-thumbs]");
  await thumbs.locator("img").first().waitFor();
  assert.equal(await thumbs.locator("img").count(), 3, "üç yanıt resmi");
  assert.ok(await art.locator("[data-request-chip]").isVisible(), "durum çipi görsel üstünde");
  const chip = await art.locator("[data-request-chip]").boundingBox();
  const ts = await thumbs.boundingBox();
  assert.ok(chip.x + chip.width < ts.x, "çip solda, resimler sağda");
  assert.ok(state.thumbCalls >= 1 && state.thumbCalls <= 2, `tek toplu istek (${state.thumbCalls})`);
  await shot(page, "art-all");
});

await scenario("2. Workflow: adım düğümleri numaralı, aralarında oklar", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const art = card(page, 1).locator("[data-card-media]");
  await art.waitFor();
  await art.locator("[data-workflow-node]").first().waitFor();
  assert.equal(await art.locator("[data-workflow-node]").count(), 3, "üç düğüm");
  assert.equal(await art.locator("svg path").count(), 2, "iki ok");
  assert.match(await art.innerText(), /1[\s\S]*Adım 1[\s\S]*2[\s\S]*Adım 2[\s\S]*3[\s\S]*Adım 3/, "numara + etiket");
  const boxes = await art.locator("[data-workflow-node]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const frame = await art.boundingBox();
  for (const b of boxes) assert.ok(b.left >= frame.x - 1 && b.right <= frame.x + frame.width + 1 && b.bottom <= frame.y + frame.height + 1, "düğüm çerçevenin içinde");
});

await scenario("3. Ayar paketi: kapak üstünde GERÇEK değerli çubuklar + seçilen renk (uydurma 'önce/sonra' yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const art = card(page, 2).locator("[data-card-media]");
  await art.waitFor();
  const box = art.locator("[data-preset-params]");
  await box.waitFor();
  const widths = await box.locator("[data-preset-bar] span.bg-primary").evaluateAll((els) => els.map((e) => e.style.width));
  assert.deepEqual(widths, ["70%", "40%"], "çubuklar slider değerine göre dolu");
  const swatch = await box.locator("[data-preset-swatches] span").first().evaluate((e) => e.style.backgroundColor);
  assert.equal(swatch, "rgb(232, 106, 60)", "seçilen gerçek renk");
  assert.equal(await art.locator("input[type=range]").count(), 0, "önce/sonra kaydırıcısı yok (önce görseli yok)");
  await shot(page, "art-preset");
});

await scenario("4. Skill: SKILL.md başlığı + sürüm rozeti + dosya satırları (en yeni sürüm)", async ({ page, state }) => {
  await page.goto(`${BASE}/`);
  const box = card(page, 3).locator("[data-skill-package]");
  await box.waitFor();
  const text = await box.innerText();
  assert.match(text, /SKILL\.md/);
  assert.match(text, /v1\.2\.0/, "en yeni sürüm");
  assert.match(text, /scripts\/review\.py/);
  assert.match(text, /references\/style\.md/);
  assert.ok(state.versionCalls >= 1);
});

await scenario("5. Veri yoksa kartlar eski sanatlarıyla kalır (kırık/boş kutu yok)", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await card(page, 3).waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.locator("[data-skill-package], [data-workflow-node]").count(), 0, "veri yok → ek çizim yok");
  assert.equal(await page.locator("[data-request-thumbs]").count(), 1, "istek açıksa '+' kutusu yine var");
  assert.equal(await page.locator("[data-request-thumbs] img").count(), 0, "yanıt resmi yok");
}, { withData: false });

await scenario("6. Telefon: sanatlar taşmaz", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await card(page, 1).locator("[data-workflow-node]").first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), true, "yatay taşma yok");
  await shot(page, "art-phone");
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status === "FAIL") failed += 1;
  console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
