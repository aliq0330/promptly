import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createRestClient, getPublicContent, searchPublicContent, PublicApiError } from "./index.ts";

const SITE = "https://aliq0330.github.io/promptly";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_PUB_PROMPT = "33333333-3333-4333-8333-333333333333";
const ID_PRIVATE_PROMPT = "44444444-4444-4444-8444-444444444444";

const author = { username: "ayse", display_name: "Ayşe" };
const common = { description: "Açıklama", category: "art", subcategory: null, tools: ["midjourney:v7"], like_count: 4, comment_count: 2, created_at: "2026-10-01T10:00:00.000Z" };

const TABLES: Record<string, unknown[]> = {
  prompt_requests: [
    { id: ID_A, title: "Neon şehir", ...common, creative_direction: "  Yağmurlu gece, neon tabelalar  ", content_type: "image", status: "open", response_count: 3, profiles: author, prompt_request_tags: [{ tags: { slug: "neon", label: "Neon" } }, { tags: null }] },
  ],
  presets: [
    { id: ID_A, title: "Sinematik", ...common, content_type: "image", selection: { lens: "135mm", style: "editorial" }, save_count: 1, profiles: author, preset_tags: [] },
  ],
  workflows: [
    {
      id: ID_A, title: "Logo zinciri", ...common, content_types: ["text", "image"], save_count: 5, profiles: author, workflow_tags: [],
      workflow_steps: [
        { id: "s2", position: 2, title: "Görsel", description: "", instructions: "Çiz", prompt_id: ID_PRIVATE_PROMPT, inputs: [{ id: "i1", label: "Metin" }], outputs: [], created_at: "2026-10-01T10:00:01Z" },
        { id: "s1", position: 1, title: "Metin", description: "Önce yaz", instructions: "Yaz", prompt_id: ID_PUB_PROMPT, inputs: [], outputs: [{ id: "o1", label: "Slogan" }], created_at: "2026-10-01T10:00:00Z" },
      ],
    },
  ],
  prompts: [{ id: ID_PUB_PROMPT, title: "Slogan yazarı" }],
};

interface Call { path: string; params: URLSearchParams; body: Record<string, unknown> | null }

function fakeFetch(options: { searchRows?: { id: string; created_at: string; sort_rank: number }[]; tables?: Record<string, unknown[]> } = {}) {
  const calls: Call[] = [];
  const tables = options.tables ?? TABLES;
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/rest/v1/", "");
    calls.push({ path, params: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path === "rpc/search_content") return Response.json(options.searchRows ?? []);
    const rows = tables[path];
    if (!rows) return new Response("nope", { status: 404 });
    const wanted = url.searchParams.get("id")?.replace(/^in\.\(|\)$/g, "").split(",") ?? [];
    return Response.json(wanted.length ? (rows as { id: string }[]).filter((row) => wanted.includes(row.id)) : rows);
  };
  return { calls, fetch: impl as typeof fetch };
}

const client = (fake: ReturnType<typeof fakeFetch>) => createRestClient({ url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fake.fetch });
const hit = { id: ID_A, created_at: "2026-10-01T10:00:00.000Z", sort_rank: 0 };

test("search: each kind asks search_content with ITS p_kind and reads its own table with the public filters", async () => {
  const cases = [["request", "prompt_requests"], ["preset", "presets"], ["workflow", "workflows"]] as const;
  for (const [kind, table] of cases) {
    const fake = fakeFetch({ searchRows: [hit] });
    const page = await searchPublicContent(client(fake), kind, { query: " neon ", limit: 5 });
    assert.equal(fake.calls[0].path, "rpc/search_content");
    assert.equal(fake.calls[0].body?.p_kind, kind);
    assert.equal(fake.calls[0].body?.p_query, "neon");
    assert.equal(fake.calls[0].body?.p_limit, 5);
    const rows = fake.calls[1];
    assert.equal(rows.path, table);
    assert.equal(rows.params.get("visibility"), "eq.public", `${kind} visibility`);
    assert.equal(rows.params.get("community_id"), "is.null", `${kind} community-only content is filtered`);
    if (kind === "request") {
      assert.equal(rows.params.get("is_draft"), "eq.false");
      assert.equal(rows.params.get("deleted_at"), "is.null");
    } else {
      assert.equal(rows.params.get("status"), "eq.published");
    }
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].kind, kind);
    assert.equal(page.items[0].url, `${SITE}/share/${kind}/${ID_A}/`);
    assert.equal(page.items[0].author.username, "ayse");
  }
});

test("search: summaries are kind-shaped (request status, workflow step count + chained types, tags without nulls)", async () => {
  const request = await searchPublicContent(client(fakeFetch({ searchRows: [hit] })), "request");
  assert.deepEqual(request.items[0].tags, ["Neon"]);
  assert.equal(request.items[0].requestStatus, "open");
  assert.equal(request.items[0].responseCount, 3);
  assert.deepEqual(request.items[0].contentTypes, ["image"]);
  const workflow = await searchPublicContent(client(fakeFetch({ searchRows: [hit], tables: { ...TABLES, workflows: [{ ...(TABLES.workflows[0] as object), workflow_steps: [{ count: 2 }] }] } })), "workflow");
  assert.equal(workflow.items[0].stepCount, 2);
  assert.deepEqual(workflow.items[0].contentTypes, ["text", "image"]);
  assert.equal("steps" in workflow.items[0], false, "the list never carries the steps");
});

test("search: a hit that is not readable publicly (community-only / draft) is dropped, and the cursor still advances from the database's last row", async () => {
  const fake = fakeFetch({ searchRows: [hit, { id: ID_B, created_at: "2026-09-30T00:00:00.000Z", sort_rank: 0 }], tables: { ...TABLES } });
  const page = await searchPublicContent(client(fake), "preset", { limit: 2 });
  assert.deepEqual(page.items.map((item) => item.id), [ID_A], "ID_B is not in the table → not returned");
  assert.ok(page.nextCursor, "a full database page means there may be more");
  const next = await searchPublicContent(client(fakeFetch({ searchRows: [] })), "preset", { limit: 2 });
  assert.equal(next.nextCursor, null);
});

test("search: bad input is a 400, not a database call", async () => {
  const fake = fakeFetch();
  await assert.rejects(() => searchPublicContent(client(fake), "prompt" as "request"), PublicApiError);
  await assert.rejects(() => searchPublicContent(client(fake), "request", { limit: 0 }), PublicApiError);
  await assert.rejects(() => searchPublicContent(client(fake), "request", { sort: "random" }), PublicApiError);
  await assert.rejects(() => searchPublicContent(client(fake), "request", { contentType: "pdf" }), PublicApiError);
  assert.equal(fake.calls.length, 0);
});

test("get: request carries the trimmed creative direction; preset carries its selection; both 404 when not public", async () => {
  const request = await getPublicContent(client(fakeFetch()), "request", ID_A);
  assert.equal(request.creativeDirection, "Yağmurlu gece, neon tabelalar");
  const preset = await getPublicContent(client(fakeFetch()), "preset", ID_A);
  assert.deepEqual(preset.selection, { lens: "135mm", style: "editorial" });
  await assert.rejects(() => getPublicContent(client(fakeFetch()), "preset", ID_B), (error: unknown) => error instanceof PublicApiError && error.code === "not_found");
  await assert.rejects(() => getPublicContent(client(fakeFetch()), "workflow", "not-a-uuid"), (error: unknown) => error instanceof PublicApiError && error.code === "bad_request");
});

test("get workflow: steps are ordered 1..n, a PUBLIC prompt is linked by id + title only, a private one is not mentioned at all", async () => {
  const fake = fakeFetch();
  const workflow = await getPublicContent(client(fake), "workflow", ID_A);
  assert.deepEqual(workflow.steps?.map((step) => step.position), [1, 2]);
  assert.equal(workflow.steps?.[0].title, "Metin");
  assert.deepEqual(workflow.steps?.[0].prompt, { id: ID_PUB_PROMPT, title: "Slogan yazarı", url: `${SITE}/share/prompt/${ID_PUB_PROMPT}/` });
  assert.equal(workflow.steps?.[1].prompt, null, "the private prompt's id and title never reach the answer");
  assert.ok(!JSON.stringify(workflow).includes(ID_PRIVATE_PROMPT));
  assert.equal(workflow.stepCount, 2);
  const promptCall = fake.calls.find((call) => call.path === "prompts");
  assert.equal(promptCall?.params.get("visibility"), "eq.public");
  assert.equal(promptCall?.params.get("status"), "eq.published");
  assert.equal(promptCall?.params.get("community_id"), "is.null");
  assert.ok(!promptCall?.params.get("select")?.includes("prompt_text"), "prompt text is never selected here");
});

test("http: GET /requests, /presets, /workflows and their {id} routes; other methods are 405; no key is needed", async () => {
  const fake = fakeFetch({ searchRows: [hit] });
  const handler = createApiHandler({ config: { url: "https://demo.supabase.co", anonKey: "eyJ.k", fetch: fake.fetch } });
  const base = "https://demo.supabase.co/functions/v1/api/v1";
  const list = await handler(new Request(`${base}/workflows?q=logo&tag=neon&tool=gpt-image:gpt-image-1`));
  assert.equal(list.status, 200);
  assert.equal(fake.calls[0].body?.p_kind, "workflow");
  assert.deepEqual(fake.calls[0].body?.p_tag_slugs, ["neon"]);
  assert.deepEqual(fake.calls[0].body?.p_tool_refs, ["gpt-image:gpt-image-1"]);
  assert.equal((await handler(new Request(`${base}/presets/${ID_A}`))).status, 200);
  assert.equal((await handler(new Request(`${base}/requests/${ID_B}`))).status, 404);
  assert.equal((await handler(new Request(`${base}/requests`, { method: "POST", body: "{}" }))).status, 405);
  assert.equal((await handler(new Request(`${base}/requests/${ID_A}/extra`))).status, 404);
  const index = (await (await handler(new Request(base))).json()) as { endpoints: string[] };
  assert.ok(index.endpoints.includes("GET /workflows/{id}") && index.endpoints.includes("GET /presets"));
});
