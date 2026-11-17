import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createRestClient, getPublicSkill, listPublicSkillFiles, openApiDocument, PublicApiError, searchPublicSkills } from "./index.ts";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "55555555-5555-4555-8555-555555555555";
const ID_PROMPT = "33333333-3333-4333-8333-333333333333";
const author = { username: "ayse", display_name: "Ayşe" };

const skillRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: "Kod gözden geçirici", summary: "  Pull request inceler  ", instructions: "# Rol\n\nGüvenlik açıklarını bul.", category: "software", compat: ["claude-code"], license: "mit", version: "1.1.0",
  like_count: 5, comment_count: 2, save_count: 3, use_count: 9, created_at: "2026-10-01T10:00:00.000Z", profiles: author, skill_tags: [{ tag_slug: "guvenlik" }], ...over,
});
const TABLES: Record<string, unknown[]> = {
  // ID_A: sahip yayından sonra çalışma kopyasını ve sürüm etiketini DEĞİŞTİRDİ ("7.7.7", yeni talimat); yayınlanan sürümün anlık görüntüsü ayrıdır.
  skills: [skillRow(ID_C, { title: "Eski sürümlü", instructions: "# Çalışma kopyası", version: "1.0.0" }), skillRow(ID_A, { instructions: "# SESSİZCE DEĞİŞTİRİLDİ", version: "7.7.7" }), skillRow(ID_B, { title: "Logo", category: "design" })],
  skill_versions: [
    { skill_id: ID_A, version: "1.1.0", instructions: "# Rol\n\nGüvenlik açıklarını bul.", changelog: " Kurallar eklendi ", package_size: 2048, file_count: 2, created_at: "2026-10-02T10:00:00Z", deprecated_at: null,
      manifest: { files: [{ path: "rules/style.md", kind: "rule", size: 20, script: false }, { path: "scripts/lint.sh", kind: "script", size: 40, script: true }, { path: 5, size: "x" }] } },
    { skill_id: ID_A, version: "1.0.0", instructions: "# Rol\n\nİlk sürümün metni.", changelog: "", package_size: 1024, file_count: 1, created_at: "2026-09-01T10:00:00Z", deprecated_at: null, manifest: { files: [] } },
    // Anlık görüntüden ÖNCEKİ bir sürüm (sütun NULL): çalışma kopyasına düşülür.
    { skill_id: ID_C, version: "1.0.0", instructions: null, changelog: "", package_size: 10, file_count: 0, created_at: "2026-08-01T10:00:00Z", deprecated_at: null, manifest: { files: [] } },
  ],
  skill_relations: [{ skill_id: ID_A, target_type: "prompt", target_id: ID_PROMPT, position: 0 }],
};

interface Call { path: string; params: URLSearchParams; body: Record<string, unknown> | null }
function fakeFetch(searchRows: { id: string; created_at: string; sort_rank: number; match_source: string | null }[] = []) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/rest/v1/", "");
    calls.push({ path, params: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path === "rpc/skill_feed_page") return Response.json(searchRows);
    const rows = TABLES[path];
    if (!rows) return new Response("nope", { status: 404 });
    const idFilter = url.searchParams.get("id")?.replace(/^in\.\(|\)$/g, "").split(",");
    const skillFilter = url.searchParams.get("skill_id")?.replace(/^eq\./, "");
    const versionFilter = url.searchParams.get("version")?.replace(/^eq\./, "");
    let out = rows as Record<string, unknown>[];
    if (idFilter) out = out.filter((row) => idFilter.includes(String(row.id)));
    if (skillFilter) out = out.filter((row) => row.skill_id === skillFilter);
    if (versionFilter) out = out.filter((row) => row.version === versionFilter);
    return Response.json(out);
  };
  return { calls, fetch: impl as typeof fetch };
}
const client = (fake: ReturnType<typeof fakeFetch>) => createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fake.fetch });
const hit = { id: ID_A, created_at: "2026-10-01T10:00:00.000Z", sort_rank: 0, match_source: "title" };

test("search: parameters go to skill_feed_page as RPC arguments, rows are read with the public filters", async () => {
  const fake = fakeFetch([hit]);
  const page = await searchPublicSkills(client(fake), { query: " gözden ", category: "software", compat: ["claude-code", "cursor"], license: "mit", hasPackage: true, sort: "popular", limit: 5 });
  const rpc = fake.calls[0];
  assert.equal(rpc.path, "rpc/skill_feed_page");
  assert.equal(rpc.body?.p_query, "gözden");
  assert.equal(rpc.body?.p_category, "software");
  assert.deepEqual(rpc.body?.p_compat, ["claude-code", "cursor"]);
  assert.equal(rpc.body?.p_license, "mit");
  assert.equal(rpc.body?.p_has_package, true);
  assert.equal(rpc.body?.p_sort, "popular");
  assert.equal(rpc.body?.p_limit, 5);
  const read = fake.calls[1];
  assert.equal(read.path, "skills");
  assert.equal(read.params.get("status"), "eq.published");
  assert.equal(read.params.get("visibility"), "eq.public");
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].matchedIn, "title");
  assert.equal(page.items[0].description, "Pull request inceler");
  assert.equal(page.items[0].url, "https://aliq0330.github.io/promptly/share/skill/" + ID_A + "/");
  assert.deepEqual(page.items[0].stats, { likes: 5, saves: 3, comments: 2, uses: 9 });
  assert.equal(page.items[0].author.username, "ayse");
});

test("search: a short page ends the cursor, a full page continues from the last RPC row", async () => {
  assert.equal((await searchPublicSkills(client(fakeFetch([hit])), { limit: 5 })).nextCursor, null);
  const full = await searchPublicSkills(client(fakeFetch([hit])), { limit: 1 });
  assert.ok(full.nextCursor);
});

test("search: unknown enum values are refused before any request", async () => {
  for (const bad of [{ sort: "shiny" }, { category: "magic" }, { license: "wtfpl" }, { compat: ["vim"] }]) {
    const fake = fakeFetch();
    await assert.rejects(() => searchPublicSkills(client(fake), bad), (error) => error instanceof PublicApiError && error.code === "bad_request");
    assert.equal(fake.calls.length, 0);
  }
});

test("get: the SKILL.md body, the latest version, its files (script flagged, junk entries dropped) and public relations", async () => {
  const fake = fakeFetch();
  const skill = await getPublicSkill(client(fake), ID_A);
  assert.equal(skill.instructions, "# Rol\n\nGüvenlik açıklarını bul.", "the PUBLISHED text, not the owner's later edit");
  assert.equal(skill.latestVersion?.version, "1.1.0");
  assert.equal(skill.latestVersion?.changelog, "Kurallar eklendi");
  assert.equal(skill.latestVersion?.deprecated, false);
  assert.deepEqual(skill.files.map((f) => [f.path, f.script]), [["rules/style.md", false], ["scripts/lint.sh", true]]);
  assert.equal(skill.related[0].type, "prompt");
  assert.ok(skill.related[0].url.endsWith(`/share/prompt/${ID_PROMPT}/`));
});

test("get: readers see the immutable published text and version; the owner's later working-copy edits only raise hasUnpublishedChanges", async () => {
  const skill = await getPublicSkill(client(fakeFetch()), ID_A);
  assert.equal(skill.instructionsSource, "published");
  assert.equal(skill.hasUnpublishedChanges, true);
  assert.ok(!skill.instructions.includes("SESSİZCE"));
  assert.equal(skill.version, "1.1.0", "the shown version is the published one, not the editable skills.version label (7.7.7)");
});

test("get: a version can be pinned; an older version returns its own text; an unknown or malformed version is refused", async () => {
  const fake = fakeFetch();
  const old = await getPublicSkill(client(fake), ID_A, "1.0.0");
  assert.equal(old.instructions, "# Rol\n\nİlk sürümün metni.");
  assert.equal(old.version, "1.0.0");
  assert.equal(old.hasUnpublishedChanges, false, "pinned reads never claim a pending change");
  await assert.rejects(() => getPublicSkill(client(fakeFetch()), ID_A, "9.9.9"), (error) => error instanceof PublicApiError && error.code === "not_found");
  await assert.rejects(() => getPublicSkill(client(fakeFetch()), ID_A, "latest"), (error) => error instanceof PublicApiError && error.code === "bad_request");
});

test("get: a Skill without a snapshot (no version, or a pre-snapshot version) falls back to the working copy and says so", async () => {
  const none = await getPublicSkill(client(fakeFetch()), ID_B);
  assert.equal(none.instructionsSource, "working_copy");
  assert.equal(none.hasUnpublishedChanges, false);
  assert.equal(none.latestVersion, null);
  const legacy = await getPublicSkill(client(fakeFetch()), ID_C);
  assert.equal(legacy.instructions, "# Çalışma kopyası");
  assert.equal(legacy.instructionsSource, "working_copy");
  assert.equal(legacy.latestVersion?.version, "1.0.0");
});

test("get: a missing, draft or private Skill is not_found; a bad id is refused", async () => {
  await assert.rejects(() => getPublicSkill(client(fakeFetch()), "44444444-4444-4444-8444-444444444444"), (error) => error instanceof PublicApiError && error.code === "not_found");
  await assert.rejects(() => getPublicSkill(client(fakeFetch()), "nope"), (error) => error instanceof PublicApiError && error.code === "bad_request");
});

test("files: a Skill without a package returns an empty list; an unknown version is not_found", async () => {
  const none = await listPublicSkillFiles(client(fakeFetch()), ID_B);
  assert.deepEqual(none, { version: null, files: [] });
  await assert.rejects(() => listPublicSkillFiles(client(fakeFetch()), ID_A, "9.9.9"), (error) => error instanceof PublicApiError && error.code === "not_found");
  await assert.rejects(() => listPublicSkillFiles(client(fakeFetch()), ID_A, "latest"), (error) => error instanceof PublicApiError && error.code === "bad_request");
  const ok = await listPublicSkillFiles(client(fakeFetch()), ID_A, "1.1.0");
  assert.equal(ok.files.length, 2);
});

test("HTTP: /skills, /skills/{id}, /skills/{id}/files are GET-only and the OpenAPI document lists them", async () => {
  const fake = fakeFetch([hit]);
  const handler = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fake.fetch } });
  const list = await handler(new Request("https://demo.supabase.co/functions/v1/api/v1/skills?q=gozden&compat=cursor&has_package=true"));
  assert.equal(list.status, 200);
  assert.equal(fake.calls[0].body?.p_has_package, true);
  assert.deepEqual(fake.calls[0].body?.p_compat, ["cursor"]);
  assert.equal((await handler(new Request(`https://demo.supabase.co/functions/v1/api/v1/skills/${ID_A}`))).status, 200);
  assert.equal((await handler(new Request(`https://demo.supabase.co/functions/v1/api/v1/skills/${ID_A}/files`))).status, 200);
  assert.equal((await handler(new Request(`https://demo.supabase.co/functions/v1/api/v1/skills/${ID_A}/other`))).status, 404);
  assert.equal((await handler(new Request("https://demo.supabase.co/functions/v1/api/v1/skills", { method: "POST" }))).status, 405);
  const paths = Object.keys((openApiDocument("https://x.test") as { paths: Record<string, unknown> }).paths);
  for (const path of ["/skills", "/skills/{id}", "/skills/{id}/files"]) assert.ok(paths.includes(path), path);
});
