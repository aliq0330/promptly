// Skill veri modeli ve gelişmiş editör (docs/history/389-*) — ağ taklitli. Gerçek Supabase'e / Storage'a / Edge Function'a KARŞI DENENMEDİ;
// DB tarafı `supabase/tests/skills-package.sql`, paket kuralları `src/lib/skills/*.test.ts`. Burada İSTEMCİ davranışı sınanır: dosya yükleme (yol/içerik
// ön kontrolü, ilerleme satırı, Storage'a yazılan baytlar), tam ekran düzenleyici, güvenli Markdown, sürüm yayını (aynı client_token ile yeniden deneme,
// uyarı onayı), detay sayfasında sürümler/ZIP/dosya listesi, ZIP içe aktarma.
//
// Çalıştırma:  NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy NEXT_PUBLIC_SKILLS_ENABLED=true npm run build
//              CHROMIUM_PATH=… node tests/messaging-ui/run-skills-package.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { zipSync } from "fflate";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4189/promptly";
const server = await serve(4189);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const ALICE = U.alice.id;
const S_PUB = "d5000000-0000-4000-8000-000000000001"; // Alice'in yayınlanmış, sürümlü, betikli Skill'i
const S_DRAFT = "d5000000-0000-4000-8000-000000000002"; // Alice'in dosyalı taslağı
const S_BOB = "d5000000-0000-4000-8000-000000000003"; // Bob'un yayınlanmış Skill'i (Alice okuyucu)
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const sha = "a".repeat(64);

const enc = (text) => Buffer.from(text, "utf8");

function skillRow(id, author, over = {}) {
  return {
    id, author_id: author.id, slug: `skill-${id.slice(-1)}`, title: `Skill ${id.slice(-1)}`, summary: "Kısa açıklama burada.", instructions: "# Rol\n\nYardımcı ol.", category: "software", compat: ["claude-code"],
    license: "mit", version: "1.0.0", status: "published", visibility: "public", use_count: 0, like_count: 0, comment_count: 0, save_count: 0,
    created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z", ...over,
  };
}
const fileRow = (skillId, path, size = 20, over = {}) => ({
  id: `f-${skillId.slice(-1)}-${path.replace(/\W/g, "")}`, skill_id: skillId, path, kind: path.startsWith("rules/") ? "rule" : path.startsWith("scripts/") ? "script" : path.startsWith("references/") ? "reference" : "other",
  size, sha256: sha, storage_path: `${skillId}/draft/${path.replace(/\W/g, "")}.md`, is_script: /\.(sh|py|js|ps1|bat)$/.test(path), updated_at: "2026-03-01T00:00:00Z", ...over,
});
const versionRow = (skillId, version, over = {}) => ({
  id: `v-${skillId.slice(-1)}-${version}`, skill_id: skillId, version, changelog: version === "1.0.0" ? "" : "Kurallar eklendi", package_path: `${skillId}/packages/${version}-${sha.slice(0, 16)}.zip`, package_sha256: sha, package_size: 2048,
  file_count: 2, manifest: { schema: 1, name: "x", version, license: "mit", files: [{ path: "rules/style.md", kind: "rule", size: 20, sha256: sha, script: false }, { path: "scripts/lint.sh", kind: "script", size: 40, sha256: sha, script: true }] },
  deprecated_at: null, created_at: "2026-03-02T00:00:00Z", ...over,
});

/** Skill dünyası: `skills`, `skill_files`, `skill_versions`, `skill_relations` uçları + Storage + Edge Function taklidi. */
function withSkills(db, { me = ALICE } = {}) {
  const world = {
    skills: [
      skillRow(S_PUB, U.alice, { instructions: "# Başlık\n\n<img src=x onerror=\"window.__xss=1\">\n\n[tıkla](javascript:window.__xss=2) ve [güvenli](https://example.com/ok)\n\n**kalın** `kod`\n\n- bir\n- iki", version: "1.1.0" }),
      skillRow(S_DRAFT, U.alice, { status: "draft", version: "1.0.0" }),
      skillRow(S_BOB, U.bob),
    ],
    files: [fileRow(S_DRAFT, "rules/style.md", 20), fileRow(S_DRAFT, "scripts/run.sh", 40)],
    versions: [versionRow(S_PUB, "1.0.0"), versionRow(S_PUB, "1.1.0"), versionRow(S_BOB, "1.0.0")],
    relations: [],
    storage: new Map(), // "skill-files/<yol>" → Buffer
    uploads: [],
    fnCalls: [],
    fnQueue: [],
    skillWrites: [],
    signGets: [],
    signPosts: [],
  };
  world.storage.set(`skill-files/${S_DRAFT}/draft/rulesstylemd.md`, enc("# Stil\n\nKüçük fonksiyonlar yaz."));
  db.skillsWorld = world;

  db.extraRoutes = async (ctx) => {
    const { table, q, method, body } = ctx;
    const eq = (name) => (q.get(name) ?? "").replace(/^eq\./, "");
    const owner = (id) => world.skills.find((s) => s.id === id)?.author_id === me;

    if (table === "skills") {
      if (method === "GET") {
        let list = world.skills.filter((s) => s.author_id === me || (s.status === "published" && s.visibility === "public"));
        if (q.get("id")) list = list.filter((s) => `eq.${s.id}` === q.get("id"));
        return ctx.rows(list.map((s) => ({ ...s, profiles: pubOf(Object.values(U).find((u) => u.id === s.author_id)) })));
      }
      if (method === "POST") {
        const row = skillRow(body.id ?? crypto.randomUUID(), U.alice, { ...body });
        world.skills.push(row);
        world.skillWrites.push({ op: "insert", body });
        return ctx.json(201, null);
      }
      if (method === "PATCH") {
        const row = world.skills.find((s) => `eq.${s.id}` === q.get("id"));
        if (!row || row.author_id !== me) return ctx.rows([]);
        Object.assign(row, body);
        world.skillWrites.push({ op: "update", body });
        return ctx.rows([{ id: row.id }]);
      }
      if (method === "DELETE") return ctx.json(200, []);
    }
    if (table === "skill_versions" && method === "GET") {
      const id = eq("skill_id");
      return ctx.rows(world.versions.filter((v) => v.skill_id === id));
    }
    if (table === "skill_files") {
      if (method === "GET") return ctx.rows(world.files.filter((f) => f.skill_id === eq("skill_id") && owner(f.skill_id)));
      if (method === "POST") {
        const row = { ...body, updated_at: "2026-03-05T00:00:00Z" };
        world.files.push(row);
        return ctx.rows([row]);
      }
      if (method === "PATCH") {
        const row = world.files.find((f) => `eq.${f.id}` === q.get("id"));
        if (!row) return ctx.rows([]);
        Object.assign(row, body);
        return ctx.rows([row]);
      }
      if (method === "DELETE") {
        const row = world.files.find((f) => `eq.${f.id}` === q.get("id"));
        world.files = world.files.filter((f) => f !== row);
        return ctx.rows(row ? [{ id: row.id }] : []);
      }
    }
    if (table === "skill_relations") {
      if (method === "GET") return ctx.rows(world.relations.filter((r) => r.skill_id === eq("skill_id")));
      return ctx.json(200, []);
    }
    if (table === "rpc/record_skill_use") return ctx.json(200, true);
    if (table === "rpc/skill_set_deprecated") {
      const v = world.versions.find((x) => x.skill_id === body.p_skill && x.version === body.p_version);
      if (v) v.deprecated_at = body.p_deprecated ? "2026-03-09T00:00:00Z" : null;
      return ctx.json(200, true);
    }
    return null;
  };
  return world;
}

/** Storage (özel `skill-files` bucket'ı) ve Edge Function taklidi: bağlamdaki rotalar `installMock`'tan SONRA kurulur (sonuncu kazanır). */
async function installSkillRoutes(context, world) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-expose-headers": "*" };
  await context.route("https://example.supabase.co/storage/v1/object/skill-files/**", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fallback();
    const key = new URL(req.url()).pathname.replace("/storage/v1/object/", "");
    if (req.method() === "POST") {
      const buf = req.postDataBuffer() ?? Buffer.alloc(0);
      world.storage.set(key, buf);
      world.uploads.push({ key, size: buf.length, type: req.headers()["content-type"] });
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ Key: key }) });
    }
    if (req.method() === "GET") {
      const buf = world.storage.get(key);
      if (!buf) return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "not_found" }) });
      return route.fulfill({ status: 200, contentType: "application/octet-stream", headers: cors, body: buf });
    }
    if (req.method() === "DELETE") {
      for (const path of JSON.parse(req.postData() || "{}").prefixes ?? []) world.storage.delete(`skill-files/${path}`);
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: "[]" });
    }
    return route.fallback();
  });
  await context.route("https://example.supabase.co/storage/v1/object/skill-files", (route) => route.fallback());
  // toplu silme (supabase-js `remove`): DELETE /storage/v1/object/skill-files  gövde { prefixes: [...] }
  await context.route("https://example.supabase.co/storage/v1/object/sign/skill-files/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const path = decodeURIComponent(new URL(req.url()).pathname.replace("/storage/v1/object/sign/skill-files/", ""));
      world.signPosts.push(path);
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ signedURL: `/object/sign/skill-files/${path}?token=t` }) });
    }
    if (req.method() === "GET") {
      world.signGets.push(new URL(req.url()).pathname);
      return route.fulfill({ status: 200, contentType: "application/zip", headers: cors, body: Buffer.from("PK") });
    }
    return route.fallback();
  });
  await context.route("https://example.supabase.co/functions/v1/skill-package", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "*" } });
    const body = JSON.parse(req.postData() || "{}");
    world.fnCalls.push(body);
    const next = world.fnQueue.shift() ?? { status: 200, body: { ok: true, already: false, version: versionRow(body.skill_id, body.version, { changelog: body.changelog }), warnings: [] } };
    return route.fulfill({ status: next.status, contentType: "application/json", headers: cors, body: JSON.stringify(next.body) });
  });
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", me = ALICE } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  const world = withSkills(db, { me });
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await installMock(context, db, { signedIn: me });
  await installSkillRoutes(context, world);
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try {
    await fn({ page, db, world, context });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", `${name}\n      ${String(e.message).split("\n").slice(0, 8).join("\n      ")}`]);
    try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/skillfail-${results.length}.png` }); } catch {}
  } finally {
    await context.close();
  }
}

const openEditor = (page, id = "") => page.goto(`${BASE}/skills/create${id ? `?edit=${id}` : ""}`);
const openDetail = (page, id) => page.goto(`${BASE}/skills/local?id=${id}`);
const disclosure = (page, id) => page.locator(`[data-form-row="${id}"]`);
async function openFolder(page, folder) {
  const row = disclosure(page, `skill-folder-${folder}`);
  await row.waitFor();
  if ((await row.getByRole("button").first().getAttribute("aria-expanded")) !== "true") await row.getByRole("button").first().click();
  return page.locator(`[data-skill-folder="${folder}"]`);
}
async function enableAdvanced(page) {
  await disclosure(page, "advanced").getByRole("button").first().click();
  await page.locator("[data-skill-advanced-toggle]").click();
  await page.locator("[data-skill-package]").waitFor();
}

// ====================================================================================================================
await scenario("1. Kolay mod değişmedi: gelişmiş bölümler gizli, sürüm alanı form alanı", async ({ page }) => {
  await openEditor(page);
  await page.locator("#skill-title").waitFor();
  assert.equal(await page.locator("[data-skill-package]").count(), 0, "paket bölümü yalnız gelişmiş modda");
  await disclosure(page, "version").getByRole("button").first().click();
  await page.locator("#skill-version").waitFor();
  assert.equal(await page.locator("#skill-version").inputValue(), "1.0.0");
  assert.ok(await disclosure(page, "advanced").isVisible(), "gelişmiş mod anahtarı bir ayrıntı satırı");
});

await scenario("2. Gelişmiş mod açılır: beş klasör + kök + ZIP içe aktarma; sürüm alanı yayına ertelenir", async ({ page }) => {
  await openEditor(page);
  await enableAdvanced(page);
  for (const folder of ["rules", "references", "examples", "scripts", "tools", "root"]) assert.ok(await disclosure(page, `skill-folder-${folder}`).isVisible(), folder);
  assert.ok(await page.locator("[data-skill-import-zip]").isVisible());
  assert.equal(await page.locator("#skill-version").count(), 0, "gelişmiş modda sürüm numarasını yayın penceresi verir");
  assert.match(await page.locator("[data-skill-package]").innerText(), /0 dosya/);
});

await scenario("3. Ad yokken dosya yüklenmez ('önce ad ver'); ad verilince taslak kendiliğinden oluşur ve dosya Storage'a yazılır", async ({ page, world }) => {
  await openEditor(page);
  await enableAdvanced(page);
  const rules = await openFolder(page, "rules");
  await rules.locator("[data-skill-file-input]").setInputFiles({ name: "Stil Kuralları.md", mimeType: "text/markdown", buffer: enc("# Stil\n\nKüçük fonksiyonlar.") });
  await page.locator('[data-skill-uploads] li[data-upload-status="error"], #skill-title[aria-invalid="true"]').first().waitFor();
  assert.equal(world.uploads.length, 0, "ad yokken hiçbir şey yüklenmez");
  assert.equal(world.skills.filter((s) => s.author_id === ALICE).length, 2, "taslak açılmadı");
  await page.locator("#skill-title").fill("Kod Gözden Geçirici");
  await rules.locator("[data-skill-file-input]").setInputFiles({ name: "Stil Kuralları.md", mimeType: "text/markdown", buffer: enc("# Stil\n\nKüçük fonksiyonlar.") });
  await page.locator('[data-skill-file="rules/Stil-Kurallari.md"]').waitFor();
  assert.equal(world.uploads.length, 1);
  assert.match(world.uploads[0].key, /^skill-files\/[0-9a-f-]{36}\/draft\/[0-9a-f-]{36}\.md$/, "yol sunucu kalıbında: {skill}/draft/{uuid}.{uzantı}");
  assert.equal(world.uploads[0].type, "text/markdown");
  assert.equal(world.uploads[0].size, enc("# Stil\n\nKüçük fonksiyonlar.").length);
  assert.equal(world.files.filter((f) => f.path === "rules/Stil-Kurallari.md").length, 1, "skill_files satırı yazıldı");
  assert.equal(world.skillWrites.filter((w) => w.op === "insert").length, 1, "tek taslak açıldı");
});

await scenario("4. Kötü dosyalar yüklenmeden reddedilir: ELF, iç içe ZIP, geçersiz JSON; satırda sebep görünür", async ({ page, world }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Kod Gözden Geçirici");
  await enableAdvanced(page);
  const refs = await openFolder(page, "references");
  await refs.locator("[data-skill-file-input]").setInputFiles([
    { name: "ince.md", mimeType: "text/markdown", buffer: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4]) },
    { name: "ic-ice.md", mimeType: "text/markdown", buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]) },
    { name: "bozuk.json", mimeType: "application/json", buffer: enc("{not json") },
  ]);
  await page.locator('[data-skill-uploads] li[data-upload-status="error"]').nth(2).waitFor();
  const text = await page.locator("[data-skill-uploads]").innerText();
  assert.match(text, /Çalıştırılabilir dosyalar/);
  assert.match(text, /Arşiv içinde arşiv/);
  assert.match(text, /Geçerli bir JSON değil/);
  assert.equal(world.uploads.length, 0, "hiçbiri Storage'a gitmedi");
  assert.equal(world.files.filter((f) => f.skill_id !== S_DRAFT).length, 0);
});

await scenario("5. Uzantısı izinli olmayan dosya seçilemez/yüklenemez; betik klasöründe uyarı + 'Betik' rozeti", async ({ page, world }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Kod Gözden Geçirici");
  await enableAdvanced(page);
  const scripts = await openFolder(page, "scripts");
  assert.match(await scripts.locator("xpath=..").innerText(), /çalıştırılmaz/i, "betik uyarısı");
  await scripts.locator("[data-skill-file-input]").setInputFiles({ name: "kur.exe", mimeType: "application/octet-stream", buffer: Buffer.from([1, 2, 3]) });
  await page.locator('[data-skill-uploads] li[data-upload-status="error"]').first().waitFor();
  assert.match(await page.locator("[data-skill-uploads]").innerText(), /Çalıştırılabilir dosyalar/);
  await scripts.locator("[data-skill-file-input]").setInputFiles({ name: "lint.sh", mimeType: "text/x-sh", buffer: enc("#!/bin/sh\necho ok\n") });
  await page.locator('[data-skill-file="scripts/lint.sh"]').waitFor();
  assert.match(await page.locator('[data-skill-file="scripts/lint.sh"]').innerText(), /Betik/);
  assert.equal(world.files.find((f) => f.path === "scripts/lint.sh").is_script, true, "satıra is_script bayrağı yazıldı");
  assert.equal(world.files.find((f) => f.path === "scripts/lint.sh").kind, "script");
});

await scenario("6. Yeni metin dosyası → tam ekran düzenleyici: yazdıkça önizleme (Markdown güvenli), kaydet → Storage + satır", async ({ page, world }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Kod Gözden Geçirici");
  await enableAdvanced(page);
  const rules = await openFolder(page, "rules");
  await rules.locator("[data-skill-new-file]").click();
  await page.locator("#skill-new-file-name").fill("tarz");
  await page.getByRole("button", { name: "Oluştur ve aç" }).click();
  const editor = page.locator("[data-skill-file-editor]");
  await editor.waitFor();
  assert.equal(await page.locator("[data-skill-editor-path]").innerText().then((x) => x.trim()), "rules/tarz.md");
  await page.locator("[data-skill-editor-textarea]").fill('# Tarz\n\n<script>window.__xss=1</script>\n\n[kötü](javascript:window.__xss=2)\n\n**önemli** `kod`');
  const preview = page.locator("[data-skill-editor-preview]");
  await preview.locator("h2").waitFor();
  assert.match(await preview.innerText(), /<script>window\.__xss=1<\/script>/, "ham HTML metin olarak görünür");
  assert.equal(await preview.locator("script").count(), 0);
  assert.equal(await preview.locator("a").count(), 0, "javascript: bağlantısı çizilmedi");
  assert.equal(await preview.locator("strong").innerText(), "önemli");
  assert.equal(await page.evaluate(() => window.__xss), undefined, "hiçbir betik çalışmadı");
  await page.locator("[data-skill-editor-save]").click();
  await page.waitForFunction(() => !/kaydedilmedi/.test(document.querySelector("[data-skill-editor-path]")?.textContent ?? ""));
  assert.equal(world.uploads.length, 1);
  assert.match(world.uploads[0].key, /\.md$/);
  assert.equal(world.storage.get(world.uploads[0].key).toString("utf8").startsWith("# Tarz"), true);
  assert.ok(world.files.some((f) => f.path === "rules/tarz.md"));
  await page.locator("[data-skill-file-editor] button[aria-label='Kapat']").click();
  await page.locator('[data-skill-file="rules/tarz.md"]').waitFor();
});

await scenario("7. Düzenleyici: JSON hata verirse Kaydet kapalı, düzgünse açılır; kapatırken kaydedilmemiş değişiklik sorulur", async ({ page }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Kod Gözden Geçirici");
  await enableAdvanced(page);
  const tools = await openFolder(page, "tools");
  await tools.locator("[data-skill-new-file]").click();
  await page.locator("#skill-new-file-name").fill("manifest");
  await page.getByRole("button", { name: "Oluştur ve aç" }).click();
  await page.locator("[data-skill-file-editor]").waitFor();
  assert.match(await page.locator("[data-skill-editor-path]").innerText(), /tools\/manifest\.json/, "tools klasöründe varsayılan uzantı .json");
  const textarea = page.locator("[data-skill-editor-textarea]");
  await textarea.fill("{ bozuk");
  await page.waitForFunction(() => /Geçerli bir JSON değil/.test(document.body.textContent ?? ""));
  assert.equal(await page.locator("[data-skill-editor-save]").isDisabled(), true, "geçersiz JSON kaydedilemez");
  await textarea.fill('{ "name": "arac" }');
  await page.waitForFunction(() => !document.querySelector("[data-skill-editor-save]")?.hasAttribute("disabled"));
  await page.locator("[data-skill-file-editor] button[aria-label='Kapat']").click();
  await page.getByRole("dialog").filter({ hasText: "Kaydedilmemiş değişiklikler" }).waitFor();
  await page.getByRole("button", { name: "Vazgeç" }).click();
  assert.ok(await page.locator("[data-skill-file-editor]").isVisible(), "vazgeçince düzenleyici açık kalır");
});

await scenario("8. Var olan dosya düzenleyicide açılır (içerik Storage'dan), değiştirilince eski nesne silinir ve yol aynı kalır", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  const rules = await openFolder(page, "rules");
  await rules.locator('[data-skill-file="rules/style.md"] [data-skill-file-edit]').click();
  const textarea = page.locator("[data-skill-editor-textarea]");
  await textarea.waitFor();
  assert.equal(await textarea.inputValue(), "# Stil\n\nKüçük fonksiyonlar yaz.");
  await textarea.fill("# Stil\n\nGüncel kural.");
  await page.locator("[data-skill-editor-save]").click();
  await page.waitForFunction(() => !/kaydedilmedi/.test(document.querySelector("[data-skill-editor-path]")?.textContent ?? ""));
  assert.equal(world.uploads.length, 1, "yeni nesne yüklendi");
  assert.equal(world.files.filter((f) => f.path === "rules/style.md").length, 1, "aynı yolda tek satır");
  assert.notEqual(world.files.find((f) => f.path === "rules/style.md").storage_path, `${S_DRAFT}/draft/rulesstylemd.md`, "satır yeni nesneyi gösterir");
});

await scenario("9. Dosya silme: onay penceresi, satır kalkar", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  const scripts = await openFolder(page, "scripts");
  await scripts.locator('[data-skill-file="scripts/run.sh"] [data-skill-file-remove]').click();
  await page.getByRole("dialog").filter({ hasText: "Dosya silinsin mi?" }).waitFor();
  await page.getByRole("button", { name: "Sil", exact: true }).click();
  await scripts.locator('[data-skill-file="scripts/run.sh"]').waitFor({ state: "detached" });
  assert.equal(world.files.some((f) => f.path === "scripts/run.sh"), false);
});

await scenario("10. İlk yayın: sürüm 1.0.0, not isteğe bağlı; Edge Function doğru gövdeyle çağrılır, başarıda detay sayfasına gider", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  await page.locator("#skill-summary").fill("Kodu özenle gözden geçirir.");
  await page.locator('[data-skill-category="software"]').click();
  await page.locator("#skill-instructions").fill("# Rol\n\nSen titiz bir kod gözden geçiricisisin. Her değişikliği oku.");
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  const dialog = page.locator("[data-skill-publish-dialog]");
  await dialog.waitFor();
  assert.equal(await page.locator("#skill-publish-version").inputValue(), "1.0.0");
  assert.equal(await page.locator("[data-skill-bump]").count(), 0, "ilk yayında sürüm önerisi yok");
  await page.locator("[data-skill-publish-confirm]").click();
  await page.waitForURL(/\/skills\/local\/?\?id=/);
  assert.equal(world.fnCalls.length, 1);
  const call = world.fnCalls[0];
  assert.equal(call.skill_id, S_DRAFT);
  assert.equal(call.version, "1.0.0");
  assert.match(call.client_token, /^[0-9a-f-]{36}$/);
  assert.equal(call.acknowledge_warnings, false);
  const draftWrites = world.skillWrites.filter((w) => w.op === "update");
  assert.ok(draftWrites.length >= 1 && draftWrites.every((w) => w.body.status === "draft"), "alanlar kaydedilirken durum taslak kaldı; yayında olmayı Edge Function verir");
});

await scenario("11. Yayın uyarısı: gizli anahtar uyarısı onay ister; onaylayınca AYNI client_token ile yeniden gönderilir", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  await page.locator("#skill-summary").fill("Kodu özenle gözden geçirir.");
  await page.locator('[data-skill-category="software"]').click();
  await page.locator("#skill-instructions").fill("# Rol\n\nSen titiz bir kod gözden geçiricisisin. Her değişikliği oku.");
  world.fnQueue.push({ status: 409, body: { error: "warnings_unacknowledged", issues: [{ path: "references/notlar.md", code: "secret_warning", severity: "warning", detail: "AWS access key" }] } });
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.locator("[data-skill-publish-confirm]").click();
  await page.locator("[data-skill-ack]").waitFor();
  const issues = await page.locator("[data-skill-issues]").innerText();
  assert.match(issues, /references\/notlar\.md/);
  assert.match(issues, /AWS access key/);
  assert.ok(!issues.includes("AKIA"), "ham değer asla gösterilmez");
  assert.equal(await page.locator("[data-skill-publish-confirm]").isDisabled(), true, "onay verilmeden yayınlanamaz");
  await page.locator("[data-skill-ack]").check();
  await page.locator("[data-skill-publish-confirm]").click();
  await page.waitForURL(/\/skills\/local\/?\?id=/);
  assert.equal(world.fnCalls.length, 2);
  assert.equal(world.fnCalls[0].client_token, world.fnCalls[1].client_token, "yeniden deneme aynı belirteci taşır (idempotent)");
  assert.equal(world.fnCalls[0].acknowledge_warnings, false);
  assert.equal(world.fnCalls[1].acknowledge_warnings, true);
});

await scenario("12. Yayın hatası: paket doğrulaması reddederse sorunlar listelenir ve pencere açık kalır; servis yoksa anlaşılır mesaj", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  await page.locator("#skill-summary").fill("Kodu özenle gözden geçirir.");
  await page.locator('[data-skill-category="software"]').click();
  await page.locator("#skill-instructions").fill("# Rol\n\nSen titiz bir kod gözden geçiricisisin. Her değişikliği oku.");
  world.fnQueue.push({ status: 422, body: { error: "package_invalid", issues: [{ path: "rules/style.md", code: "secret_private_key", severity: "error" }] } });
  world.fnQueue.push({ status: 404, body: { error: "NOT_FOUND", message: "Requested function was not found" } });
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.locator("[data-skill-publish-confirm]").click();
  await page.locator("[data-skill-publish-error]").waitFor();
  assert.match(await page.locator("[data-skill-publish-dialog]").innerText(), /Özel anahtar bulundu/);
  assert.match(await page.locator("[data-skill-publish-error]").innerText(), /doğrulamayı geçemedi/);
  assert.equal(await page.locator("[data-skill-ack]").count(), 0, "hata uyarı değil: onay kutusu yok");
  await page.locator("[data-skill-publish-confirm]").click();
  await page.waitForFunction(() => /Paket servisi şu an kullanılamıyor|Sürüm yayınlanamadı/.test(document.querySelector("[data-skill-publish-error]")?.textContent ?? ""));
  assert.ok(await page.locator("[data-skill-publish-dialog]").isVisible());
});

await scenario("13. Sonraki sürüm: sürüm önerisi (düzeltme/yeni özellik/kalıp), not ZORUNLU, eski/aynı sürüm reddedilir", async ({ page, world }) => {
  await openEditor(page, S_PUB);
  await page.locator("#skill-title").waitFor();
  await page.getByRole("button", { name: "Kaydet", exact: true }).first().click();
  await page.locator("[data-skill-publish-dialog]").waitFor();
  assert.equal(await page.locator("#skill-publish-version").inputValue(), "1.1.1", "son sürüm 1.1.0 → düzeltme önerisi");
  await page.locator('[data-skill-bump="minor"]').click();
  assert.equal(await page.locator("#skill-publish-version").inputValue(), "1.2.0");
  await page.locator('[data-skill-bump="major"]').click();
  assert.equal(await page.locator("#skill-publish-version").inputValue(), "2.0.0");
  await page.locator("[data-skill-publish-confirm]").click();
  assert.match(await page.locator("[data-skill-publish-dialog]").innerText(), /en az 3 karakterlik bir not/, "ilk yayından sonra not zorunlu");
  assert.equal(world.fnCalls.length, 0, "not yokken istek gitmedi");
  await page.locator("#skill-publish-version").fill("1.0.5");
  await page.locator("#skill-publish-changelog").fill("Eski sürüme geri");
  await page.locator("[data-skill-publish-confirm]").click();
  assert.match(await page.locator("[data-skill-publish-dialog]").innerText(), /1\.1\.0 sürümünden büyük/);
  assert.equal(world.fnCalls.length, 0);
  await page.locator("#skill-publish-version").fill("1.10.0");
  await page.locator("[data-skill-publish-confirm]").click();
  await page.waitForURL(/\/skills\/local\/?\?id=/);
  assert.equal(world.fnCalls[0].version, "1.10.0", "1.10.0 > 1.1.0 (sayısal karşılaştırma)");
  assert.equal(world.fnCalls[0].changelog, "Eski sürüme geri");
  assert.ok(world.skillWrites.filter((w) => w.op === "update").every((w) => w.body.status === "published"), "yayınlanmış Skill kaydedilirken taslağa düşmez");
});

await scenario("14. Detay (sahip): ZIP birincil eylem, güvenli Markdown (XSS yok), sürümler, dosya listesi + betik uyarısı, kullanımdan kaldır", async ({ page, world }) => {
  await openDetail(page, S_PUB);
  const download = page.locator("[data-skill-download]");
  await download.waitFor();
  assert.match(await download.innerText(), /ZIP indir \(1\.1\.0\)/);
  const body = page.locator("[data-skill-instructions]");
  await body.waitFor();
  assert.equal(await body.locator("h2").innerText(), "Başlık");
  assert.equal(await body.locator("strong").innerText(), "kalın");
  assert.equal(await body.locator("img").count(), 0, "ham HTML çizilmez");
  assert.match(await body.innerText(), /<img src=x onerror=/, "ham HTML metin olarak görünür");
  const hrefs = await body.locator("a").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  assert.deepEqual(hrefs, ["https://example.com/ok"], "javascript: bağlantısı yok, https var");
  assert.equal(await page.evaluate(() => window.__xss), undefined, "hiçbir betik çalışmadı");
  await page.locator("[data-skill-raw-toggle]").click();
  assert.match(await page.locator("pre").first().innerText(), /\*\*kalın\*\*/, "ham görünümde işaretleme olduğu gibi");
  const versions = page.locator("[data-skill-versions] li");
  assert.equal(await versions.count(), 2);
  assert.match(await versions.first().innerText(), /1\.1\.0/);
  assert.match(await versions.first().innerText(), /Son/);
  const manifest = await page.locator("[data-skill-manifest]").innerText();
  assert.match(manifest, /rules\/style\.md/);
  assert.match(manifest, /scripts\/lint\.sh/);
  assert.match(await page.locator("#skill-files").innerText(), /Bu pakette betik var/);
  await page.locator('[data-skill-version="1.0.0"] [data-skill-deprecate]').click();
  await page.locator('[data-skill-version="1.0.0"]', { hasText: "Kullanımdan kaldırıldı" }).waitFor();
  assert.ok(world.versions.find((v) => v.version === "1.0.0" && v.skill_id === S_PUB).deprecated_at, "RPC çağrıldı");
});

await scenario("15. ZIP indirme: imzalı adres istenir ve tarayıcı oraya gider (eski sürüm de indirilebilir)", async ({ page, world }) => {
  await openDetail(page, S_PUB);
  await page.locator("[data-skill-download]").waitFor();
  const signedRequest = page.waitForRequest((request) => request.method() === "GET" && request.url().includes("/object/sign/skill-files/"));
  await page.locator('[data-skill-version="1.0.0"] [data-skill-version-download]').click();
  await signedRequest;
  assert.deepEqual(world.signPosts, [`${S_PUB}/packages/1.0.0-${sha.slice(0, 16)}.zip`], "yalnız eski sürümün paket yolu imzalandı");
  for (let i = 0; i < 50 && world.signGets.length === 0; i += 1) await page.waitForTimeout(100);
  assert.ok(world.signGets.length >= 1, "tarayıcı imzalı adrese gitti");
});

await scenario("16. Detay (başka kullanıcı): kullanımdan kaldırma ve düzenleme yok; ZIP var; sahibin taslağı görünmez", async ({ page }) => {
  await openDetail(page, S_BOB);
  await page.locator("[data-skill-download]").waitFor();
  assert.match(await page.locator("[data-skill-download]").innerText(), /ZIP indir/);
  assert.equal(await page.locator("[data-skill-deprecate]").count(), 0);
  assert.equal(await page.locator("[data-skill-edit]").count(), 0);
});

await scenario("17. Sürümsüz Skill: birincil eylem SKILL.md indir (kolay mod bozulmadı), 'henüz paketlenmiş sürüm yok'", async ({ page }) => {
  await openDetail(page, S_DRAFT);
  const download = page.locator("[data-skill-download]");
  await download.waitFor();
  assert.match(await download.innerText(), /SKILL\.md|İndir/);
  await page.locator("[data-skill-download-menu]").waitFor();
  assert.match(await page.locator("#skill-versions").innerText(), /Henüz paketlenmiş sürüm yok/);
});

await scenario("18. ZIP içe aktarma: alanlar dolar, dosyalar yüklenir, kötü girdiler rapor edilir (zip slip, ELF), yazar/sürüm dosyadan alınmaz", async ({ page, world }) => {
  const zip = Buffer.from(zipSync({
    "kod-gozden-gecirici/SKILL.md": enc('---\nname: kod-gozden-gecirici\ndescription: "Kodu gözden geçirir"\nlicense: Apache-2.0\nmetadata:\n  version: "9.9.9"\n  author: mallory\n---\n\n# Rol\n\nTitiz ol. Her değişikliği oku ve yorum yaz.\n'),
    "kod-gozden-gecirici/metadata.json": enc(JSON.stringify({ title: "Kod Gözden Geçirici", category: "software", compat: ["claude-code"] })),
    "kod-gozden-gecirici/rules/stil.md": enc("Küçük fonksiyonlar."),
    "kod-gozden-gecirici/references/ince.md": new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3]),
    "../evil.md": enc("x"),
  }));
  await openEditor(page);
  await enableAdvanced(page);
  await page.locator("[data-skill-zip-input]").setInputFiles({ name: "skill.zip", mimeType: "application/zip", buffer: zip });
  await page.locator('[data-upload-status="done"], [data-skill-import-report]').first().waitFor();
  const imported = await openFolder(page, "rules");
  await imported.locator('[data-skill-file="rules/stil.md"]').waitFor();
  assert.equal(await page.locator("#skill-title").inputValue(), "Kod Gözden Geçirici");
  assert.equal(await page.locator("#skill-summary").inputValue().then((x) => x.startsWith("Kodu gözden geçirir")), true);
  assert.match(await page.locator("#skill-instructions").inputValue(), /Titiz ol/);
  const report = await page.locator("[data-skill-import-report]").innerText();
  assert.match(report, /Çalıştırılabilir dosyalar/, "ELF raporlandı");
  assert.match(report, /\.\./, "zip slip raporlandı");
  assert.equal(world.files.some((f) => f.path === "references/ince.md"), false, "hatalı dosya yüklenmedi");
  assert.equal(world.files.some((f) => /evil/.test(f.path)), false);
  const insert = world.skillWrites.find((w) => w.op === "insert");
  assert.equal(insert.body.version, "1.0.0", "sürüm dosyadan (9.9.9) alınmadı");
  assert.equal(insert.body.status, "draft", "içe aktarılan Skill taslak olur");
  assert.equal(insert.body.license, "apache-2.0");
  assert.ok(!JSON.stringify(insert.body).includes("mallory") || /Kaynak: mallory/.test(insert.body.summary), "yazar yalnız atıf satırı olarak kalır");
});

await scenario("19. İngilizce: paket bölümü, doğrulama sorunları ve yayın penceresi çevrilmiş", async ({ page }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Code Reviewer");
  await enableAdvanced(page);
  assert.match(await page.locator("[data-skill-package]").innerText(), /Promptly never runs any file/);
  const refs = await openFolder(page, "references");
  await refs.locator("[data-skill-file-input]").setInputFiles({ name: "x.md", mimeType: "text/markdown", buffer: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 2]) });
  await page.locator('[data-skill-uploads] li[data-upload-status="error"]').first().waitFor();
  assert.match(await page.locator("[data-skill-uploads]").innerText(), /Executable files/);
}, { lang: "en" });

await scenario("20. Telefon: taşma yok; düzenleyici tek sütun (dosya seçici + Düzenle/Önizle sekmeleri)", async ({ page }) => {
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  const rules = await openFolder(page, "rules");
  await rules.locator('[data-skill-file="rules/style.md"] [data-skill-file-edit]').click();
  await page.locator("[data-skill-file-editor]").waitFor();
  assert.equal(await page.locator("[data-skill-tree]").isVisible(), false, "ağaç yalnız masaüstünde");
  await page.getByRole("button", { name: "Önizleme", exact: true }).click();
  await page.locator("[data-skill-editor-preview]").waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  assert.ok(await page.locator("[data-skill-editor-textarea]").isVisible());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `yatay taşma yok (${overflow}px)`);
}, { viewport: { width: 390, height: 800 } });

await scenario("21. Masaüstü düzenleyici: dosya ağacı (role=tree) + düzenleyici + önizleme yan yana; ağaçtan dosya değiştirmek yazılanı kaybettirmez", async ({ page, world }) => {
  world.files.push(fileRow(S_DRAFT, "rules/ikinci.md", 10, { storage_path: `${S_DRAFT}/draft/ikinci.md` }));
  world.storage.set(`skill-files/${S_DRAFT}/draft/ikinci.md`, enc("İkinci dosya"));
  await openEditor(page, S_DRAFT);
  const rules = await openFolder(page, "rules");
  await rules.locator('[data-skill-file="rules/style.md"] [data-skill-file-edit]').click();
  const tree = page.locator("[data-skill-tree]");
  await tree.waitFor();
  assert.equal(await tree.getAttribute("role"), "tree");
  assert.ok(await page.locator("[data-skill-editor-preview]").isVisible() && await page.locator("[data-skill-editor-textarea]").isVisible(), "üç bölme birlikte");
  const textarea = page.locator("[data-skill-editor-textarea]");
  await textarea.waitFor();
  await textarea.fill("# Stil\n\nDeğişti ama kaydedilmedi.");
  await tree.locator("[role=treeitem][data-tree-leaf]", { hasText: "ikinci.md" }).click();
  await page.waitForFunction(() => document.querySelector("[data-skill-editor-textarea]")?.value === "İkinci dosya");
  await tree.locator("[role=treeitem][data-tree-leaf]", { hasText: "style.md" }).click();
  await page.waitForFunction(() => document.querySelector("[data-skill-editor-textarea]")?.value.includes("Değişti ama kaydedilmedi."));
});

await scenario("22. Bağlı içerik: Skill'e bir Prompt bağlanır (Seç penceresi), kart görünür; kimliği yalnız taslak açıldıktan sonra yazılır", async ({ page, db, world }) => {
  const P1 = "e5000000-0000-4000-8000-000000000001";
  const inserted = [];
  const previous = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, method, body } = ctx;
    if (table === "skill_relations" && method === "POST") {
      inserted.push(body);
      const row = { id: "r1", skill_id: body.skill_id, target_type: body.target_type, target_id: body.target_id, position: body.position };
      world.relations.push(row);
      return ctx.rows([row]);
    }
    if (table === "prompts" && method === "GET" && /in\.\(/.test(ctx.q.get("id") ?? "")) {
      return ctx.rows([{ id: P1, title: "Bağlanan Prompt", status: "published", visibility: "public", community_id: null, deleted_at: null, profiles: { display_name: "Alice" }, prompt_media: [] }]);
    }
    return previous(ctx);
  };
  await openEditor(page, S_DRAFT);
  await page.locator("#skill-title").waitFor();
  assert.ok(await page.locator("[data-skill-relations]").isVisible(), "bağlı içerik bölümü gelişmiş modda");
  await page.locator('[data-skill-relation-add="prompt"]').click();
  await page.getByRole("dialog").first().waitFor();
  assert.equal(inserted.length, 0, "seçmeden hiçbir şey yazılmadı");
});

await scenario("23. Dosyayı değiştir: aynı yola yazılır (satır sayısı artmaz), eski nesne yerini yeniye bırakır", async ({ page, world }) => {
  await openEditor(page, S_DRAFT);
  const rules = await openFolder(page, "rules");
  const before = world.files.find((f) => f.path === "rules/style.md").storage_path;
  const chooser = page.waitForEvent("filechooser");
  await rules.locator('[data-skill-file="rules/style.md"] button[aria-label*="değiştir"]').click();
  await (await chooser).setFiles({ name: "baska-ad.md", mimeType: "text/markdown", buffer: enc("# Yeni içerik") });
  const expected = `${enc("# Yeni içerik").length} B`;
  await page.waitForFunction((text) => document.querySelector('[data-skill-file="rules/style.md"]')?.textContent?.includes(text), expected);
  assert.equal(world.files.filter((f) => f.path === "rules/style.md").length, 1, "aynı yolda tek satır");
  assert.equal(world.files.some((f) => f.path === "rules/baska-ad.md"), false, "yol seçilen dosyanın adından değil, değiştirilenden gelir");
  assert.notEqual(world.files.find((f) => f.path === "rules/style.md").storage_path, before);
});

// ====================================================================================================================
await scenario("24. Klasör adı (slug) ve etiketler: slug addan türer, elle değiştirilebilir ve geçersiz biçim uyarılır; Etiketler satırı vardır; gelişmiş modda 'Klasörden içe aktar'", async ({ page }) => {
  await openEditor(page);
  await page.locator("#skill-title").fill("Logo Tasarımı");
  await disclosure(page, "slug").getByRole("button").first().click();
  const slug = page.locator("[data-skill-slug-input]");
  await slug.waitFor();
  assert.equal(await slug.inputValue(), "logo-tasarimi");
  await slug.fill("Benim Logo!");
  assert.equal(await slug.inputValue(), "benimlogo", "yalnız küçük harf, rakam ve tire kalır");
  await slug.fill("-kotu-");
  await page.getByText("tire ile başlayıp bitemez").waitFor();
  assert.ok(await disclosure(page, "tags").isVisible(), "Etiketler satırı");
  await enableAdvanced(page);
  assert.ok(await page.locator("[data-skill-import-folder]").isVisible());
  assert.equal(await page.locator("[data-skill-folder-input]").getAttribute("webkitdirectory"), "");
});

await browser.close();
server.close();
const failed = results.filter(([s]) => s === "FAIL");
for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
