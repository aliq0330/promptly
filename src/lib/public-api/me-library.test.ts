import { test } from "node:test";
import assert from "node:assert/strict";
import { createApiHandler, createMeBackend, getLibraryPrompts, listMyLibraries, type MeDb, type MeTx } from "./index.ts";

const SITE = "https://aliq0330.github.io/promptly";
const KEY = "pmt_" + "A".repeat(43);
const USER = "11111111-1111-4111-8111-111111111111";
const LIB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Rows = Record<string, unknown>[];

const LIBRARIES: Rows = [{ id: LIB, title: "Pazarlama ekibi", description: "Ortak promptlar", role: "viewer", approved_count: 2, updated_at: new Date("2026-11-06T10:00:00Z") }];
const PROMPTS: Rows = [
  { id: "p1", title: "Satış e-postası", body: "Merhaba {musteri}, {marka_adi} adına yazıyorum. Ton: {ton}", group_name: "Pazarlama", approved_at: new Date("2026-11-05T10:00:00Z"), updated_at: new Date("2026-11-05T10:00:00Z") },
  { id: "p2", title: "Düz metin", body: "Değişken yok.", group_name: null, approved_at: null, updated_at: new Date("2026-11-05T11:00:00Z") },
];
const VARIABLES: Rows = [{ name: "marka_adi", value: "Acme" }, { name: "ton", value: "" }];

function fakeDb(seen: string[] = []) {
  const db: MeDb = {
    async transaction<T>(fn: (tx: MeTx) => Promise<T>): Promise<T> {
      const tx: MeTx = async (sql, params = []) => {
        seen.push(sql);
        if (sql.includes("_api_token_authenticate")) return [{ token_id: "tok-1", user_id: USER, scopes: ["read"] }];
        if (sql.startsWith("set local role") || sql.includes("set_config") || sql.includes("api_me_throttle")) return [];
        if (sql.includes("api_me_libraries")) return LIBRARIES;
        if (sql.includes("api_me_library_prompts")) return params[1] === true ? PROMPTS : PROMPTS.filter((p) => p.approved_at);
        if (sql.includes("api_me_library_variables")) return VARIABLES;
        return [];
      };
      return fn(tx);
    },
  };
  return db;
}

const tx = (seen: string[] = []) => async (sql: string, params: unknown[] = []) => {
  let out: Rows = [];
  await fakeDb(seen).transaction(async (inner) => {
    out = await inner(sql, params);
  });
  return out;
};

test("listMyLibraries: üyesi olunan kütüphaneler, rol ve onaylı sayısıyla, site adresiyle", async () => {
  const { items } = await listMyLibraries(tx(), SITE);
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].id, items[0].role, items[0].approvedCount], [LIB, "viewer", 2]);
  assert.ok(items[0].url.startsWith(SITE) && items[0].url.includes(LIB));
  assert.equal(items[0].updatedAt, "2026-11-06T10:00:00.000Z");
});

test("getLibraryPrompts: ortak değişkenler doldurulur, değeri olmayan jeton aynen kalır ve missing'e yazılır; boş ortak değer 'yok' sayılır", async () => {
  const result = await getLibraryPrompts(tx(), SITE, LIB);
  assert.equal(result.includesUnapproved, false);
  assert.equal(result.prompts.length, 1, "varsayılan: yalnız onaylılar");
  const [p] = result.prompts;
  assert.equal(p.approved, true);
  assert.equal(p.group, "Pazarlama");
  assert.deepEqual(p.variables, ["musteri", "marka_adi", "ton"]);
  assert.equal(p.filledText, "Merhaba {musteri}, Acme adına yazıyorum. Ton: {ton}");
  assert.deepEqual(p.missing, ["musteri", "ton"]);
  assert.equal(p.text, "Merhaba {musteri}, {marka_adi} adına yazıyorum. Ton: {ton}", "ham metin değişmez");
  assert.deepEqual(result.sharedVariables, [{ name: "marka_adi", value: "Acme" }, { name: "ton", value: "" }]);
});

test("getLibraryPrompts: include_unapproved taslakları da getirir ve onay durumunu işaretler", async () => {
  const result = await getLibraryPrompts(tx(), SITE, LIB, { includeUnapproved: true });
  assert.equal(result.includesUnapproved, true);
  assert.deepEqual(result.prompts.map((p) => p.approved), [true, false]);
  assert.equal(result.prompts[1].approvedAt, null);
  assert.deepEqual(result.prompts[1].missing, []);
});

test("getLibraryPrompts: üyesi olunmayan / var olmayan kütüphane not_found (varlığı sızmaz), geçersiz kimlik bad_request", async () => {
  await assert.rejects(() => getLibraryPrompts(tx(), SITE, OTHER), (error: { code?: string }) => error.code === "not_found");
  await assert.rejects(() => getLibraryPrompts(tx(), SITE, "bozuk"), (error: { code?: string }) => error.code === "bad_request");
});

test("HTTP: /v1/me/libraries ve /v1/me/libraries/{id}/prompts anahtarla çalışır, yalnız GET, kişisel yanıt önbelleklenmez", async () => {
  const seen: string[] = [];
  const handler = createApiHandler({
    config: { url: "https://x.supabase.co", anonKey: "anon" },
    publicBaseUrl: "https://x.supabase.co/functions/v1/api/v1",
    me: createMeBackend({ db: fakeDb(seen), siteUrl: SITE }),
  });
  const base = "https://x.supabase.co/functions/v1/api/v1";
  const call = (path: string, init: RequestInit = {}) => handler(new Request(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${KEY}` } }));

  const list = await call("/me/libraries");
  assert.equal(list.status, 200);
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.equal(((await list.json()) as { items: unknown[] }).items.length, 1);

  const prompts = await call(`/me/libraries/${LIB}/prompts?include=unapproved`);
  assert.equal(prompts.status, 200);
  assert.equal(((await prompts.json()) as { prompts: unknown[] }).prompts.length, 2);

  assert.equal((await call(`/me/libraries/${LIB}/prompts?include=hepsi`)).status, 400);
  assert.equal((await call(`/me/libraries/${OTHER}/prompts`)).status, 404);
  assert.equal((await call("/me/libraries", { method: "POST", body: "{}" })).status, 405);
  assert.equal((await handler(new Request(`${base}/me/libraries`))).status, 401, "anahtarsız istek reddedilir");
  assert.ok(seen.every((sql) => !/\binsert\b|\bupdate\b|\bdelete\b/i.test(sql)), "yüzey yalnız okur: hiçbir yazma SQL'i yok");
});
