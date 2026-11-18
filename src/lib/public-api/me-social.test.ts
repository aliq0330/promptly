import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createMeBackend, type MeDb, type MeTx } from "./index.ts";

const SITE = "https://aliq0330.github.io/promptly";
const KEY = "pmt_" + "A".repeat(43);
const USER = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const COL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Rows = Record<string, unknown>[];
interface Call { sql: string; params: unknown[] }

function fakeDb(scopes: string[], query: (sql: string, params: unknown[]) => Rows | Error = () => []) {
  const calls: Call[] = [];
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.includes("_api_token_authenticate")) return [{ token_id: "tok-1", user_id: USER, scopes }];
        if (sql.startsWith("set local role") || sql.includes("set_config") || sql.includes("api_me_throttle")) return [];
        const out = query(sql, params);
        if (out instanceof Error) throw out;
        return out;
      };
      return fn(tx);
    },
  };
  return { db, calls };
}

function promptRow(id: string, title: string) {
  return {
    id, title, description: "d", prompt_text: "metin {x}", content_type: "text", category: null, subcategory: null, tool: null, tools: [],
    like_count: 3, save_count: 1, comment_count: 0, copy_count: 2, created_at: "2026-11-01T10:00:00+00:00",
    profiles: { username: "ayse", display_name: "Ayşe" }, prompt_tags: [], prompt_media: [], prompt_works_stats: { yes_count: 4, no_count: 1 },
  };
}

/** Sahte PostgREST: tablo adına göre satır döner, her isteği kaydeder. */
function fakeRest(tables: Record<string, unknown[] | ((params: URLSearchParams) => unknown[])>) {
  const requests: { table: string; params: URLSearchParams }[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.replace(/^.*\/rest\/v1\//, "");
    requests.push({ table, params: url.searchParams });
    const source = tables[table] ?? [];
    return new Response(JSON.stringify(typeof source === "function" ? source(url.searchParams) : source), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetchImpl, requests };
}

function handlerWith(db: MeDb, rest = fakeRest({})) {
  return {
    rest,
    handler: createApiHandler({
      config: { url: "https://x.supabase.co", anonKey: "anon", fetch: rest.fetchImpl, siteUrl: SITE },
      publicBaseUrl: "https://x.supabase.co/functions/v1/api/v1",
      me: createMeBackend({ db, siteUrl: SITE }),
    }),
  };
}

const req = (path: string, method = "GET", body?: unknown, key: string | null = KEY) =>
  new Request(`https://x.supabase.co/functions/v1/api/v1${path}`, {
    method,
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ---------------------------------------------------------------------------------------------------------------------
// Akış
// ---------------------------------------------------------------------------------------------------------------------

test("GET /me/feed: Sana özel by default; the database returns ids + order, the cards are hydrated through the ANON rest client", async () => {
  const { db, calls } = fakeDb(["read"], (sql) =>
    sql.includes("api_me_feed")
      ? [
          { id: P1, sort_rank: "700", reason_kind: "tag", reason_ref: "neon", created_cursor: "2026-11-01T10:00:00.123456Z" },
          { id: P2, sort_rank: "300", reason_kind: "popular", reason_ref: null, created_cursor: "2026-10-30T10:00:00.000001Z" },
        ]
      : []);
  const rest = fakeRest({ prompts: [promptRow(P2, "İkinci"), promptRow(P1, "Birinci")] });
  const { handler } = handlerWith(db, rest);
  const response = await handler(req("/me/feed?limit=2"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.tab, "for_you");
  assert.deepEqual(body.items.map((item: { title: string }) => item.title), ["Birinci", "İkinci"], "order follows the database, not the hydration query");
  assert.deepEqual(body.items[0].reason, { kind: "tag", ref: "neon" });
  assert.equal(body.items[0].works.yes, 4);
  assert.ok(body.nextCursor, "a full page yields a cursor");
  const feedCall = calls.find((c) => c.sql.includes("api_me_feed"))!;
  assert.equal(feedCall.params[0], "for_you");
  assert.ok(typeof feedCall.params[1] === "string" && !Number.isNaN(Date.parse(String(feedCall.params[1]))), "as_of is pinned on the first page");
  const hydrate = rest.requests.find((r) => r.table === "prompts")!;
  assert.equal(hydrate.params.get("status"), "eq.published", "only public prompts are hydrated");
  assert.equal(hydrate.params.get("visibility"), "eq.public");
  assert.equal(hydrate.params.get("community_id"), "is.null");
});

test("GET /me/feed: the cursor carries the keyset and the pinned as_of to the next page; microseconds survive", async () => {
  let page = 0;
  const { db, calls } = fakeDb(["read"], (sql) => {
    if (!sql.includes("api_me_feed")) return [];
    page += 1;
    return page === 1
      ? [{ id: P1, sort_rank: "700", reason_kind: "creator", reason_ref: null, created_cursor: "2026-11-01T10:00:00.123456Z" }]
      : [];
  });
  const { handler } = handlerWith(db, fakeRest({ prompts: [promptRow(P1, "Birinci")] }));
  const first = await (await handler(req("/me/feed?limit=1"))).json();
  const asOf = calls.find((c) => c.sql.includes("api_me_feed"))!.params[1];
  const second = await handler(req(`/me/feed?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).nextCursor, null, "a short page ends the feed");
  const next = calls.filter((c) => c.sql.includes("api_me_feed"))[1];
  assert.equal(next.params[1], asOf, "as_of is reused so the ranking does not drift");
  assert.equal(next.params[4], 700);
  assert.equal(next.params[5], "2026-11-01T10:00:00.123456Z");
  assert.equal(next.params[6], P1);
});

test("GET /me/feed: Takip ettiklerim has no as_of; a bad tab, content_type, limit or cursor is a 400 before the database is asked", async () => {
  const { db, calls } = fakeDb(["read"], () => []);
  const { handler } = handlerWith(db);
  assert.equal((await handler(req("/me/feed?tab=following"))).status, 200);
  assert.equal(calls.find((c) => c.sql.includes("api_me_feed"))!.params[1], null);
  for (const bad of ["tab=hot", "content_type=gif", "limit=0", "limit=99", "cursor=garbage"]) {
    const before = calls.length;
    assert.equal((await handler(req(`/me/feed?${bad}`))).status, 400, bad);
    assert.equal(calls.filter((c) => c.sql.includes("api_me_feed")).length, 1, `${bad} never reaches the RPC`);
    void before;
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// Koleksiyonlar ve benim durumum
// ---------------------------------------------------------------------------------------------------------------------

test("GET /me/collections and /me/collections/{id}/prompts", async () => {
  const { db, calls } = fakeDb(["read"], (sql) => {
    if (sql.includes("api_me_collections")) return [{ id: COL, name: "Logolar", visibility: "private", prompt_count: 4, is_shared: false, mine: true, owner_username: "ayse" }];
    if (sql.includes("api_me_collection_prompts")) return [{ id: P1, added_cursor: "2026-11-02T00:00:00.000001Z" }];
    return [];
  });
  const { handler } = handlerWith(db, fakeRest({ prompts: [promptRow(P1, "Birinci")] }));
  const list = await (await handler(req("/me/collections"))).json();
  assert.deepEqual(list.items, [{ id: COL, name: "Logolar", visibility: "private", promptCount: 4, shared: false, mine: true, ownerUsername: "ayse" }]);
  const prompts = await (await handler(req(`/me/collections/${COL}/prompts?limit=5`))).json();
  assert.equal(prompts.items[0].title, "Birinci");
  assert.equal(prompts.nextCursor, null);
  const call = calls.find((c) => c.sql.includes("api_me_collection_prompts"))!;
  assert.equal(call.params[0], COL);
  assert.equal(call.params[1], 6, "one extra row is asked to know whether there is a next page");
  assert.equal((await handler(req("/me/collections/not-a-uuid/prompts"))).status, 400);
});

test("GET /me/engagement: my state by prompt id; ids are validated (1–30 UUIDs)", async () => {
  const { db, calls } = fakeDb(["read"], (sql) =>
    sql.includes("api_me_engagement")
      ? [{ prompt_id: P1, reaction: "fire", saved: true, collection_ids: [COL], author_username: "ayse", following_author: true, works_yes: 4, works_no: 1, my_vote: true, can_vote: true }]
      : []);
  const { handler } = handlerWith(db);
  const body = await (await handler(req(`/me/engagement?ids=${P1},${P2}`))).json();
  assert.deepEqual(body.items[P1], { reaction: "fire", saved: true, collectionIds: [COL], authorUsername: "ayse", followingAuthor: true, works: { yes: 4, no: 1, myVote: true, canVote: true } });
  assert.equal(body.items[P2], undefined, "a prompt that is not readable is simply absent");
  assert.equal(calls.find((c) => c.sql.includes("api_me_engagement"))!.params[0], `{${P1},${P2}}`);
  assert.equal((await handler(req("/me/engagement"))).status, 400);
  assert.equal((await handler(req("/me/engagement?ids=nope"))).status, 400);
  const many = Array.from({ length: 31 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`).join(",");
  assert.equal((await handler(req(`/me/engagement?ids=${many}`))).status, 400);
});

// ---------------------------------------------------------------------------------------------------------------------
// Yazma: `interact` kapsamı
// ---------------------------------------------------------------------------------------------------------------------

test("every interact write needs the interact scope: read and write keys get 403 and the database is never asked to write", async () => {
  for (const scopes of [["read"], ["read", "write"]]) {
    const { db, calls } = fakeDb(scopes);
    const { handler } = handlerWith(db);
    for (const [method, path] of [
      ["PUT", `/me/prompts/${P1}/reaction`], ["DELETE", `/me/prompts/${P1}/reaction`],
      ["PUT", `/me/prompts/${P1}/saved`], ["DELETE", `/me/prompts/${P1}/saved`],
      ["PUT", `/me/prompts/${P1}/works`], ["DELETE", `/me/prompts/${P1}/works`],
      ["PUT", `/me/collections/${COL}/prompts/${P1}`], ["DELETE", `/me/collections/${COL}/prompts/${P1}`],
      ["PUT", "/me/following/ayse"], ["DELETE", "/me/following/ayse"],
    ]) {
      const response = await handler(req(path, method, method === "PUT" ? {} : undefined));
      assert.equal(response.status, 403, `${method} ${path} with ${scopes.join("+")}`);
    }
    assert.ok(!calls.some((c) => /api_me_react|api_me_set_|api_me_collection_item|set_prompt_works/.test(c.sql)));
  }
});

test("PUT/DELETE reaction, saved, works, collection item and follow: the right RPC with the right arguments; the interact bucket is throttled", async () => {
  const { db, calls } = fakeDb(["read", "interact"], (sql) => {
    if (sql.includes("api_me_react")) return [{ reaction: "idea" }];
    if (sql.includes("api_me_set_saved")) return [{ saved: true }];
    if (sql.includes("api_me_collection_item")) return [{ present: true }];
    if (sql.includes("api_me_set_follow")) return [{ following: true }];
    if (sql.includes("set_prompt_works")) return [{ yes_count: 5, no_count: 1, my_vote: true }];
    return [];
  });
  const { handler } = handlerWith(db);
  assert.deepEqual(await (await handler(req(`/me/prompts/${P1}/reaction`, "PUT", { reaction: "idea" }))).json(), { reaction: "idea" });
  assert.deepEqual(calls.find((c) => c.sql.includes("api_me_react"))!.params, [P1, "idea"]);
  await handler(req(`/me/prompts/${P1}/reaction`, "PUT", {}));
  assert.equal(calls.filter((c) => c.sql.includes("api_me_react"))[1].params[1], "love", "no body = the default reaction");
  await handler(req(`/me/prompts/${P1}/reaction`, "DELETE"));
  assert.equal(calls.filter((c) => c.sql.includes("api_me_react"))[2].params[1], null, "DELETE undoes it");
  assert.deepEqual(await (await handler(req(`/me/prompts/${P1}/saved`, "PUT"))).json(), { saved: true });
  assert.deepEqual(calls.find((c) => c.sql.includes("api_me_set_saved"))!.params, [P1, true]);
  await handler(req(`/me/prompts/${P1}/saved`, "DELETE"));
  assert.deepEqual(calls.filter((c) => c.sql.includes("api_me_set_saved"))[1].params, [P1, false]);
  assert.deepEqual(await (await handler(req(`/me/prompts/${P1}/works`, "PUT", { works: false }))).json(), { works: { yes: 5, no: 1, myVote: true } });
  assert.deepEqual(calls.find((c) => c.sql.includes("set_prompt_works"))!.params, [P1, false]);
  await handler(req(`/me/prompts/${P1}/works`, "DELETE"));
  assert.deepEqual(calls.filter((c) => c.sql.includes("set_prompt_works"))[1].params, [P1, null]);
  assert.deepEqual(await (await handler(req(`/me/collections/${COL}/prompts/${P1}`, "PUT"))).json(), { inCollection: true });
  assert.deepEqual(calls.find((c) => c.sql.includes("api_me_collection_item"))!.params, [COL, P1, true]);
  await handler(req(`/me/collections/${COL}/prompts/${P1}`, "DELETE"));
  assert.deepEqual(calls.filter((c) => c.sql.includes("api_me_collection_item"))[1].params, [COL, P1, false]);
  assert.deepEqual(await (await handler(req("/me/following/ayse", "PUT"))).json(), { following: true });
  assert.deepEqual(calls.find((c) => c.sql.includes("api_me_set_follow"))!.params, ["ayse", true]);
  assert.ok(calls.some((c) => c.sql.includes("api_me_throttle_kind") && c.params[0] === "interact"));
});

test("interact writes validate before the database: bad reaction/works/ids/username are 400; wrong methods are 405", async () => {
  const { db, calls } = fakeDb(["read", "interact"]);
  const { handler } = handlerWith(db);
  assert.equal((await handler(req(`/me/prompts/${P1}/reaction`, "PUT", { reaction: "angry" }))).status, 400);
  assert.equal((await handler(req(`/me/prompts/${P1}/works`, "PUT", { works: "yes" }))).status, 400);
  assert.equal((await handler(req("/me/prompts/not-a-uuid/saved", "PUT"))).status, 400);
  assert.equal((await handler(req(`/me/collections/nope/prompts/${P1}`, "PUT"))).status, 400);
  assert.equal((await handler(req("/me/following/bad%20name!", "PUT"))).status, 400);
  assert.equal((await handler(req(`/me/prompts/${P1}/reaction`, "GET"))).status, 405);
  assert.equal((await handler(req(`/me/prompts/${P1}/saved`, "POST", {}))).status, 405);
  assert.equal((await handler(req("/me/following/ayse", "PATCH", {}))).status, 405);
  assert.ok(!calls.some((c) => /api_me_react|api_me_set_|api_me_collection_item|set_prompt_works/.test(c.sql)));
});

test("the database's short codes become HTTP answers: not_found → 404, copy_required/self-vote/blocked → 422, rate_limit → 429, anything else does not leak", async () => {
  for (const [message, status] of [
    ["not_found", 404], ["collection_not_found", 404], ["copy_required", 422], ["self_vote_not_allowed", 422], ["self_like_not_allowed", 422],
    ["self_follow_not_allowed", 422], ["interaction_blocked", 422], ["rate_limit", 429], ["invalid_reaction", 400], ["relation \"secret_table\" does not exist", 502],
  ] as const) {
    const { db } = fakeDb(["interact"], () => new Error(message));
    const { handler } = handlerWith(db);
    const response = await handler(req(`/me/prompts/${P1}/works`, "PUT", { works: true }));
    assert.equal(response.status, status, message);
    assert.ok(!(await response.text()).includes("secret_table"));
  }
});

test("CORS allows the PUT and DELETE the new endpoints use", async () => {
  const { db } = fakeDb(["read"]);
  const { handler } = handlerWith(db);
  const response = await handler(new Request("https://x.supabase.co/functions/v1/api/v1/me/following/ayse", { method: "OPTIONS" }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /PUT/);
  assert.match(response.headers.get("access-control-allow-methods") ?? "", /DELETE/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Herkese açık alt kaynaklar
// ---------------------------------------------------------------------------------------------------------------------

test("GET /prompts/{id}/comments: top-level newest first with replies attached oldest first; the prompt must be public first", async () => {
  const comment = (id: string, parent: string | null, body: string, at: string) => ({ id, parent_id: parent, body, like_count: 2, pinned_at: null, edited_at: null, created_at: at, profiles: { username: "ali", display_name: "Ali" } });
  const rest = fakeRest({
    prompts: [{ id: P1 }],
    prompt_comments: (params) =>
      params.get("parent_id") === "is.null"
        ? [comment("d0000000-0000-4000-8000-000000000001", null, "Üst yorum", "2026-11-03T00:00:00.000002+00:00")]
        : [comment("d0000000-0000-4000-8000-000000000002", "d0000000-0000-4000-8000-000000000001", "Yanıt", "2026-11-03T01:00:00+00:00")],
  });
  const { handler } = handlerWith(fakeDb(["read"]).db, rest);
  const response = await handler(req(`/prompts/${P1}/comments`, "GET", undefined, null));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.items[0].text, "Üst yorum");
  assert.equal(body.items[0].replies[0].text, "Yanıt");
  assert.equal(body.items[0].author.username, "ali");
  assert.equal(body.nextCursor, null);
  const check = rest.requests[0];
  assert.equal(check.table, "prompts");
  assert.equal(check.params.get("status"), "eq.published");
  assert.equal(check.params.get("community_id"), "is.null");
  const top = rest.requests.find((r) => r.table === "prompt_comments")!;
  assert.equal(top.params.get("deleted_at"), "is.null");
  assert.equal(top.params.get("order"), "created_at.desc,id.desc");
});

test("GET /prompts/{id}/comments|results|versions: an unknown or non-public prompt is a 404 and nothing else is read; a bad id or cursor is a 400", async () => {
  const rest = fakeRest({ prompts: [] });
  const { handler } = handlerWith(fakeDb(["read"]).db, rest);
  for (const sub of ["comments", "results", "versions"]) {
    assert.equal((await handler(req(`/prompts/${P1}/${sub}`, "GET", undefined, null))).status, 404, sub);
    assert.equal((await handler(req(`/prompts/nope/${sub}`, "GET", undefined, null))).status, 400, sub);
    assert.equal((await handler(req(`/prompts/${P1}/${sub}`, "POST", {}, null))).status, 405, sub);
  }
  assert.ok(rest.requests.every((r) => r.table === "prompts"));
  const ok = handlerWith(fakeDb(["read"]).db, fakeRest({ prompts: [{ id: P1 }] })).handler;
  assert.equal((await ok(req(`/prompts/${P1}/comments?cursor=garbage`, "GET", undefined, null))).status, 400);
  assert.equal((await ok(req(`/prompts/${P1}/comments?limit=0`, "GET", undefined, null))).status, 400);
});

test("GET /prompts/{id}/versions: newest version first, paged by version number", async () => {
  const version = (n: number) => ({ id: `e0000000-0000-4000-8000-00000000000${n}`, version_number: n, title: `v${n}`, description: "d", prompt_text: `metin ${n}`, tool: null, source: "edit", created_at: `2026-11-0${n}T00:00:00+00:00`, profiles: { username: "ali", display_name: null } });
  const rest = fakeRest({ prompts: [{ id: P1 }], prompt_versions: [version(3), version(2), version(1)] });
  const { handler } = handlerWith(fakeDb(["read"]).db, rest);
  const first = await (await handler(req(`/prompts/${P1}/versions?limit=2`, "GET", undefined, null))).json();
  assert.deepEqual(first.items.map((item: { versionNumber: number }) => item.versionNumber), [3, 2]);
  assert.ok(first.nextCursor);
  await handler(req(`/prompts/${P1}/versions?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`, "GET", undefined, null));
  const second = rest.requests.filter((r) => r.table === "prompt_versions")[1];
  assert.equal(second.params.get("version_number"), "lt.2");
  assert.equal(second.params.get("order"), "version_number.desc,id.desc");
});

test("GET /prompts/{id}/results: author, text and a signed thumbnail for image results; a signing failure does not fail the list", async () => {
  const row = (id: string, type: string, url: string | null) => ({
    id, media_type: type, media_url: url, thumbnail_url: null, text_content: "x".repeat(900), tool: "midjourney", has_modification: true, modification_summary: "değiştirdim",
    like_count: 5, comment_count: 1, created_at: "2026-11-04T00:00:00+00:00", profiles: { username: "ayse", display_name: "Ayşe" },
  });
  const rest = fakeRest({
    prompts: [{ id: P1 }],
    prompt_results: [row("f0000000-0000-4000-8000-000000000001", "image", "https://x.supabase.co/storage/v1/object/sign/result-media/u/a.jpg?token=old"), row("f0000000-0000-4000-8000-000000000002", "text", null)],
  });
  const signing: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/storage/v1/object/sign/result-media")) return new Response(JSON.stringify([{ signedURL: "/object/sign/result-media/u/a.jpg?token=fresh" }]), { status: 200 });
    return rest.fetchImpl(input, init);
  };
  const handler = createApiHandler({ config: { url: "https://x.supabase.co", anonKey: "anon", fetch: signing, siteUrl: SITE } });
  const body = await (await handler(req(`/prompts/${P1}/results`, "GET", undefined, null))).json();
  assert.match(body.items[0].imageUrl, /^https:\/\/x\.supabase\.co\/storage\/v1\/object\/sign\/result-media\/u\/a\.jpg\?token=fresh$/);
  assert.equal(body.items[1].imageUrl, null);
  assert.ok(body.items[0].text.length <= 600, "result text is clipped");
  assert.equal(body.items[0].modified, true);
  assert.match(body.items[0].url, /\/results\/local\?id=f0000000/);
  const failing: typeof fetch = async (input, init) => (String(input).includes("/storage/v1/") ? new Response("nope", { status: 500 }) : rest.fetchImpl(input, init));
  const again = createApiHandler({ config: { url: "https://x.supabase.co", anonKey: "anon", fetch: failing, siteUrl: SITE } });
  const response = await again(req(`/prompts/${P1}/results`, "GET", undefined, null));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).items[0].imageUrl, null);
});
