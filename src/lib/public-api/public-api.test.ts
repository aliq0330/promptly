import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createRestClient, decodeCursor, fillPrompt, getPrompt, getPrompts, openApiDocument, popularPrompts, promptSlug, routeOf, searchPrompts, PublicApiError } from "./index.ts";

const SITE = "https://aliq0330.github.io/promptly";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_GONE = "33333333-3333-4333-8333-333333333333";

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Prompt ${id.slice(0, 1)}`,
    description: "Açıklama",
    prompt_text: "A {subject} in {style} style",
    content_type: "image",
    category: "art",
    subcategory: null,
    tool: null,
    tools: ["midjourney:v7"],
    like_count: 3,
    save_count: 2,
    comment_count: 1,
    copy_count: 9,
    created_at: "2026-10-01T10:00:00.000Z",
    profiles: { username: "ayse", display_name: "Ayşe" },
    prompt_tags: [{ tags: { slug: "portre", label: "Portre" } }, { tags: null }],
    ...overrides,
  };
}

interface Call {
  path: string;
  params: URLSearchParams;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

/** PostgREST taklidi: yalnız çekirdeğin kullandığı üç uç (rpc/search_content, prompts, prompt_variables). */
function fakeFetch(options: { searchRows?: unknown[]; prompts?: unknown[]; variables?: unknown[]; status?: number } = {}) {
  const calls: Call[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/rest/v1/", "");
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path, params: url.searchParams, body, headers: init?.headers as Record<string, string> });
    if (options.status) return new Response(JSON.stringify({ code: "XX", message: "boom" }), { status: options.status });
    if (path === "rpc/search_content") return Response.json(options.searchRows ?? []);
    if (path === "prompts") {
      const inList = url.searchParams.get("id")?.replace(/^in\.\(|\)$/g, "").split(",") ?? [];
      const all = (options.prompts ?? []) as { id: string }[];
      return Response.json(inList.length ? all.filter((entry) => inList.includes(entry.id)) : all);
    }
    if (path === "prompt_variables") return Response.json(options.variables ?? []);
    return new Response("not found", { status: 404 });
  };
  return { calls, fetch: impl as typeof fetch };
}

function client(fake: ReturnType<typeof fakeFetch>, anonKey = "eyJ.anon.key") {
  return createRestClient({ url: "https://demo.supabase.co/", anonKey, fetch: fake.fetch });
}

test("rest client: JWT anon key goes to apikey + Authorization, publishable key only to apikey", async () => {
  const jwt = fakeFetch({ prompts: [] });
  await popularPrompts(client(jwt));
  assert.equal(jwt.calls[0].headers.apikey, "eyJ.anon.key");
  assert.equal(jwt.calls[0].headers.Authorization, "Bearer eyJ.anon.key");

  const publishable = fakeFetch({ prompts: [] });
  await popularPrompts(client(publishable, "sb_publishable_x"));
  assert.equal(publishable.calls[0].headers.apikey, "sb_publishable_x");
  assert.equal(publishable.calls[0].headers.Authorization, undefined);
});

test("rest client: refuses missing config and wraps upstream errors", async () => {
  assert.throws(() => createRestClient({ url: "", anonKey: "x" }), (error: unknown) => error instanceof PublicApiError && error.code === "not_configured");
  await assert.rejects(popularPrompts(client(fakeFetch({ status: 500 }))), (error: unknown) => error instanceof PublicApiError && error.code === "upstream" && /500/.test(error.message));
});

test("searchPrompts: passes filters as RPC parameters, hydrates in result order, keeps only public non-community rows", async () => {
  const fake = fakeFetch({
    searchRows: [
      { id: ID_B, created_at: "2026-10-02T00:00:00Z", sort_rank: 0 },
      { id: ID_GONE, created_at: "2026-10-01T12:00:00Z", sort_rank: 0 },
      { id: ID_A, created_at: "2026-10-01T00:00:00Z", sort_rank: 0 },
    ],
    prompts: [row(ID_A), row(ID_B)],
  });
  const page = await searchPrompts(client(fake), { query: "  kedi  ", contentType: "image", tags: ["Karakter Tasarımı"], tools: ["midjourney"], limit: 3 });
  const rpc = fake.calls[0];
  assert.equal(rpc.path, "rpc/search_content");
  assert.equal(rpc.body?.p_kind, "prompt");
  assert.equal(rpc.body?.p_query, "kedi");
  assert.equal(rpc.body?.p_sort, "relevant");
  assert.equal(rpc.body?.p_content_type, "image");
  assert.deepEqual(rpc.body?.p_tag_slugs, ["karakter-tasarimi"]);
  assert.deepEqual(rpc.body?.p_tool_refs, ["midjourney"]);
  assert.equal(rpc.body?.p_limit, 3);

  const hydrate = fake.calls[1];
  assert.equal(hydrate.params.get("status"), "eq.published");
  assert.equal(hydrate.params.get("visibility"), "eq.public");
  assert.equal(hydrate.params.get("community_id"), "is.null");
  assert.equal(hydrate.params.get("deleted_at"), "is.null");

  assert.deepEqual(page.items.map((item) => item.id), [ID_B, ID_A]);
  const first = page.items[0];
  assert.equal(first.url, `${SITE}/share/prompt/${ID_B}/`);
  assert.deepEqual(first.tags, ["Portre"]);
  assert.deepEqual(first.variableNames, ["subject", "style"]);
  assert.deepEqual(first.stats, { likes: 3, saves: 2, comments: 1, copies: 9 });
  assert.equal(first.author.username, "ayse");
  // Sayfa doluydu → imleç veritabanının SON satırından (hydrate'te kaybolan dahil sıradaki) devam eder.
  assert.ok(page.nextCursor);
  assert.deepEqual(decodeCursor(page.nextCursor!), { r: 0, c: "2026-10-01T00:00:00Z", i: ID_A });
});

test("searchPrompts: empty query lists newest; short page ends; cursor round-trips into RPC", async () => {
  const fake = fakeFetch({ searchRows: [{ id: ID_A, created_at: "2026-10-01T00:00:00Z", sort_rank: "5" }], prompts: [row(ID_A)] });
  const page = await searchPrompts(client(fake), { limit: 10 });
  assert.equal(fake.calls[0].body?.p_query, null);
  assert.equal(fake.calls[0].body?.p_sort, "new");
  assert.equal(page.nextCursor, null);

  const cursor = Buffer.from(JSON.stringify({ r: 5, c: "2026-10-01T00:00:00Z", i: ID_A })).toString("base64url");
  const next = fakeFetch({ searchRows: [] });
  await searchPrompts(client(next), { cursor, sort: "popular" });
  assert.equal(next.calls[0].body?.p_after_rank, 5);
  assert.equal(next.calls[0].body?.p_after_id, ID_A);
  assert.equal(next.calls[0].body?.p_sort, "popular");
});

test("searchPrompts: rejects bad input before any request", async () => {
  const fake = fakeFetch();
  const isBad = (error: unknown) => error instanceof PublicApiError && error.code === "bad_request";
  await assert.rejects(searchPrompts(client(fake), { sort: "random" }), isBad);
  await assert.rejects(searchPrompts(client(fake), { contentType: "pdf" }), isBad);
  await assert.rejects(searchPrompts(client(fake), { limit: 0 }), isBad);
  await assert.rejects(searchPrompts(client(fake), { cursor: "not-a-cursor" }), isBad);
  await assert.rejects(searchPrompts(client(fake), { tools: ["bad tool!"] }), isBad);
  await assert.rejects(searchPrompts(client(fake), { category: "A B" }), isBad);
  assert.equal(fake.calls.length, 0);
});

test("searchPrompts: limit is capped at 50", async () => {
  const fake = fakeFetch();
  await searchPrompts(client(fake), { limit: 500 });
  assert.equal(fake.calls[0].body?.p_limit, 50);
});

test("popularPrompts: order, period window and content type go into the query", async () => {
  const fake = fakeFetch({ prompts: [row(ID_A)] });
  const now = new Date("2026-10-31T00:00:00.000Z");
  const items = await popularPrompts(client(fake), { period: "week", by: "likes", contentType: "video", limit: 5 }, now);
  const params = fake.calls[0].params;
  assert.equal(params.get("order"), "like_count.desc,copy_count.desc,created_at.desc,id.desc");
  assert.equal(params.get("created_at"), "gte.2026-10-24T00:00:00.000Z");
  assert.equal(params.get("content_type"), "eq.video");
  assert.equal(params.get("limit"), "5");
  assert.equal(params.get("community_id"), "is.null");
  assert.equal(items.length, 1);

  const all = fakeFetch({ prompts: [] });
  await popularPrompts(client(all));
  assert.equal(all.calls[0].params.get("created_at"), null);
  assert.match(all.calls[0].params.get("order") ?? "", /^copy_count\.desc/);
});

test("getPrompt: full prompt in exchange format with credit; image option data is not exported", async () => {
  const fake = fakeFetch({
    prompts: [row(ID_A, { tools: [], tool: "dall-e" })],
    variables: [
      { prompt_id: ID_A, name: "subject", default_value: "kedi", description: "Ne?", type: "text", options: [], config: {} },
      {
        prompt_id: ID_A,
        name: "style",
        default_value: "",
        description: null,
        type: "select",
        options: [
          { label: "Yağlı boya", value: "oil", image: "data:image/png;base64,AAAA" },
          { label: "Suluboya", value: "watercolor", color: "#123456" },
        ],
        config: {},
      },
    ],
  });
  const prompt = await getPrompt(client(fake), ID_A);
  assert.equal(prompt.promptText, "A {subject} in {style} style");
  assert.deepEqual(prompt.tools, ["dall-e"]);
  assert.deepEqual(prompt.source, { credit: "@ayse · Promptly", url: `${SITE}/share/prompt/${ID_A}/` });
  assert.equal(prompt.variables.length, 2);
  assert.deepEqual(prompt.variables[1].options, [
    { label: "Yağlı boya", value: "oil" },
    { label: "Suluboya", value: "watercolor", color: "#123456" },
  ]);
  assert.equal(fake.calls[1].params.get("prompt_id"), `in.(${ID_A})`);
});

test("getPrompt: invalid id is a bad request, an unreadable one is not_found", async () => {
  await assert.rejects(getPrompt(client(fakeFetch()), "abc"), (error: unknown) => error instanceof PublicApiError && error.code === "bad_request");
  await assert.rejects(getPrompt(client(fakeFetch({ prompts: [] })), ID_A), (error: unknown) => error instanceof PublicApiError && error.code === "not_found");
});

test("getPrompts: keeps requested order, skips unreadable and invalid ids, one variable query per 25", async () => {
  const fake = fakeFetch({ prompts: [row(ID_A), row(ID_B)] });
  const prompts = await getPrompts(client(fake), [ID_B, "nope", ID_GONE, ID_A]);
  assert.deepEqual(prompts.map((prompt) => prompt.id), [ID_B, ID_A]);
  assert.equal(fake.calls.filter((call) => call.path === "prompt_variables").length, 1);
});

test("fillPrompt: given values, defaults, missing and unknown keys; unmatched tokens stay literal", () => {
  const result = fillPrompt(
    {
      promptText: "A {subject} in {style} style, {mood}. {subject}!",
      variables: [{ name: "subject", defaultValue: "kedi", description: null, type: "text", options: [], config: {} }],
    },
    { style: "noir", typo: "x", list: undefined },
  );
  assert.equal(result.text, "A kedi in noir style, {mood}. kedi!");
  assert.deepEqual(result.values, { subject: "kedi", style: "noir" });
  assert.deepEqual(result.missing, ["mood"]);
  assert.deepEqual(result.unknown, ["typo"]);
  assert.equal(fillPrompt({ promptText: "{n} {on} {tags}", variables: [] }, { n: 3, on: true, tags: ["a", "b"] }).text, "3 true a, b");
  assert.throws(() => fillPrompt({ promptText: "{a}", variables: [] }, { a: { nested: 1 } }), PublicApiError);
});

test("promptSlug: ASCII, Turkish-aware, unique by id", () => {
  assert.equal(promptSlug("Işıklı Şehir Portresi!", ID_A), "isikli-sehir-portresi-11111111");
  // Ortak önekli seed kimlikleri ayrışır.
  assert.notEqual(promptSlug("Aynı", "5eed0001-0000-4000-8000-00000000002b"), promptSlug("Aynı", "5eed0001-0000-4000-8000-000000000039"));
  assert.equal(promptSlug("Aynı", "5eed0001-0000-4000-8000-00000000002b"), "ayni-0000002b");
  assert.equal(promptSlug("日本語", ID_B), "prompt-22222222");
});

test("routeOf: works with the function prefix and locally", () => {
  assert.equal(routeOf("/api/v1/prompts"), "/prompts");
  assert.equal(routeOf("/functions/v1/api/v1/prompts/x/fill"), "/prompts/x/fill");
  assert.equal(routeOf("/api/v1"), "/");
  assert.equal(routeOf("/api/v1/"), "/");
  assert.equal(routeOf("/api/prompts"), null);
});

function handler(fake: ReturnType<typeof fakeFetch>) {
  return createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fake.fetch } });
}

const BASE = "https://demo.supabase.co/functions/v1/api/v1";

test("http: search, popular and detail routes; CORS + cache headers", async () => {
  const fake = fakeFetch({ searchRows: [{ id: ID_A, created_at: "2026-10-01T00:00:00Z", sort_rank: 0 }], prompts: [row(ID_A)] });
  const api = handler(fake);

  const search = await api(new Request(`${BASE}/prompts?q=kedi&tag=portre,manzara&tool=midjourney&limit=1`));
  assert.equal(search.status, 200);
  assert.equal(search.headers.get("access-control-allow-origin"), "*");
  assert.equal(search.headers.get("cache-control"), "public, max-age=60");
  const body = (await search.json()) as { items: { id: string }[]; nextCursor: string | null };
  assert.equal(body.items[0].id, ID_A);
  assert.ok(body.nextCursor);
  assert.deepEqual(fake.calls[0].body?.p_tag_slugs, ["portre", "manzara"]);

  const popular = await api(new Request(`${BASE}/prompts/popular?period=month`));
  assert.equal(popular.status, 200);
  assert.equal(((await popular.json()) as { items: unknown[] }).items.length, 1);

  const detail = await api(new Request(`${BASE}/prompts/${ID_A}`));
  assert.equal(((await detail.json()) as { promptText: string }).promptText, "A {subject} in {style} style");
});

test("http: export download uses the exchange format", async () => {
  const api = handler(fakeFetch({ prompts: [row(ID_A)] }));
  const file = await api(new Request(`${BASE}/prompts/${ID_A}?format=json`));
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition") ?? "", /promptly-11111111\.json/);
  const parsed = JSON.parse(await file.text()) as { format: string; schemaVersion: number; items: { source: { credit: string } }[] };
  assert.equal(parsed.format, "promptly.prompts");
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.items[0].source.credit, "@ayse · Promptly");

  const markdown = await api(new Request(`${BASE}/prompts/${ID_A}?format=markdown`));
  assert.match(markdown.headers.get("content-type") ?? "", /text\/markdown/);
  const badFormat = await api(new Request(`${BASE}/prompts/${ID_A}?format=pdf`));
  assert.equal(badFormat.status, 400);
});

test("http: fill is POST-only, uncached and returns the credit", async () => {
  const api = handler(fakeFetch({ prompts: [row(ID_A)] }));
  const filled = await api(new Request(`${BASE}/prompts/${ID_A}/fill`, { method: "POST", body: JSON.stringify({ values: { subject: "fox", style: "ukiyo-e" } }) }));
  assert.equal(filled.status, 200);
  assert.equal(filled.headers.get("cache-control"), "no-store");
  const body = (await filled.json()) as { text: string; missing: string[]; source: { credit: string } };
  assert.equal(body.text, "A fox in ukiyo-e style");
  assert.deepEqual(body.missing, []);
  assert.equal(body.source.credit, "@ayse · Promptly");

  assert.equal((await api(new Request(`${BASE}/prompts/${ID_A}/fill`))).status, 405);
  assert.equal((await api(new Request(`${BASE}/prompts/${ID_A}/fill`, { method: "POST", body: "{nope" }))).status, 400);
  assert.equal((await api(new Request(`${BASE}/prompts/${ID_A}/fill`, { method: "POST", body: JSON.stringify({ values: [1] }) }))).status, 400);
  assert.equal((await api(new Request(`${BASE}/prompts/${ID_A}/fill`, { method: "POST", body: "x".repeat(70_000) }))).status, 400);
});

test("http: errors are JSON with codes; OPTIONS preflight; writes are refused", async () => {
  const api = handler(fakeFetch({ prompts: [] }));
  const missing = await api(new Request(`${BASE}/prompts/${ID_A}`));
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: "not_found", message: "Prompt not found." } });
  assert.equal(missing.headers.get("cache-control"), "no-store");

  assert.equal((await api(new Request(`${BASE}/prompts?sort=zzz`))).status, 400);
  assert.equal((await api(new Request(`${BASE}/prompts?limit=abc`))).status, 400);
  assert.equal((await api(new Request(`${BASE}/prompts`, { method: "POST" }))).status, 405);
  assert.equal((await api(new Request(`${BASE}/prompts/${ID_A}`, { method: "DELETE" }))).status, 405);
  assert.equal((await api(new Request(`${BASE}/users`))).status, 404);
  assert.equal((await api(new Request("https://demo.supabase.co/functions/v1/api/prompts"))).status, 404);
  const preflight = await api(new Request(`${BASE}/prompts`, { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods") ?? "", /POST/);

  const failing = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "k", fetch: fakeFetch({ status: 503 }).fetch }, onError: () => {} });
  assert.equal((await failing(new Request(`${BASE}/prompts/popular`))).status, 502);
});

test("http: index and OpenAPI document point at the same server and cover every route", async () => {
  const api = handler(fakeFetch());
  const index = (await (await api(new Request(`${BASE}`))).json()) as { docs: string; endpoints: string[] };
  assert.equal(index.docs, `${BASE}/openapi.json`);
  const doc = (await (await api(new Request(`${BASE}/openapi.json`))).json()) as { servers: { url: string }[]; paths: Record<string, Record<string, unknown>> };
  assert.equal(doc.servers[0].url, BASE);
  for (const endpoint of index.endpoints) {
    const [method, path] = endpoint.split(" ");
    assert.ok(doc.paths[path]?.[method.toLowerCase()], `${endpoint} documented`);
  }
  assert.deepEqual(Object.keys(openApiDocument("x").paths as object).sort(), ["/prompts", "/prompts/popular", "/prompts/{id}", "/prompts/{id}/fill"]);
});

test("http: hosted path shape (/api/v1/...) with publicBaseUrl advertises the external address", async () => {
  const external = "https://demo.supabase.co/functions/v1/api/v1";
  const api = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "k", fetch: fakeFetch({ prompts: [row(ID_A)] }).fetch }, publicBaseUrl: `${external}/` });
  const doc = (await (await api(new Request("http://localhost:9999/api/v1/openapi.json"))).json()) as { servers: { url: string }[] };
  assert.equal(doc.servers[0].url, external);
  assert.equal((await api(new Request(`http://localhost:9999/api/v1/prompts/${ID_A}`))).status, 200);
});
