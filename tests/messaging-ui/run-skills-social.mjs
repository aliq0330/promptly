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
const S_PUB2 = "d6000000-0000-4000-8000-000000000003"; // Alice'in ikinci yayınlanmış Skill'i (tasarım)
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
  const state = { skills: [skillRow(S_PUB), skillRow(S_DRAFT, { status: "draft", like_count: 0, comment_count: 0 }), skillRow(S_PUB2, { category: "design", title: "Logo Skill", slug: "skill-3" })], likes: [], comments: [], likeCalls: [], commentCalls: [], saveCalls: [], feedCalls: [], quoteCalls: [], pinCalls: [], pin: null, worksCalls: [], toolCalls: [], versionCalls: [], works: { yes: 0, no: 0, my: null, can: true }, savedIds: new Set(), mine: null };
  db.extraRoutes = async (ctx) => {
    const { table, q, method } = ctx;
    if (table === "skills" && method === "GET") {
      const idParam = q.get("id") ?? "";
      const ids = idParam.startsWith("in.(") ? idParam.slice(4, -1).split(",") : idParam ? [idParam.replace(/^eq\./, "")] : [];
      const author = (q.get("author_id") ?? "").replace(/^eq\./, "");
      let list = state.skills.filter((s) => s.author_id === me.id || (s.status === "published" && s.visibility === "public"));
      if (ids.length) list = list.filter((s) => ids.includes(s.id));
      if (author) list = list.filter((s) => s.author_id === author);
      return ctx.rows(list);
    }
    if (table === "skill_versions" && method === "GET") {
      const sha = "a".repeat(64);
      return ctx.rows(
        (q.get("skill_id") ?? "") === `eq.${S_PUB}`
          ? [{ id: "v-1", skill_id: S_PUB, version: "1.0.0", changelog: "", package_path: `${S_PUB}/packages/1.0.0-${sha.slice(0, 16)}.zip`, package_sha256: sha, package_size: 1024, file_count: 1, manifest: { schema: 1, files: [{ path: "scripts/install.sh", kind: "script", size: 20, sha256: "b".repeat(64), script: true, risks: ["pipe_to_shell", "network"] }] }, deprecated_at: null, created_at: "2026-03-02T00:00:00Z" }]
          : [],
      );
    }
    if (table === "skill_relations" && method === "GET") return ctx.rows([]);
    if (table === "skill_links" && method === "GET") return ctx.rows((q.get("skill_id") ?? "") === `eq.${S_PUB}` ? [{ id: "l-1", linked_skill_id: S_PUB2, position: 0 }] : []);
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
  await context.route(/\/rest\/v1\/rpc\/skill_feed_page/, (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    state.feedCalls.push(body);
    const list = state.skills.filter((s) => s.status === "published" && s.visibility === "public" && (!body.p_category || s.category === body.p_category));
    const q = (body.p_query ?? "").toLowerCase();
    const rows = list.filter((s) => !q || s.title.toLowerCase().includes(q)).map((s) => ({ id: s.id, created_at: s.created_at, sort_rank: 0, match_source: q ? "title" : null }));
    return json(route, rows);
  });
  await context.route(/\/rest\/v1\/rpc\/create_quote/, (route) => {
    state.quoteCalls.push(JSON.parse(route.request().postData() || "{}"));
    return json(route, "a0000000-0000-4000-8000-0000000000b4");
  });
  await context.route(/\/rest\/v1\/rpc\/quote_feed_cards/, (route) =>
    json(route, [{ id: "a0000000-0000-4000-8000-0000000000b4", author_id: U.carol.id, author_username: "carol", author_display_name: "Carol", author_avatar_url: null, content_type: "skill", target_id: S_PUB, note: "Skill alıntı notu", like_count: 0, comment_count: 0, created_at: "2026-11-15T10:00:00Z", is_liked: false }]),
  );
  await context.route(/\/rest\/v1\/rpc\/related_skills/, (route) => json(route, [{ id: S_PUB2, score: 5 }]));
  await context.route(/\/rest\/v1\/rpc\/skills_for_content/, (route) => json(route, [{ id: S_PUB }]));
  await context.route(/\/rest\/v1\/skill_pins/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.pinCalls.push({ op: "upsert", body });
      state.pin = body.version;
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    if (req.method() === "DELETE") {
      state.pinCalls.push({ op: "delete" });
      state.pin = null;
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
    }
    return json(route, state.pin ? { version: state.pin } : null);
  });
  await context.route(/\/rest\/v1\/rpc\/skill_works_state/, (route) => json(route, [{ yes_count: state.works.yes, no_count: state.works.no, my_vote: state.works.my, can_vote: state.works.can }]));
  await context.route(/\/rest\/v1\/rpc\/skill_works_by_version/, (route) => json(route, [{ version: "1.0.0", yes_count: 3, no_count: 0 }]));
  await context.route(/\/rest\/v1\/rpc\/set_skill_works_version/, (route) => {
    state.versionCalls.push(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
  });
  await context.route(/\/rest\/v1\/rpc\/skill_works_by_tool/, (route) => json(route, [{ tool: "cursor", yes_count: 2, no_count: 1 }]));
  await context.route(/\/rest\/v1\/rpc\/set_skill_works_tool/, (route) => {
    state.toolCalls.push(JSON.parse(route.request().postData() || "{}"));
    return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" }, body: "" });
  });
  await context.route(/\/rest\/v1\/rpc\/set_skill_works(?!_)/, (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    state.worksCalls.push(body);
    const w = state.works;
    if (w.my === true) w.yes -= 1;
    if (w.my === false) w.no -= 1;
    w.my = body.p_works;
    if (body.p_works === true) w.yes += 1;
    if (body.p_works === false) w.no += 1;
    return json(route, [{ yes_count: w.yes, no_count: w.no, my_vote: w.my }]);
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
  // Detay bölümleri (oy, sürüm/araç toplamları, bağlar, kalite) ayrı isteklerle gelir ve düzen yer değiştirir: eylem çubuğu "kararlı" olana kadar bekle.
  await page.waitForLoadState("networkidle").catch(() => undefined);
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
  assert.equal(await page.locator('[data-detail-actions] button[aria-haspopup="menu"]:not([data-skill-download-menu] *)').count(), 0, "tepki düğmesi yok");
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

await scenario("13. Keşfet → Skill'ler: kartlar sunucudan gelir; uzmanlık alanı çipi ve arama RPC parametresine gider, eşleşme kaynağı yazar", async ({ page, state }) => {
  await page.goto(`${BASE}/discover`);
  await page.locator("[data-section-menu]").first().click();
  await page.locator("[data-section-option='skills']").click();
  const root = page.locator("[data-skill-discover]");
  await root.waitFor();
  await root.getByText("Skill 1").first().waitFor();
  await root.locator("[data-skill-category='design']").click();
  // "Logo Skill" ilk (süzgeçsiz) listede de var: süzgeçli yanıt gelene kadar bekle, yoksa yarış olur.
  await page.waitForFunction(() => !document.querySelector("[data-skill-discover]")?.textContent?.includes("Skill 1"), null, { timeout: 8000 });
  await root.getByText("Logo Skill").first().waitFor();
  assert.equal(state.feedCalls.at(-1).p_category, "design");
  assert.equal(await root.getByText("Skill 1").count(), 0, "süzgeç dışı kart kalkar");
  await root.locator("[data-skill-category='all']").click();
  await root.locator("[data-skill-search]").fill("logo");
  await root.locator("[data-skill-match='title']").first().waitFor();
  assert.equal(state.feedCalls.at(-1).p_query, "logo");
  await root.locator("[data-skill-sort='popular']").click();
  await page.waitForFunction(() => true);
  const end = Date.now() + 3000;
  while (Date.now() < end && state.feedCalls.at(-1).p_sort !== "popular") await new Promise((r) => setTimeout(r, 100));
  assert.equal(state.feedCalls.at(-1).p_sort, "popular");
});

await scenario("14. Skill detayında 'Benzer Skill'ler' yan bölümü çizilir", async ({ page }) => {
  await openDetail(page);
  const block = page.locator("#skill-similar-title");
  await block.waitFor();
  await page.getByText("Logo Skill").first().waitFor();
});

await scenario("15. Sürüm sabitleme: okuyucu bir sürümü sabitler (upsert skill_pins), rozet çıkar, tekrar basınca kaldırılır; sahibi sabitleyemez", async ({ page, state }) => {
  await openDetail(page);
  const btn = page.locator("[data-skill-pin]").first();
  await btn.waitFor();
  await btn.click();
  await page.locator("[data-skill-pinned]").waitFor();
  assert.deepEqual(state.pinCalls[0], { op: "upsert", body: { skill_id: S_PUB, user_id: U.bob.id, version: "1.0.0" } });
  await btn.click();
  await page.waitForFunction(() => !document.querySelector("[data-skill-pinned]"));
  assert.equal(state.pinCalls[1].op, "delete");
});

await scenario("15b. Sahibi kendi Skill'ini sabitleyemez (düğme yok)", async ({ page }) => {
  await openDetail(page);
  await page.locator("#skill-versions").waitFor();
  assert.equal(await page.locator("[data-skill-pin]").count(), 0);
}, { me: U.alice });

await scenario("16. İndirme menüsü: SKILL.md indir · kopyala · özet (JSON) indir seçenekleri", async ({ page }) => {
  await openDetail(page);
  await page.locator("[data-skill-download-menu] button").first().click();
  const items = await page.getByRole("menuitem").allInnerTexts();
  assert.ok(items.some((x) => /SKILL\.md'yi kopyala/.test(x)), items.join("|"));
  assert.ok(items.some((x) => /JSON/.test(x)));
  assert.ok(items.some((x) => /SKILL\.md/.test(x)));
});

await scenario("17. Çalıştı mı?: indirmiş okuyucu oy verir (set_skill_works), sayı güncellenir; tekrar basınca geri alır", async ({ page, state }) => {
  await openDetail(page);
  const yes = page.locator("[data-skill-works-yes]");
  await yes.waitFor();
  await yes.click();
  const end = Date.now() + 4000;
  while (Date.now() < end && state.worksCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(state.worksCalls[0], { p_skill_id: S_PUB, p_works: true });
  assert.equal(await yes.getAttribute("aria-pressed"), "true");
  await yes.click();
  const end2 = Date.now() + 4000;
  while (Date.now() < end2 && state.worksCalls.length < 2) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(state.worksCalls[1], { p_skill_id: S_PUB, p_works: null });
});

await scenario("17b. Çalıştı mı?: indirmemiş okuyucuya oy düğmesi yerine 'önce indir' notu çıkar; yazar hiçbir şey görmez", async ({ page, state }) => {
  state.works.can = false;
  await openDetail(page);
  await page.locator("[data-skill-works]").waitFor();
  assert.equal(await page.locator("[data-skill-works-yes]").count(), 0);
  assert.match(await page.locator("[data-skill-works]").innerText(), /önce indir/i);
});

await scenario("17c. Çalıştı mı?: sahibine ve oysuz Skill'de blok çizilmez", async ({ page, state }) => {
  state.works.can = false;
  await openDetail(page);
  await page.locator("#comments").waitFor();
  assert.equal(await page.locator("[data-skill-works]").count(), 0);
}, { me: U.alice });

await scenario("18. Alıntıla: Skill detayında Paylaş → Alıntıla; create_quote('skill', id, not) çağrılır, topluluk seçici yoktur", async ({ page, state }) => {
  await openDetail(page);
  await page.locator("[data-detail-actions]").getByRole("button", { name: "Paylaş" }).first().click();
  const modal = page.locator('[data-share-modal="skill"]');
  await modal.waitFor();
  await modal.locator("[data-quote-section] button[aria-expanded]").click();
  const quote = page.locator("[data-quote-popup]");
  await quote.locator("[data-quote-destination=feed]").waitFor();
  assert.equal(await quote.getByText("Topluluklarda alıntıla").count(), 0, "Skill topluluğa duyurulmaz");
  await quote.locator("[data-quote-note-input]").fill("Denemeye değer");
  await quote.locator("[data-quote-submit]").click();
  await quote.locator("[data-quote-open]").waitFor();
  assert.deepEqual(state.quoteCalls[0], { p_content_type: "skill", p_content_id: S_PUB, p_note: "Denemeye değer" });
});

await scenario("19. Alıntı sayfası: Skill alıntısı not + Skill kartı + 'Orijinal içeriği aç' gösterir", async ({ page }) => {
  await page.goto(`${BASE}/quotes/local?id=a0000000-0000-4000-8000-0000000000b4`);
  const card = page.locator("[data-quote-skill]");
  await card.waitFor();
  assert.match(await page.locator("[data-quote-note]").first().innerText(), /Skill alıntı notu/);
  assert.match((await page.locator("[data-open-original]").getAttribute("href")) ?? "", new RegExp(`/skills/local/?\\?id=${S_PUB}`));
});

await scenario("20. Kalite göstergeleri: detayda 7 ölçüt + 'x / 7 ölçüt tamam' çizilir; puan/onay iddiası yoktur", async ({ page }) => {
  await openDetail(page);
  const block = page.locator("[data-skill-quality]");
  await block.waitFor();
  assert.equal(await block.locator("[data-quality-check]").count(), 7);
  assert.match(await block.locator("[data-skill-quality-score]").innerText(), /\d+ \/ 7 ölçüt tamam/);
  assert.match(await block.innerText(), /puan ya da güvenlik onayı değildir/);
});

await scenario("21. Mesajla paylaş: Skill'in Paylaş penceresinde 'Promptly'de mesaj olarak gönder' bağlantısı shareSkillId taşır", async ({ page }) => {
  await openDetail(page);
  await page.locator("[data-detail-actions]").getByRole("button", { name: "Paylaş" }).first().click();
  const modal = page.locator('[data-share-modal="skill"]');
  await modal.waitFor();
  const link = modal.locator('a[href*="shareSkillId="]');
  await link.waitFor();
  assert.match((await link.getAttribute("href")) ?? "", new RegExp(`/messages/?\\?shareSkillId=${S_PUB}`));
});

await scenario("22. Ana Sayfa: Filtre penceresinde 'Skill'ler' çipi; seçilince Skill listesi açılır", async ({ page }) => {
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: /Filtre/ }).first().click();
  await page.getByText("Skill'ler", { exact: true }).click();
  await page.locator("[data-skill-discover]").waitFor();
  await page.locator("[data-skill-discover]").getByText("Skill 1").first().waitFor();
});

await scenario("23. Detay: betik risk rozetleri (otomatik tarama notu), birlikte kullanılan Skill kartı ve araç başına 'çalıştı' toplamı", async ({ page }) => {
  await openDetail(page);
  const scan = page.locator("[data-skill-scan]");
  await scan.waitFor();
  assert.match(await scan.innerText(), /kesin değildir/);
  await page.locator('[data-skill-risk="pipe_to_shell"]').waitFor();
  await page.locator('[data-skill-risk="network"]').waitFor();
  const linked = page.locator("[data-skill-linked]");
  await linked.waitFor();
  assert.match(await linked.innerText(), /Logo Skill/);
  const row = page.locator('[data-skill-works-tool-row="cursor"]');
  await row.waitFor();
  assert.match(await row.innerText(), /Cursor.*2 çalıştı · 1 çalışmadı/);
});

await scenario("24. Oy sonrası araç etiketi: 'Hangi araçta denedin?' Cursor seçilince set_skill_works_tool çağrılır; tekrar basınca etiketi kaldırır", async ({ page, state }) => {
  await openDetail(page);
  await page.locator("[data-skill-works-yes]").click();
  const picker = page.locator("[data-skill-works-tool-picker]");
  await picker.waitFor();
  await picker.locator('[data-skill-works-tool="cursor"]').click();
  const end = Date.now() + 4000;
  while (Date.now() < end && state.toolCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(state.toolCalls[0], { p_skill_id: S_PUB, p_tool: "cursor" });
  await picker.locator('[data-skill-works-tool="cursor"]').click();
  const end2 = Date.now() + 4000;
  while (Date.now() < end2 && state.toolCalls.length < 2) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(state.toolCalls[1], { p_skill_id: S_PUB, p_tool: null });
});

await scenario("25. Genel arama: metin aramasında 'Skill'ler' grubu skill_feed_page'den gelir", async ({ page, state }) => {
  await page.goto(`${BASE}/search?q=logo`);
  const group = page.locator("[data-search-skills]");
  await group.waitFor();
  assert.match(await group.innerText(), /Logo Skill/);
  assert.ok(state.feedCalls.some((call) => call.p_query === "logo"));
});

await scenario("26. Oy sonrası sürüm etiketi: 'Hangi sürümde denedin?' v1.0.0 seçilince set_skill_works_version çağrılır; sürüm başına toplam görünür", async ({ page, state }) => {
  await openDetail(page);
  await page.locator('[data-skill-works-version-row="1.0.0"]').waitFor();
  await page.locator("[data-skill-works-yes]").click();
  const picker = page.locator("[data-skill-works-version-picker]");
  await picker.waitFor();
  await picker.locator('[data-skill-works-version="1.0.0"]').click();
  const end = Date.now() + 4000;
  while (Date.now() < end && state.versionCalls.length === 0) await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(state.versionCalls[0], { p_skill_id: S_PUB, p_version: "1.0.0" });
});

await scenario("27. İlişki Haritası: Skill merkezliyken harita açılır ve birlikte kullanılan Skill düğümü görünür", async ({ page }) => {
  await page.goto(`${BASE}/relations?type=skill&id=${S_PUB}`);
  await page.getByText("Skill 1").first().waitFor();
  await page.getByText("Logo Skill").first().waitFor();
});

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
