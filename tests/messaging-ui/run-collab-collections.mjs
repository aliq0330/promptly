// Ortak koleksiyon (docs/history/386-*) — ağ taklitli. Gerçek Supabase'e KARŞI DENENMEDİ; DB tarafı `supabase/tests/collaborative-collections.sql`.
// Taklit, RLS ve tetikleyici kurallarının istemciyi ilgilendiren kısmını bellekte yeniden üretir: özel ortak koleksiyonu ortak olmayan görmez,
// içeriği yalnız ekleyen kaldırır (`added_by`), eklemeyi yalnız ortak yapar, RPC'ler `collection_*` hata kodlarını atar.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, U } from "./mock.mjs";

const BASE = "http://localhost:4187/promptly";
const server = await serve(4187);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const ONLY = process.env.ONLY ?? "";

const C1 = "c7000000-0000-4000-8000-000000000001"; // herkese açık ortak koleksiyon (sahip: alice, ortak: bobby)
const C2 = "c7000000-0000-4000-8000-000000000002"; // ÖZEL ortak koleksiyon (sahip: alice, ortak: bobby)
const C3 = "c7000000-0000-4000-8000-000000000003"; // sıradan koleksiyon (sahip: alice)
const SYS = "c7000000-0000-4000-8000-0000000000aa";
const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests", "is_demo"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
const ALICE = U.alice.id;
const BOB = U.bob.id;
const CAROL = U.carol.id;

const promptRow = (n, author) => ({
  id: `b7000000-0000-4000-8000-00000000000${n}`, title: `Prompt ${n}`, description: "d", prompt_text: `text ${n}`, tool: null, tools: [], content_type: "text", category: null, subcategory: null,
  status: "published", origin_type: "original", request_id: null, like_count: 0, save_count: 0, comment_count: 0, copy_count: 0, created_at: "2026-02-01T00:00:00Z", show_on_profile: true,
  requires_reference_image: false, requires_reference_video: false, requires_reference_audio: false, visibility: "public", deleted_at: null, community_id: null,
  profiles: pubOf(author), prompt_media: [], prompt_tags: [],
});

const respond = (ctx, list, { offset = 0, total = list.length } = {}) =>
  ctx.route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-range": list.length ? `${offset}-${offset + list.length - 1}/${total}` : `*/${total}` },
    body: JSON.stringify(list),
  });
const errorBody = (message, status = 400) => ({ status, body: { code: "P0001", message, details: "", hint: "" } });
const RLS_ERROR = { status: 403, body: { code: "42501", message: 'new row violates row-level security policy for table "collection_items"', details: "", hint: "" } };

/**
 * Ortak koleksiyon dünyası. `me` = oturumdaki kullanıcı (installMock `signedIn` ile aynı olmalı).
 * `db.collab`: collections / members (collection_id,user_id) / invites / items (id, collection_id, prompt_id, added_by) / unshareable.
 */
function withCollab(db, me, { extra = {} } = {}) {
  db.collab = {
    collections: [
      { id: C1, name: "Yaz kampanyası", visibility: "public", owner: U.alice, is_shared: true, member_count: 1, follower_count: 3, item_count: 2, is_default: false },
      { id: C2, name: "Özel marka", visibility: "private", owner: U.alice, is_shared: true, member_count: 1, follower_count: 0, item_count: 1, is_default: false },
      { id: C3, name: "Sıradan liste", visibility: "public", owner: U.alice, is_shared: false, member_count: 0, follower_count: 0, item_count: 1, is_default: false },
      { id: SYS, name: "Kaydedilenler", visibility: "private", owner: Object.values(U).find((u) => u.id === me) ?? U.alice, is_shared: false, member_count: 0, follower_count: 0, item_count: 0, is_default: true },
    ],
    members: [
      { collection_id: C1, user_id: BOB, username: "bobby", display_name: "Bob" },
      { collection_id: C2, user_id: BOB, username: "bobby", display_name: "Bob" },
    ],
    invites: [{ id: "i1", collection_id: C1, invitee: U.dave, status: "pending" }],
    myInvites: [],
    items: [
      { id: "e1", collection_id: C1, prompt: promptRow(1, U.alice), added_by: ALICE },
      { id: "e2", collection_id: C1, prompt: promptRow(2, U.bob), added_by: BOB },
      { id: "e3", collection_id: C2, prompt: promptRow(3, U.alice), added_by: ALICE },
      { id: "e4", collection_id: C3, prompt: promptRow(4, U.alice), added_by: null },
    ],
    unshareable: [],
    rpcCalls: [],
    ...extra,
  };
  const c = db.collab;
  const isMember = (id, uid = me) => c.members.some((m) => m.collection_id === id && m.user_id === uid);
  const canRead = (col) => col.visibility === "public" || col.owner.id === me || isMember(col.id);
  const asRow = (col) => ({
    id: col.id, name: col.name, visibility: col.visibility, item_count: col.item_count, follower_count: col.follower_count, is_shared: col.is_shared, member_count: col.member_count,
    is_default: col.is_default, created_at: "2026-02-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z", profiles: pubOf(col.owner),
  });
  const syncCounts = () => {
    for (const col of c.collections) {
      col.item_count = c.items.filter((i) => i.collection_id === col.id).length;
      col.member_count = c.members.filter((m) => m.collection_id === col.id).length;
    }
  };
  const record = (name, body) => c.rpcCalls.push({ name, body });
  const rpc = (name, fn) => (db.rpc[name] = (body) => (record(name, body), fn(body)));

  rpc("collection_members_list", (body) => {
    const col = c.collections.find((x) => x.id === body.p_collection);
    if (!col || !col.is_shared || !canRead(col)) return { body: [] };
    const rows = [{ user_id: col.owner.id, username: col.owner.username, display_name: col.owner.display_name, avatar_url: null, role: "owner", invitation_id: null, item_count: c.items.filter((i) => i.collection_id === col.id && (i.added_by === col.owner.id || !i.added_by)).length, since: col.created_at ?? "2026-02-01T00:00:00Z" }];
    for (const m of c.members.filter((x) => x.collection_id === col.id)) {
      rows.push({ user_id: m.user_id, username: m.username, display_name: m.display_name, avatar_url: null, role: "member", invitation_id: null, item_count: c.items.filter((i) => i.collection_id === col.id && i.added_by === m.user_id).length, since: "2026-02-02T00:00:00Z" });
    }
    if (col.owner.id === me) for (const inv of c.invites.filter((i) => i.collection_id === col.id && i.status === "pending")) rows.push({ user_id: inv.invitee.id, username: inv.invitee.username, display_name: inv.invitee.display_name, avatar_url: null, role: "invited", invitation_id: inv.id, item_count: 0, since: "2026-02-03T00:00:00Z" });
    return { body: rows };
  });
  rpc("set_collection_shared", (body) => {
    const col = c.collections.find((x) => x.id === body.p_collection);
    if (!col || col.owner.id !== me) return errorBody("collection_not_found");
    if (body.p_shared && c.unshareable.length > 0) return errorBody("collection_has_unshareable_items");
    col.is_shared = body.p_shared;
    return { body: null };
  });
  rpc("collection_unshareable_items", () => ({ body: c.unshareable.map((u) => ({ item_id: u.id, content_type: "prompt", title: u.title, reason: u.reason })) }));
  rpc("invite_collection_member", (body) => {
    if (body.p_username === "nobody") return errorBody("collection_user_not_found");
    const user = Object.values(U).find((u) => u.username === body.p_username);
    if (!user) return errorBody("collection_user_not_found");
    c.invites.push({ id: `i${c.invites.length + 1}`, collection_id: body.p_collection, invitee: user, status: "pending" });
    return { body: `i${c.invites.length}` };
  });
  rpc("revoke_collection_invitation", (body) => {
    const inv = c.invites.find((i) => i.id === body.p_invitation);
    if (inv) inv.status = "revoked";
    return { body: null };
  });
  rpc("my_collection_invitations", () => ({ body: c.myInvites }));
  rpc("respond_collection_invitation", (body) => {
    const inv = c.myInvites.find((i) => i.id === body.p_invitation);
    if (!inv) return errorBody("collection_invite_not_found");
    c.myInvites = c.myInvites.filter((i) => i.id !== body.p_invitation);
    if (body.p_accept) c.members.push({ collection_id: inv.collection_id, user_id: me, username: "x", display_name: "X" });
    return { body: inv.collection_id };
  });
  rpc("remove_collection_member", (body) => {
    c.members = c.members.filter((m) => !(m.collection_id === body.p_collection && m.user_id === body.p_user));
    if (body.p_remove_items) c.items = c.items.filter((i) => !(i.collection_id === body.p_collection && i.added_by === body.p_user));
    else for (const i of c.items) if (i.collection_id === body.p_collection && i.added_by === body.p_user) i.added_by = null;
    return { body: null };
  });
  rpc("profile_collections", (body) => {
    const list = c.collections.filter((col) => !col.is_default && (col.owner.id === body.p_user || (col.is_shared && isMember(col.id, body.p_user))) && canRead(col) && (me === body.p_user || col.item_count > 0));
    return { body: list.map((col) => ({ id: col.id })) };
  });

  db.extraRoutes = async (ctx) => {
    const { table, q, method, body, sel } = ctx;
    const profileName = q.get("username")?.replace(/^eq\./, "");
    if (table === "profiles" && profileName) return ctx.rows(Object.values(U).filter((u) => u.username === profileName).map(pubOf));

    if (table === "collection_members" && method === "GET") return ctx.rows(c.members.filter((m) => `eq.${m.user_id}` === q.get("user_id")).map((m) => ({ collection_id: m.collection_id })));

    if (table === "collections" && method === "GET") {
      syncCounts();
      let list = c.collections.filter(canRead);
      if (q.get("is_default") === "eq.false") list = list.filter((x) => !x.is_default);
      if (q.get("owner_id")) list = list.filter((x) => `eq.${x.owner.id}` === q.get("owner_id"));
      const idFilter = q.get("id");
      if (idFilter?.startsWith("in.(")) list = list.filter((x) => idFilter.slice(4, -1).split(",").includes(x.id));
      else if (idFilter) list = list.filter((x) => `eq.${x.id}` === idFilter);
      if (q.get("visibility") === "eq.public") list = list.filter((x) => x.visibility === "public");
      if (q.get("item_count") === "gt.0") list = list.filter((x) => x.item_count > 0);
      return ctx.rows(list.map(asRow));
    }

    if (table === "collection_items" && method === "GET") {
      // Kapak sorgusu (kolajı olmayan koleksiyon simge karosu çizer).
      if ((q.get("collection_id") ?? "").startsWith("in.(") && /prompt_media/.test(sel) && !/added_by/.test(sel)) return ctx.rows([]);
      // Koleksiyon sayfasının içerik listesi.
      if (/community_post_id/.test(sel) && /prompts\s*\(/.test(sel)) {
        const id = (q.get("collection_id") ?? "").replace(/^eq\./, "");
        const list = c.items.filter((i) => i.collection_id === id).map((i) => ({ id: i.id, created_at: "2026-02-03T00:00:00Z", community_post_id: null, added_by: i.added_by, prompts: i.prompt, workflows: null, presets: null }));
        respond(ctx, list);
        return true;
      }
      // Kaydet penceresi: içeriğin hangi koleksiyonlarda olduğu (sahibi olduklarım) ve ortak olduklarım.
      const promptId = (q.get("prompt_id") ?? "").replace(/^eq\./, "");
      // "Kaydedildi mi": kaydedilen = sahibi olduğum koleksiyonlardaki içerikler (336 değişmezi) + ortak koleksiyonda BEN eklediklerim + doğrudan kaydettiklerim.
      const savedByMe = (pid) => c.items.some((i) => i.prompt.id === pid && (c.collections.find((x) => x.id === i.collection_id)?.owner.id === me || i.added_by === me));
      if (/collections!inner/.test(sel) && q.get("collections.is_default") === "eq.true") {
        const asked = /^in\./.test(q.get("prompt_id") ?? "") ? (q.get("prompt_id") ?? "").slice(3).replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/"/g, "")).filter(Boolean) : [promptId];
        return ctx.rows(asked.filter(savedByMe).map((pid) => ({ id: `s-${pid}`, prompt_id: pid, collections: { owner_id: me, is_default: true } })));
      }
      if (/collections!inner/.test(sel)) {
        const owned = c.items.filter((i) => i.prompt.id === promptId && c.collections.find((x) => x.id === i.collection_id)?.owner.id === me && !c.collections.find((x) => x.id === i.collection_id).is_default);
        return ctx.rows(owned.map((i) => ({ collection_id: i.collection_id, added_by: i.added_by, collections: { owner_id: me, is_default: false } })));
      }
      if (/^collection_id,added_by$/.test(sel)) {
        const ids = (q.get("collection_id") ?? "").slice(4, -1).split(",");
        return ctx.rows(c.items.filter((i) => i.prompt.id === promptId && ids.includes(i.collection_id)).map((i) => ({ collection_id: i.collection_id, added_by: i.added_by })));
      }
      return ctx.rows([]);
    }
    if (table === "collection_items" && method === "POST") {
      const col = c.collections.find((x) => x.id === body.collection_id);
      const allowed = col && (col.owner.id === me || (col.is_shared && isMember(col.id)));
      if (!allowed) return ctx.json(RLS_ERROR.status, RLS_ERROR.body);
      const known = c.items.find((i) => i.prompt.id === body.prompt_id)?.prompt ?? { ...promptRow(9, U.alice), id: body.prompt_id };
      c.items.push({ id: `n${c.items.length + 1}`, collection_id: col.id, prompt: known, added_by: col.is_shared ? me : null });
      return ctx.json(201, null);
    }
    if (table === "collection_items" && method === "DELETE") {
      const id = (q.get("id") ?? "").replace(/^eq\./, "");
      const target = id ? c.items.find((i) => i.id === id) : null;
      if (target) {
        c.unshareable = c.unshareable.filter((u) => u.id !== id);
        c.items = c.items.filter((i) => i.id !== id);
      }
      return ctx.json(200, null);
    }
    return null;
  };
}

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, lang = "tr", me = ALICE, guest = false } = {}) {
  if (ONLY && !name.startsWith(ONLY)) return;
  const db = createDb();
  withCollab(db, me);
  const context = await browser.newContext({ viewport });
  await installMock(context, db, guest ? { guest: true } : { signedIn: me });
  await context.addInitScript((l) => { try { localStorage.setItem("promptly-language", l); } catch {} }, lang);
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  try { await fn({ page, db }); assert.deepEqual(errors, [], "no uncaught page errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 8).join("\n      ")]); try { await page.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/collabfail-${results.length}.png` }); } catch {} }
  finally { await context.close(); }
}

const open = (page, id, tab = "") => page.goto(`${BASE}/collections/local?id=${id}${tab ? `&tab=${tab}` : ""}`);
const calls = (db, name) => db.collab.rpcCalls.filter((x) => x.name === name);
const cardOf = (page, title) => page.locator("article", { hasText: title }).first();
const menuOf = (page, title) => cardOf(page, title).getByRole("button", { name: /Gönderi seçenekleri|Post options/ });

await scenario("1. Sahip: 'Ortak' etiketi, ortak sayısı, iki sekme, 'kim ekledi' satırları", async ({ page }) => {
  await open(page, C1);
  await page.locator("[data-collection-band]").waitFor();
  const band = await page.locator("[data-collection-band]").innerText();
  assert.match(band, /ortak/i, "Ortak etiketi");
  assert.match(band, /Alice ve 1 ortak/, "ortak sayısı");
  await page.getByRole("tab", { name: /^İçerik/ }).waitFor();
  assert.ok(await page.getByRole("tab", { name: /^Ortaklar/ }).isVisible(), "Ortaklar sekmesi");
  const adders = await page.locator("[data-collection-added-by]").allInnerTexts();
  assert.deepEqual(adders.map((x) => x.trim()).sort(), ["Alice ekledi", "Bob ekledi"], "her içerikte kimin eklediği");
});

await scenario("2. Sahip: içeriği yalnız onu ekleyen kaldırır — kendi eklediğinde 'Koleksiyondan kaldır' var, ortağınkinde YOK", async ({ page }) => {
  await open(page, C1);
  await cardOf(page, "Prompt 1").waitFor();
  await menuOf(page, "Prompt 1").click();
  assert.ok(await page.getByRole("menuitem", { name: "Koleksiyondan kaldır" }).isVisible(), "kendi eklediği");
  await page.keyboard.press("Escape");
  await menuOf(page, "Prompt 2").click();
  assert.equal(await page.getByRole("menuitem", { name: "Koleksiyondan kaldır" }).count(), 0, "sahip bile ortağın eklediğini kaldıramaz");
});

await scenario("3. Ortak (Bob): 'İçerik ekle' var, 'Düzenle' ve takip yok; yalnız KENDİ eklediğini kaldırır", async ({ page }) => {
  await open(page, C1);
  await page.locator("[data-collection-add]").first().waitFor();
  assert.equal(await page.getByRole("button", { name: /Koleksiyonu düzenle/ }).count(), 0, "ad/görünürlük yalnız sahipte");
  assert.equal(await page.getByRole("button", { name: /takip et/i }).count(), 0, "ortak kendi koleksiyonunu takip etmez");
  await cardOf(page, "Prompt 2").waitFor();
  await menuOf(page, "Prompt 2").click();
  assert.ok(await page.getByRole("menuitem", { name: "Koleksiyondan kaldır" }).isVisible(), "kendi eklediği");
  await page.keyboard.press("Escape");
  await menuOf(page, "Prompt 1").click();
  assert.equal(await page.getByRole("menuitem", { name: "Koleksiyondan kaldır" }).count(), 0, "sahibin eklediğini kaldıramaz");
}, { me: BOB });

await scenario("4. Ziyaretçi (Carol, ortak değil): herkese açık koleksiyonda Takip et var, içerik ekle/yönetim yok; ortaklar listesini görür", async ({ page }) => {
  await open(page, C1);
  await page.getByRole("button", { name: /takip et/i }).first().waitFor();
  assert.equal(await page.locator("[data-collection-add]").count(), 0);
  assert.equal(await page.getByRole("button", { name: /Koleksiyonu düzenle/ }).count(), 0);
  await page.getByRole("tab", { name: /^Ortaklar/ }).click();
  await page.locator("[data-collection-members]").waitFor();
  assert.equal(await page.locator("[data-collection-invite-open]").count(), 0, "davet yalnız sahipte");
  assert.equal(await page.locator("[data-collection-member-remove]").count(), 0);
  assert.equal(await page.locator("[data-collection-leave]").count(), 0);
}, { me: CAROL });

await scenario("5. Özel ortak koleksiyonu ortak olmayan GÖRMEZ ('bulunamadı'); sahip ve ortak görür", async ({ page }) => {
  await open(page, C2);
  await page.getByText("Koleksiyon bulunamadı").waitFor().catch(async () => { assert.match(await page.locator("body").innerText(), /bulunamad/i); });
  assert.equal(await page.locator("[data-collection-band]").count(), 0, "koleksiyon çizilmez");
}, { me: CAROL });
await scenario("5b. Özel ortak koleksiyonu ortak (Bob) görür", async ({ page }) => {
  await open(page, C2);
  await page.locator("[data-collection-band]").waitFor();
  assert.match(await page.locator("[data-collection-band]").innerText(), /Özel/);
}, { me: BOB });

await scenario("6. Ortaklar sekmesi (sahip): sahip + ortak + bekleyen davet; davet et → kullanıcı adıyla RPC", async ({ page, db }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-members]").waitFor();
  const text = await page.locator("[data-collection-members]").innerText();
  assert.match(text, /Alice/); assert.match(text, /Bob/); assert.match(text, /Dave/);
  assert.match(text, /Sahip/); assert.match(text, /Bekliyor/);
  assert.match(text, /1 içerik ekledi/, "ortağın eklediği içerik sayısı");
  await page.locator("[data-collection-invite-open]").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "Ortak davet et" }).waitFor();
  await dlg.getByLabel("Kullanıcı adı").fill("@carol");
  await dlg.locator("[data-collection-invite-send]").click();
  await dlg.waitFor({ state: "detached" });
  assert.deepEqual(calls(db, "invite_collection_member").map((x) => x.body), [{ p_collection: C1, p_username: "carol" }], "başındaki @ atılır");
  await page.locator("[data-collection-pending=carol]").waitFor();
});

await scenario("7. Davet: bilinmeyen kullanıcı adı pencerede okunur Türkçe mesajla gösterilir, pencere açık kalır", async ({ page }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-invite-open]").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Kullanıcı adı").fill("nobody");
  await dlg.locator("[data-collection-invite-send]").click();
  await dlg.getByText("Bu kullanıcı adıyla biri bulunamadı.").waitFor();
  assert.ok(await dlg.isVisible(), "pencere açık");
});

await scenario("8. Bekleyen daveti geri çek", async ({ page, db }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-pending=dave] [data-collection-revoke]").click();
  await page.locator("[data-collection-pending=dave]").waitFor({ state: "detached" });
  assert.deepEqual(calls(db, "revoke_collection_invitation").map((x) => x.body), [{ p_invitation: "i1" }]);
});

await scenario("9. Ortağı çıkar: iki seçenekli pencere; 'Eklediklerini de kaldır' → RPC p_remove_items=true", async ({ page, db }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-member=bobby] [data-collection-member-remove]").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Bob ortaklıktan çıkarılsın mı?").waitFor();
  assert.equal(await dlg.getByRole("radio").count(), 2);
  assert.equal(await dlg.getByRole("radio", { checked: true }).innerText().then((x) => /Koleksiyonda kalsınlar/.test(x)), true, "varsayılan: içerikler kalır");
  await dlg.getByRole("radio", { name: /Eklediklerini de kaldır/ }).click();
  await dlg.getByRole("button", { name: "Ortaklıktan çıkar" }).click();
  await dlg.waitFor({ state: "detached" });
  assert.deepEqual(calls(db, "remove_collection_member").map((x) => x.body), [{ p_collection: C1, p_user: BOB, p_remove_items: true }]);
  await page.locator("[data-collection-member=bobby]").waitFor({ state: "detached" });
});

await scenario("10. Ortaklıktan ayrıl (Bob): onay penceresi, varsayılan 'içerikler kalsın', ardından /saved'e döner", async ({ page, db }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-leave]").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Ortaklıktan ayrılmak istiyor musun?").waitFor();
  await dlg.getByRole("button", { name: "Ortaklıktan ayrıl" }).click();
  await page.waitForURL(/\/saved/);
  assert.deepEqual(calls(db, "remove_collection_member").map((x) => x.body), [{ p_collection: C1, p_user: BOB, p_remove_items: false }]);
}, { me: BOB });

await scenario("11. 'İçerik ekle': Prompt / Workflow / Ayar paketi seçenekleri + herkese açık uyarısı", async ({ page }) => {
  await open(page, C1);
  await page.locator("[data-collection-add]").first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "Koleksiyona içerik ekle" }).waitFor();
  assert.equal(await dlg.locator("[data-collection-add-kind]").count(), 3);
  await dlg.getByText("Ortak koleksiyona yalnız herkese açık, yayında içerik eklenebilir.").waitFor();
}, { me: BOB });

await scenario("12. Sıradan koleksiyonu ortak yap: ortak olamayacak içerikler listelenir, Kaydet kilitli; 'Çıkar' sonrası açılır; RPC set_collection_shared", async ({ page, db }) => {
  db.collab.unshareable = [{ id: "e4", title: "Gizli prompt", reason: "not_public" }];
  await open(page, C3);
  await page.getByRole("button", { name: /Koleksiyonu düzenle/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("switch").click();
  const warn = dlg.locator("[data-collection-unshareable]");
  await warn.waitFor();
  assert.match(await warn.innerText(), /1 içerik ortak koleksiyonda olamaz/);
  assert.match(await warn.innerText(), /Gizli prompt/);
  const save = dlg.getByRole("button", { name: "Kaydet" });
  assert.equal(await save.isDisabled(), true, "uyarı varken kaydedilemez");
  await warn.getByRole("button", { name: "Çıkar" }).click();
  await warn.waitFor({ state: "detached" });
  await save.click();
  await dlg.waitFor({ state: "detached" });
  assert.deepEqual(calls(db, "set_collection_shared").map((x) => x.body), [{ p_collection: C3, p_shared: true }]);
  await page.getByRole("tab", { name: /^Ortaklar/ }).waitFor();
});

await scenario("13. /saved: davet şeridi (Kabul et → RPC, şerit kaybolur, raf yenilenir)", async ({ page, db }) => {
  db.collab.myInvites = [{ id: "inv-9", collection_id: C2, collection_name: "Özel marka", visibility: "private", item_count: 1, owner_id: ALICE, owner_username: "alice", owner_display_name: "Alice", owner_avatar_url: null, created_at: "2026-02-03T00:00:00Z" }];
  await page.goto(`${BASE}/saved?invites=1`);
  const strip = page.locator("[data-collection-invite]");
  await strip.waitFor();
  assert.match(await strip.innerText(), /Alice seni "Özel marka" koleksiyonuna ortak olarak davet etti\./);
  await strip.locator("[data-collection-invite-accept]").click();
  await strip.waitFor({ state: "detached" });
  assert.deepEqual(calls(db, "respond_collection_invitation").map((x) => x.body), [{ p_invitation: "inv-9", p_accept: true }]);
}, { me: CAROL });

await scenario("14. /saved rafı: ortak olduğum koleksiyon 'Alice ile' etiketiyle görünür", async ({ page }) => {
  await page.goto(`${BASE}/saved`);
  await page.locator("[data-saved-collections]").waitFor();
  const chips = await page.locator("[data-saved-collections] [data-collection-shared-chip]").allInnerTexts();
  assert.ok(chips.some((x) => /Alice ile/.test(x)), `chips: ${chips.join(" | ")}`);
}, { me: BOB });

await scenario("15. Kaydet penceresi: ortak koleksiyon etiketli; başkasının eklediği satır KİLİTLİ (tik var, kaldırılamaz)", async ({ page }) => {
  await open(page, C1);
  // Bob (ortak) Prompt 1'i (sahibin eklediği) kaydet penceresinden açar: C1 satırı tikli ve kilitli.
  await cardOf(page, "Prompt 1").getByRole("button", { name: /Kaydet|Koleksiyona ekle/ }).first().click();
  await page.locator("[data-save-toast-action]").click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "Koleksiyona ekle" }).waitFor();
  const row = dlg.locator(`[data-collection-row="${C1}"]`);
  await row.waitFor();
  assert.equal(await row.getAttribute("aria-checked"), "true");
  assert.equal(await row.isDisabled(), true, "başkasının eklediği kaldırılamaz");
  assert.match(await row.innerText(), /Alice ile/);
  assert.match(await row.innerText(), /Yalnız ekleyen kaldırabilir/);
}, { me: BOB });

await scenario("16. Profil: ortak olunan herkese açık koleksiyon ortağın profilinde listelenir (özel olan başkasına görünmez)", async ({ page, db }) => {
  await page.goto(`${BASE}/profile/real?username=bobby`);
  await page.getByText("Yaz kampanyası").first().waitFor();
  assert.deepEqual(calls(db, "profile_collections").map((x) => x.body.p_user), [BOB]);
  assert.equal(await page.getByText("Özel marka").count(), 0, "özel ortak koleksiyon başkasının gözünde yok");
}, { me: CAROL });

await scenario("17. İngilizce: bant, sekmeler, davet penceresi", async ({ page }) => {
  await open(page, C1, "members");
  await page.locator("[data-collection-members]").waitFor();
  assert.match(await page.locator("[data-collection-members]").innerText(), /Partners/);
  await page.locator("[data-collection-invite-open]").click();
  await page.getByRole("dialog").getByRole("heading", { name: "Invite a partner" }).waitFor();
}, { lang: "en" });

await scenario("18. Telefon: ortak koleksiyon ve Ortaklar sekmesinde yatay taşma yok", async ({ page }) => {
  await open(page, C1);
  await page.locator("[data-collection-band]").waitFor();
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "içerik sekmesi taşmıyor");
  await page.getByRole("tab", { name: /^Ortaklar/ }).click();
  await page.locator("[data-collection-members]").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "ortaklar sekmesi taşmıyor");
}, { viewport: { width: 390, height: 800 } });

await scenario("19. Koyu tema: ortak koleksiyon sayfası hata vermeden açılır", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("promptly-theme", "dark"); } catch {} });
  await open(page, C1);
  await page.locator("[data-collection-band]").waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains("dark")));
});

for (const [status, name] of results) console.log(`${status === "PASS" ? "✓" : "✗"} ${name}`);
const passed = results.filter(([s]) => s === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
await browser.close();
server.close();
process.exit(passed === results.length ? 0 : 1);
