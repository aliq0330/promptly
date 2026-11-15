// Skill sosyal katmanı (docs/history/390-*) — ağ taklitli. Gerçek Supabase'e KARŞI DENENMEDİ; DB kuralları `supabase/tests/skills-social.sql`.
// Burada İSTEMCİ davranışı sınanır: yayında + herkese açık Skill'de beğeni/yorum/İstatistik, taslakta kapalı notu, tepkinin `skill_id` ile yazılması,
// yorumun `skill_id` ile yazılması, ⋮ menüsünde Şikâyet (yalnız başkasının Skill'inde), listedeki kartta sayaçlar, profildeki "Skill'ler" bölümü.
//
// Çalıştırma:  NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SKILLS_ENABLED=true npx next build --webpack
//              CHROMIUM_PATH=… node tests/messaging-ui/run-skills-social.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4190/promptly";
const server = await serve(4190);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const S_PUB = "d6000000-0000-4000-8000-000000000001"; // Alice'in yayınlanmış Skill'i
const S_DRAFT = "d6000000-0000-4000-8000-000000000002"; // Alice'in taslağı
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const json = (route, body, status = 200, headers = {}) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", ...headers }, body: JSON.stringify(body) });

const skillRow = (id, over = {}) => ({
  id, author_id: U.alice.id, slug: `skill-${id.slice(-1)}`, title: `Skill ${id.slice(-1)}`, summary: "Kısa açıklama burada.", instructions: "# Rol\n\nYardımcı ol.", category: "software", compat: ["claude-code"],
  license: "mit", version: "1.0.0", status: "published", visibility: "public", use_count: 0, like_count: 3, comment_count: 2, save_count: 0,
  created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z", profiles: pubOf(U.alice), ...over,
});

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", me = U.bob } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const state = { skills: [skillRow(S_PUB), skillRow(S_DRAFT, { status: "draft", like_count: 0, comment_count: 0 })], likes: [], comments: [], likeCalls: [], commentCalls: [], saveCalls: [], savedIds: new Set(), mine: null };
  db.extraRoutes = async (ctx) => {
    const { table, q, method } = ctx;
    if (table === "skills" && method === "GET") {
      const id = (q.get("id") ?? "").replace(/^eq\./, "");
      const author = (q.get("author_id") ?? "").replace(/^eq\./, "");
      let list = state.skills.filter((s) => s.author_id === me.id || (s.status === "published" && s.visibility === "public"));
      if (id) list = list.filter((s) => s.id === id);
      if (author) list = list.filter((s) => s.author_id === author);
      return ctx.rows(list);
    }
    if (table === "skill_versions" && method === "GET") return ctx.rows([]);
    if (table === "skill_relations" && method === "GET") return ctx.rows([]);
    return null;
  };
  const context = await browser.newContext({ viewport });
  await installMock(context, db, { signedIn: me.id });
  await context.route(/\/rest\/v1\/reaction_stats/, (route) => json(route, []));
  // Profil menüsündeki Skill sayısı: HEAD + count=exact (ziyaretçiye yalnız yayında + herkese açık).
  await context.route(/\/rest\/v1\/skills\?/, (route) => {
    const req = route.request();
    if (req.method() !== "HEAD") return route.fallback();
    const author = (new URL(req.url()).searchParams.get("author_id") ?? "").replace(/^eq\./, "");
    const visible = state.skills.filter((sk) => sk.author_id === author && (author === me.id || (sk.status === "published" && sk.visibility === "public")));
    return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-range": `*/${visible.length}` }, body: "" });
  });
  await context.route(/\/rest\/v1\/prompt_likes/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.likeCalls.push(body);
      state.mine = body.reaction ?? "love";
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    if (req.method() === "DELETE") {
      state.mine = null;
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    const select = new URL(req.url()).searchParams.get("select") ?? "";
    if (select.includes("profiles")) return json(route, [], 200, { "content-range": "*/0" });
    return json(route, state.mine ? [{ skill_id: S_PUB, reaction: state.mine }] : []);
  });
  await context.route(/\/rest\/v1\/prompt_comments/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.commentCalls.push(body);
      const row = { id: crypto.randomUUID(), body: body.body, parent_id: body.parent_id ?? null, like_count: 0, created_at: "2026-03-05T00:00:00Z", edited_at: null, deleted_at: null, profiles: pubOf(me) };
      state.comments.push(row);
      return json(route, row, 201);
    }
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-range": "*/0" }, body: "" });
    return json(route, state.comments);
  });
  const SYS = "c6000000-0000-4000-8000-000000000001";
  await context.route(/\/rest\/v1\/collections\?/, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const accept = route.request().headers().accept ?? "";
    const row = { id: SYS, name: "Kaydedilenler", visibility: "private", item_count: 0, follower_count: 0, is_default: true, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(me) };
    return json(route, accept.includes("vnd.pgrst.object") ? row : [row]);
  });
  await context.route(/\/rest\/v1\/collection_items/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.saveCalls.push(body);
      state.savedIds.add(body.skill_id);
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    const url = new URL(req.url());
    if (url.searchParams.has("skill_id")) {
      const ids = (url.searchParams.get("skill_id") ?? "").replace(/^(in\.\(|eq\.)|\)$/g, "").split(",");
      return json(route, ids.filter((id) => state.savedIds.has(id)).map((id) => ({ skill_id: id, id: `ci-${id}`, collections: { owner_id: me.id, is_default: true } })));
    }
    return json(route, []);
  });
  await context.route(/\/rest\/v1\/rpc\/creator_insights_skills/, (route) =>
    json(route, [{ skill_id: S_PUB, title: "Skill 1", uses: 4, prev_uses: 2, reactions: 3, prev_reactions: 3, comments: 1, prev_comments: 0, saves: 2, prev_saves: 1 }]),
  );
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
    results.push(["FAIL", `${name}\n      ${String(e.message).split("\n").slice(0, 8).join("\n      ")}`]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/socfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const openDetail = async (page, id = S_PUB) => {
  await page.goto(`${BASE}/skills/local?id=${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
};

await scenario("1. Yayınlanmış Skill: beğeni + yorum sayaçları, İstatistik ve yorum bölümü görünür", async ({ page }) => {
  await openDetail(page);
  const bar = page.locator("[data-detail-actions]");
  await bar.waitFor();
  assert.ok(await bar.locator('button[aria-haspopup="menu"]').first().isVisible(), "tepki düğmesi");
  assert.match(await bar.innerText(), /3/, "beğeni sayısı");
  assert.match(await bar.innerText(), /2/, "yorum sayısı");
  await page.locator("#comments").waitFor();
  assert.equal(await page.locator("[data-skill-social-off]").count(), 0);
});

await scenario("2. Taslak Skill (sahibi): beğeni/yorum yok, 'yayınlanınca açılır' notu", async ({ page }) => {
  await openDetail(page, S_DRAFT);
  await page.locator("[data-skill-social-off]").waitFor();
  assert.equal(await page.locator("#comments").count(), 0);
  assert.equal(await page.locator('[data-detail-actions] button[aria-haspopup="menu"]').count(), 0, "tepki düğmesi yok");
}, { me: U.alice });

await scenario("3. Tepki verince prompt_likes'a skill_id ile yazılır (varsayılan love sütunsuz, seçilen tepki sütunlu)", async ({ page, state }) => {
  await openDetail(page);
  await page.locator('[data-detail-actions] button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menu").getByRole("menuitem", { name: "Ateş" }).click();
  await page.waitForFunction(() => true);
  const end = Date.now() + 4000;
  while (Date.now() < end && state.likeCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.likeCalls.length, 1);
  assert.equal(state.likeCalls[0].skill_id, S_PUB);
  assert.equal(state.likeCalls[0].user_id, U.bob.id);
  assert.equal(state.likeCalls[0].reaction, "fire");
  for (const other of ["prompt_id", "preset_id", "workflow_id", "request_id"]) assert.equal(state.likeCalls[0][other], undefined, `${other} dolu olmamalı`);
});

await scenario("4. Yorum yazınca prompt_comments'a skill_id ile yazılır ve listede görünür", async ({ page, state }) => {
  await openDetail(page);
  await page.locator("#comments").waitFor();
  const input = page.getByPlaceholder("Bir yorum yaz...");
  await input.fill("Çok işime yaradı");
  await input.press("Enter");
  const end = Date.now() + 4000;
  while (Date.now() < end && state.commentCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.commentCalls.length, 1);
  assert.equal(state.commentCalls[0].skill_id, S_PUB);
  assert.equal(state.commentCalls[0].body, "Çok işime yaradı");
  assert.equal(state.commentCalls[0].author_id, U.bob.id);
  await page.getByText("Çok işime yaradı").first().waitFor();
});

await scenario("5. ⋮ menüsünde Şikâyet: başkasının Skill'inde var, kendi Skill'inde yok", async ({ page }) => {
  await openDetail(page);
  const menu = page.locator("[data-skill-menu]");
  await menu.waitFor();
  await menu.getByRole("button").first().click();
  await page.getByRole("menuitem", { name: /Şikayet/i }).click();
  await page.getByRole("dialog").waitFor();
  assert.match(await page.getByRole("dialog").innerText(), /Skill/);
});

await scenario("5b. Sahibi kendi Skill'ini şikâyet edemez (menü çizilmez)", async ({ page }) => {
  await openDetail(page);
  assert.equal(await page.locator("[data-skill-menu]").count(), 0);
}, { me: U.alice });

await scenario("6. Liste kartında beğeni + yorum sayacı görünür", async ({ page }) => {
  await page.goto(`${BASE}/skills`);
  const card = page.locator("article, [data-content-card]").filter({ hasText: "Skill 1" }).first();
  await card.waitFor();
  assert.match(await card.innerText(), /3/);
  assert.match(await card.innerText(), /2/);
});

await scenario("7. Profilde Skill'ler bölümü: ziyaretçi yalnız yayındakini görür", async ({ page }) => {
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.locator("[data-section-menu]").first().click();
  await page.locator("[data-section-option='skills']").click();
  await page.getByText("Skill 1").first().waitFor();
  assert.equal(await page.getByText("Skill 2").count(), 0, "ziyaretçi taslağı görmez");
});

await scenario("7b. Profilde Skill'ler bölümü: sahibi taslağını da görür", async ({ page }) => {
  await page.goto(`${BASE}/profile/real?username=${U.alice.username}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.locator("[data-section-menu]").first().click();
  await page.locator("[data-section-option='skills']").click();
  await page.getByText("Skill 1").first().waitFor();
  await page.getByText("Skill 2").first().waitFor();
}, { me: U.alice });

await scenario("10. Kaydet: detayda tek dokunuşla sistem koleksiyonuna skill_id ile yazılır, simge 'kaydedildi' olur", async ({ page, state }) => {
  await openDetail(page);
  const save = page.locator("[data-detail-actions] button[aria-pressed]").first();
  await save.waitFor();
  assert.equal(await save.getAttribute("aria-pressed"), "false");
  await save.click();
  const end = Date.now() + 4000;
  while (Date.now() < end && state.saveCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.saveCalls.length, 1);
  assert.equal(state.saveCalls[0].skill_id, S_PUB);
  assert.equal(state.saveCalls[0].collection_id, "c6000000-0000-4000-8000-000000000001");
  for (const other of ["prompt_id", "preset_id", "workflow_id", "community_post_id"]) assert.equal(state.saveCalls[0][other], undefined, `${other} boş olmalı`);
  await page.locator('[data-detail-actions] button[aria-pressed="true"]').first().waitFor();
});

await scenario("11. Listedeki kartta Kaydet düğmesi vardır", async ({ page }) => {
  await page.goto(`${BASE}/skills`);
  const card = page.locator("article, [data-content-card]").filter({ hasText: "Skill 1" }).first();
  await card.waitFor();
  assert.ok(await card.locator("button[aria-pressed]").count() >= 1, "kart altbilgisinde kaydet düğmesi");
});

await scenario("12. Yaratıcı paneli: yayınlanmış Skill'i olan yazara Skill sayıları bölümü çizilir", async ({ page }) => {
  await page.goto(`${BASE}/insights`);
  const section = page.locator("[data-insights-skills]");
  await section.waitFor();
  assert.match(await section.innerText(), /Skill 1/);
  assert.ok(await section.locator("[data-insights-skill-row]").count() === 1);
}, { me: U.alice });

await scenario("8. İngilizce: Skill detayında yorum başlığı ve rozetler çevrilir", async ({ page }) => {
  await openDetail(page);
  await page.locator("#comments").waitFor();
  assert.match(await page.locator("#comments").innerText(), /Comments/i);
}, { lang: "en" });

await scenario("9. Telefonda detay taşmaz", async ({ page }) => {
  await openDetail(page);
  await page.locator("#comments").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
}, { viewport: { width: 390, height: 844 } });

await browser.close();
server.close();
let failed = 0;
for (const [status, name] of results) {
  if (status !== "PASS") failed += 1;
  console.log(`${status}  ${name}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
