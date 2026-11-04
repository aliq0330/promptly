// Çevrimiçi durum, son görülme ve gizlilik arayüz testleri (ağ + Realtime Presence taklitli) — docs/history/329-*. Çalıştırma: README.md.
// Birden fazla tarayıcı bağlamı = ayrı oturumlar (Alice izleyici, Bob/Carol/Dave hedef). Realtime taklidi (`realtime-hub.mjs`) presence'ı
// (track/untrack/state/diff) ve private kanal yetkisini `mock-presence.mjs`'teki SQL aynasıyla uygular. Gerçek Supabase'e/Realtime'a ve gerçek
// cihaza karşı DENENMEDİ — DB/RLS/RPC doğrulaması `supabase/tests/presence.sql`'dedir.
import { chromium, devices } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";
import { setupPresence } from "./mock-presence.mjs";
import { setupCommunities } from "./mock-communities.mjs";

const PORT = 4211;
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ["--no-sandbox"] });
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const CONV2 = "c0000000-0000-4000-8000-0000000000c2";
const G = "d0000000-0000-4000-8000-0000000000a1";
const C1 = "d0000000-0000-4000-8000-0000000000b1";
const C2 = "d0000000-0000-4000-8000-0000000000b2";
const EV = "e0000000-0000-4000-8000-0000000000e1";
const TOKEN = "PublicTokenPublicToken12345";
const TOKEN2 = "ClosedTokenClosedToken12345";

const PUBLIC_COLS = ["id", "username", "display_name", "avatar_url", "cover_url", "bio", "website", "follower_count", "following_count", "created_at", "interests"];
const pubOf = (u) => Object.fromEntries(PUBLIC_COLS.map((c) => [c, u[c]]));
/** `mock.mjs` profil sorgusunda `username=eq.` süzgecini bilmez (profil sayfası kullanıcıyı ada göre okur). */
const withProfiles = (db) => {
  const prev = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const name = ctx.q.get("username")?.replace(/^eq\./, "");
    if (ctx.table === "profiles" && name) return ctx.rows(Object.values(U).filter((u) => u.username === name).map(pubOf));
    return prev ? prev(ctx) : undefined;
  };
};

async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme, guest = false, device } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  setup?.(db);
  if (!db.presence) setupPresence(db); // ön ayar isteyen kurulum kendisi çağırır (ve topluluk uçlarından SONRA)
  const hub = createRealtimeHub({
    // İstemci kütüphanesi konuya "realtime:" öneki ekler; sunucu politikası (`realtime.topic()`) öneksiz konuyu görür.
    authorize: (topic, uid) => db.presenceAuthorize(topic.replace(/^realtime:/, ""), uid) ?? true,
    authorizeWrite: (topic, uid) => db.presenceAuthorize(topic.replace(/^realtime:/, ""), uid, true) ?? true,
  });
  const opened = [];
  const errors = [];
  async function newSession(signedIn, opts = {}) {
    const context = await browser.newContext(device ? { ...devices[device] } : { viewport: opts.viewport ?? viewport });
    await installMock(context, db, signedIn ? { signedIn } : { guest: true });
    await hub.install(context, signedIn);
    await context.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); localStorage.setItem("promptly-tour-seen", "1"); localStorage.setItem("promptly-terms-notice", "2026-11-01"); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    page.on("pageerror", (e) => errors.push(String(e)));
    opened.push(context);
    return page;
  }
  try {
    const page = guest ? await newSession(null) : await newSession(ME);
    await fn({ page, db, hub, newSession });
    assert.deepEqual(errors, [], "no uncaught page errors");
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 10).join("\n      ")]);
  } finally {
    for (const c of opened) await c.close().catch(() => {});
  }
}

/** Hedef kişinin oturumu: sitenin herhangi bir sayfası açık → kendi kanalında track eder. */
const goOnline = async (newSession, user, path = "/") => {
  const p = await newSession(user.id);
  await p.goto(`${BASE}${path}`);
  await p.waitForFunction(() => true);
  return p;
};
const waitTracked = async (hub, db, user) => {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (hub.presenceKeys(rt(db.presenceTopic(user.id))).includes(user.id)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${user.username} never tracked presence`);
};
const rt = (topic) => `realtime:${topic}`;
const row = (page, text) => page.locator("[data-conversation-row]:visible", { hasText: text }).first();
const dotIn = (loc) => loc.locator("[data-presence-dot]");
const presenceCalls = (db, fn, user = ME) => db.presenceCalls.filter((c) => c.fn === fn && c.user === user);
const joinsOf = (hub, userId, topicPrefix) => hub.log.filter((e) => e.userId === userId && e.event === "phx_join" && e.topic.includes(topicPrefix));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const seedDms = (db) => {
  db.addConv(CONV, U.bob, { texts: ["selam alice"] });
  db.addConv(CONV2, U.carol, { texts: ["carol burada"] });
};

// ====================================================================== AYARLAR
await scenario("1. Ayarlar → Gizlilik: Otomatik + Herkes varsayılan; kitle ve Görünmez seçimi sunucuya yazılır; karşılıklılık notu görünür", async ({ page, db }) => {
  await page.goto(`${BASE}/settings/privacy`);
  await page.locator("[data-presence-settings=ready]").waitFor();
  assert.equal(await page.getByRole("radio", { name: /Otomatik/ }).isChecked(), true);
  assert.equal(await page.locator("input[name=presence-audience][value=everyone]").isChecked(), true);
  await page.getByText(/Karşılıklılık: durumunu gizlersen/).waitFor();
  await page.getByRole("radio", { name: /Takip ettiklerim/ }).check();
  await page.getByText("Kaydedildi.").waitFor();
  assert.equal(db.presenceOf(ME).audience, "following");
  assert.equal(presenceCalls(db, "set_my_presence").at(-1).body.p_audience, "following");
  await page.getByRole("radio", { name: /Görünmez/ }).check();
  await page.waitForFunction(() => document.querySelector("input[value=invisible]")?.checked);
  await page.waitForTimeout(300);
  assert.equal(db.presenceOf(ME).mode, "invisible");
  assert.equal(presenceCalls(db, "set_my_presence").at(-1).body.p_mode, "invisible");
});

await scenario("2. Hesap menüsünden hızlı durum: Görünmez ol ↔ Çevrimiçi görün; tetikleyici avatarın noktası durumu izler", async ({ page, db }) => {
  await page.goto(`${BASE}/`);
  const trigger = page.getByRole("button", { name: "Hesap menüsü" });
  await trigger.waitFor();
  await trigger.locator("[data-presence-dot]").waitFor();
  await trigger.click();
  const toggle = page.locator("[data-presence-toggle]");
  await toggle.getByText("Çevrimiçi görünüyorsun").waitFor();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.click();
  await toggle.getByText("Görünmezsin").waitFor();
  assert.equal(db.presenceOf(ME).mode, "invisible");
  assert.equal(await trigger.locator("[data-presence-dot]").count(), 0, "no dot while invisible");
  await toggle.click();
  await toggle.getByText("Çevrimiçi görünüyorsun").waitFor();
  assert.equal(db.presenceOf(ME).mode, "auto");
});

// ====================================================================== MESAJLAŞMA
await scenario("3. Sohbet listesi: çevrimiçi Bob'un satırında yeşil nokta, Carol'da yok; Bob sekmesini kapatınca nokta anında söner", async ({ page, db, hub, newSession }) => {
  const bob = await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await dotIn(row(page, "Bob")).waitFor();
  assert.equal(await dotIn(row(page, "Carol")).count(), 0);
  assert.ok(joinsOf(hub, ME, `presence:${U.bob.id}`).length >= 1, "viewer joined Bob's private channel");
  assert.equal(joinsOf(hub, ME, `presence:${U.bob.id}`)[0].payload.config.private, true, "channel is private");
  await bob.context().close();
  await dotIn(row(page, "Bob")).waitFor({ state: "detached" });
}, { setup: seedDms });

await scenario("4. Sohbet başlığı: 'Çevrimiçi'; Bob çıkınca 'Son görülme …'; Kişi bilgisi aynı durumu gösterir", async ({ page, db, hub, newSession }) => {
  const bob = await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  const status = page.locator("[data-contact-open] [data-presence-status]");
  await page.locator("[data-contact-open] [data-presence-status=online]").waitFor();
  assert.equal((await status.innerText()).trim(), "Çevrimiçi");
  await page.locator("[data-contact-open]").click();
  await page.locator("[data-contact-info] [data-presence-status=online]").waitFor();
  await page.keyboard.press("Escape");
  await bob.context().close();
  await page.locator("[data-contact-open] [data-presence-status=last-seen]").waitFor();
  assert.match(await status.innerText(), /^Son görülme /);
}, { setup: seedDms });

await scenario("5. Görünmez (Bob, hesap menüsünden): Alice'teki nokta ve 'Çevrimiçi' ANINDA söner; son görülme de gösterilmez", async ({ page, db, hub, newSession }) => {
  const bob = await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("[data-contact-open] [data-presence-status=online]").waitFor();
  await bob.getByRole("button", { name: "Hesap menüsü" }).click();
  await bob.locator("[data-presence-toggle]").click();
  await bob.locator("[data-presence-toggle]").getByText("Görünmezsin").waitFor();
  // Gizlenme anında: eski kanaldan çıkılır, sunucu yeni anahtarı yalnız yetkiliye verir — Bob görünmez olduğu için kimseye.
  await page.locator("[data-contact-open] [data-presence-status=online]").waitFor({ state: "detached" });
  await page.waitForTimeout(2000); // yeniden sorgu (çıkıştan 1,2 sn sonra) tamamlansın
  assert.equal(await page.locator("[data-contact-open] [data-presence-status=last-seen]").count(), 0, "last seen hidden too");
  assert.match(await page.locator("[data-contact-open]").innerText(), /@bobby/, "falls back to the username");
  assert.equal(hub.presenceKeys(rt(db.presenceTopic(U.bob.id))).length, 0, "Bob tracks nowhere");
}, { setup: seedDms });

await scenario("6. Karşılıklılık: Alice'in kendisi gizliyse (Hiç kimse) Bob çevrimiçiyken bile hiçbir nokta/son görülme yok, sorgu hiç atılmaz", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await row(page, "Bob").waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator("[data-presence-dot]").count(), 0);
  assert.equal(presenceCalls(db, "presence_lookup").length, 0, "no lookup while hidden");
  assert.equal(joinsOf(hub, ME, "presence:").length, 0, "no presence channel at all");
}, { setup: (db) => { seedDms(db); setupPresence(db); db.presenceOf(ME).audience = "nobody"; } });

await scenario("7. Engel (iki yönlü): Alice Bob'u engellediyse Bob'un kanalına katılınmaz, nokta yok", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await row(page, "Bob").waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await dotIn(row(page, "Bob")).count(), 0);
  assert.equal(joinsOf(hub, ME, `presence:${U.bob.id}`).length, 0);
}, { setup: (db) => { seedDms(db); db.blocks.push({ blocker_id: ME, blocked_id: U.bob.id }); } });

await scenario("8. Kitle 'Karşılıklı takip': tek yönlü takipte görünmez; Bob kanalına yetkisiz katılım denemesi reddedilir", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await row(page, "Bob").waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await dotIn(row(page, "Bob")).count(), 0);
  // Kanal adını bilen biri doğrudan katılmaya çalışsa bile yetki reddeder (sunucu politikası aynası).
  const result = await page.evaluate(async (topic) => {
    const ws = new WebSocket("wss://example.supabase.co/realtime/v1/websocket?apikey=dummy&vsn=2.0.0");
    return await new Promise((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify(["1", "1", topic, "phx_join", { config: { private: true, presence: { key: "x", enabled: true } } }]));
      ws.onmessage = (m) => { const [, , , ev, payload] = JSON.parse(m.data); if (ev === "phx_reply") resolve(payload.status); };
      setTimeout(() => resolve("timeout"), 3000);
    });
  }, db.presenceTopic(U.bob.id));
  assert.equal(result, "error", "unauthorized join rejected");
  db.follow(U.bob, U.alice); // artık karşılıklı
  await page.reload();
  await dotIn(row(page, "Bob")).waitFor();
}, { setup: (db) => { seedDms(db); setupPresence(db); db.presenceOf(U.bob.id).audience = "mutual"; db.follow(U.alice, U.bob); } });

await scenario("9. Çoklu sekme: Bob iki sekmede açıkken birini kapatınca hâlâ çevrimiçi; ikisi de kapanınca çevrimdışı", async ({ page, db, hub, newSession }) => {
  const bob1 = await goOnline(newSession, U.bob);
  const bob2 = await bob1.context().newPage();
  await bob2.goto(`${BASE}/discover`);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await dotIn(row(page, "Bob")).waitFor();
  const deadline = Date.now() + 6000;
  while (hub.presenceKeys(rt(db.presenceTopic(U.bob.id))).length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.equal(hub.presenceKeys(rt(db.presenceTopic(U.bob.id))).length, 2, "two sessions under the same key");
  await bob2.close();
  await page.waitForTimeout(800);
  assert.equal(await dotIn(row(page, "Bob")).count(), 1, "still online with one tab");
  await bob1.close();
  await dotIn(row(page, "Bob")).waitFor({ state: "detached" });
}, { setup: seedDms });

await scenario("10. Bağlantı kopması: kanal hata verince son görülmeye düşülür (nokta kalır), kısa geri çekilmeyle yeniden katılınır", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  await dotIn(row(page, "Bob")).waitFor();
  const before = joinsOf(hub, ME, `presence:${U.bob.id}`).length;
  hub.kick(rt(db.presenceTopic(U.bob.id))); // izleyicinin kanalı da sahibinin kanalı da düşer
  await page.waitForTimeout(500);
  assert.equal(await dotIn(row(page, "Bob")).count(), 1, "falls back to last seen (fresh heartbeat)");
  const deadline = Date.now() + 9000;
  while (joinsOf(hub, ME, `presence:${U.bob.id}`).length <= before && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  assert.ok(joinsOf(hub, ME, `presence:${U.bob.id}`).length > before, "viewer rejoined after backoff");
  assert.ok(joinsOf(hub, U.bob.id, `presence:${U.bob.id}`).length >= 2, "owner rejoined and re-tracked");
  await waitTracked(hub, db, U.bob);
  await dotIn(row(page, "Bob")).waitFor();
}, { setup: seedDms });

await scenario("11. Yeni sohbet: çevrimiçi kişiler önce (Dave alfabetik olarak sonda olsa da en üstte); durum satırı 'Çevrimiçi'", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.dave);
  await waitTracked(hub, db, U.dave);
  await page.goto(`${BASE}/messages`);
  await page.getByRole("button", { name: "Yeni sohbet başlat" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("heading", { name: "Yeni sohbet" }).waitFor();
  await dialog.locator("[data-presence-dot]").first().waitFor();
  const names = await dialog.locator("ul li button").evaluateAll((els) => els.map((el) => el.querySelector(".font-semibold")?.textContent?.trim()));
  assert.equal(names[0], "Dave", JSON.stringify(names));
  assert.match(await dialog.locator("ul li button").first().innerText(), /Çevrimiçi/);
}, { setup: (db) => { db.follow(U.alice, U.bob); db.follow(U.alice, U.carol); db.follow(U.alice, U.dave); } });

await scenario("12. Mesajlar dock'u (masaüstü): hap ve paneldeki satırlar aynı durum kaynağını kullanır", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/discover`);
  const pill = page.locator("[data-message-dock-pill]");
  await pill.waitFor();
  await pill.locator("[data-presence-dot]").waitFor();
  await pill.click();
  await dotIn(page.locator("[data-message-dock] [data-conversation-row]", { hasText: "Bob" })).waitFor();
  assert.equal(joinsOf(hub, ME, `presence:${U.bob.id}`).length, 1, "one shared channel for pill + panel row");
}, { setup: seedDms });

// ====================================================================== TOPLULUKLAR
await scenario("13. Topluluk sohbeti başlığı 'N çevrimiçi' + bilgi sayfasında çevrimiçi üyeler (kişi başına gizlilik: Dave 'Takip ettiklerim')", async ({ page, db }) => {
  await page.goto(`${BASE}/messages/local?id=${G}`);
  await page.getByRole("button", { name: /Topluluk bilgisini aç|Tasarım Atölyesi/ }).first().waitFor();
  await page.locator("[data-online-count]").first().waitFor();
  assert.match(await page.locator("[data-online-count]").first().innerText(), /\d+ çevrimiçi/);
  await page.getByRole("button", { name: /Tasarım Atölyesi/ }).first().click();
  const strip = page.locator("[data-community-info] [data-online-members=all]");
  await strip.getByText("Bob").waitFor();
  await strip.getByText("Carol").waitFor();
  assert.equal(await strip.getByText("Dave").count(), 0, "Dave shares only with people he follows");
  assert.ok(presenceCalls(db, "community_presence_counts").length >= 1, "count comes from the server");
}, {
  setup: (db) => {
    db.addGroup(G, { members: [[U.bob, "admin"], [U.carol, "moderator"], [U.dave, "member"]], texts: [[U.bob, "merhaba"]] });
    setupPresence(db);
    db.setActive(U.bob.id); db.setActive(U.carol.id); db.setActive(U.dave.id);
    db.presenceOf(U.dave.id).audience = "following";
  },
});

const communitySetup = (db) => {
  setupCommunities(db);
  db.addCommunity(C1, { name: "Açık Atölye", visibility: "public", myRole: "member", members: [[U.bob, "owner"], [U.carol, "moderator"], [U.dave, "member"]] });
  db.addCommunity(C2, { name: "Kapalı Atölye", visibility: "restricted", myRole: "none", members: [[U.bob, "owner"]] });
  db.groups.find((g) => g.id === C1).link_token = TOKEN;
  db.groups.find((g) => g.id === C2).link_token = TOKEN2;
  setupPresence(db);
  db.linkTokens.set(TOKEN, C1); db.linkTokens.set(TOKEN2, C2);
  db.setActive(U.bob.id); db.setActive(U.carol.id);
  db.events.push({ id: EV, community_id: C1, title: "Canlı atölye", description: null, starts_at: new Date(Date.now() + 3_600_000).toISOString(), ends_at: null, timezone: "Europe/Istanbul", location: null, online_url: null, status: "scheduled", going_count: 2, maybe_count: 1, rsvps: {} });
  db.attendees.push({ event_id: EV, user: U.bob, status: "going" }, { event_id: EV, user: U.carol, status: "maybe" }, { event_id: EV, user: U.dave, status: "going" });
};

await scenario("14. Topluluk → Üyeler: 'Çevrimiçi' süzgeci yalnız şu an çevrimiçi üyeleri listeler (sunucu sorgusu)", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=members`);
  await page.getByRole("button", { name: "Çevrimiçi", exact: true }).click();
  await page.getByText("Bob", { exact: true }).waitFor();
  await page.getByText("Carol", { exact: true }).waitFor();
  assert.equal(await page.locator("main").getByText("Dave", { exact: true }).count(), 0, "inactive member not listed");
  assert.equal(presenceCalls(db, "community_online_members").length >= 1, true);
}, { setup: communitySetup });

await scenario("15. Topluluk → Hakkında: yönetim ekibinden çevrimiçi olanlar (sahip + moderatör, rol etiketiyle)", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=about`);
  const strip = page.locator("[data-online-members=staff]");
  await strip.getByText("Bob").waitFor();
  await strip.getByText("Carol").waitFor();
  await strip.getByText("Yönetim ekibinden çevrimiçi olanlar").waitFor();
}, { setup: communitySetup });

await scenario("16. Etkinlik: aktif katılımcı sayısı + görebildiğin çevrimiçi katılımcı avatarları", async ({ page }) => {
  await page.goto(`${BASE}/communities/local?id=${C1}&tab=events`);
  const box = page.locator("[data-event-presence]");
  await box.waitFor();
  assert.match(await box.innerText(), /2 katılımcı şu an çevrimiçi/);
  assert.equal(await box.getByRole("list").locator("li").count(), 2);
}, { setup: communitySetup });

await scenario("17. Davet sayfası: herkese açık toplulukta 'N üye şu an aktif'; kapalı toplulukta HİÇBİR sayı yok (istemci sormaz bile)", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/join#${TOKEN}`);
  await page.getByText(/üye şu an aktif/).waitFor();
  assert.match(await page.locator("[data-online-count]").innerText(), /2 üye şu an aktif/);
  await page.goto("about:blank");
  await page.goto(`${BASE}/communities/join#${TOKEN2}`);
  await page.getByRole("heading", { name: "Kapalı Atölye" }).waitFor();
  await page.waitForTimeout(800);
  assert.equal(await page.getByText(/şu an aktif/).count(), 0);
  assert.equal(presenceCalls(db, "community_link_presence_count").filter((c) => c.body.p_token === TOKEN2).length, 0, "no request for a closed community");
}, { setup: (db) => { communitySetup(db); db.members = db.members.filter((m) => !(m.conversation_id === C1 && m.user_id === ME)); } });

await scenario("18. Topluluk kartları: 'N aktif' sayıları TEK toplu çağrıyla gelir", async ({ page, db }) => {
  await page.goto(`${BASE}/communities/all`);
  await page.getByText("Açık Atölye").first().waitFor();
  await page.getByText(/\d+ aktif/).first().waitFor();
  const countCalls = presenceCalls(db, "community_presence_counts");
  assert.ok(countCalls.length >= 1 && countCalls.length <= 2, `batched (${countCalls.length})`);
}, { setup: communitySetup });

// ====================================================================== PROFİL
await scenario("19. Profil: nokta avatarın sağ altında ve hikâye halkasının DIŞINDA; Hakkında'da 'Çevrimiçi'", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/profile/real?username=bobby`);
  const ring = page.locator("[data-profile-story-ring]");
  const dot = ring.locator("[data-presence-dot]");
  await dot.waitFor();
  const geo = await ring.evaluate((el) => {
    const r = el.getBoundingClientRect(); const d = el.querySelector("[data-presence-dot]").getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; const dx = d.left + d.width / 2 - cx, dy = d.top + d.height / 2 - cy;
    return { dist: Math.hypot(dx, dy), radius: r.width / 2, dotR: d.width / 2, right: dx > 0, below: dy > 0 };
  });
  assert.ok(geo.right && geo.below, "bottom-right");
  assert.ok(geo.dist - geo.dotR >= geo.radius - 0.5, `dot does not overlap the ring ${JSON.stringify(geo)}`);
  await page.locator("[data-section-menu]").click();
  await page.locator('[data-section-option="about"]').click();
  await page.locator("[data-profile-last-seen]").getByText("Çevrimiçi").waitFor();
}, { setup: (db) => withProfiles(db) });

// ====================================================================== TELEGRAM ODAĞI
await scenario("20. Telegram akıllı bildirimi: açık sayfanın odak anahtarı yazılır; sekme gizlenince temizlenir", async ({ page, db }) => {
  await page.goto(`${BASE}/prompts/local?id=abc123&hl=comment:x`);
  const deadline = Date.now() + 6000;
  while (!presenceCalls(db, "presence_set_focus").some((c) => c.body.p_key === "/prompts/local?id=abc123") && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.ok(presenceCalls(db, "presence_set_focus").some((c) => c.body.p_key === "/prompts/local?id=abc123"), JSON.stringify(presenceCalls(db, "presence_set_focus").map((c) => c.body)));
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(400);
  assert.equal(presenceCalls(db, "presence_set_focus").at(-1).body.p_key, null, "focus cleared when hidden");
}, { setup: (db) => { setupPresence(db); db.presenceOf(ME).telegram = true; } });

await scenario("21. Telegram bağlantısı yoksa odak yalnız bir kez sorulur, sonraki sayfalarda hiç çağrılmaz", async ({ page, db }) => {
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/messages`);
  await page.waitForTimeout(1200);
  assert.equal(presenceCalls(db, "presence_set_focus").length, 1, JSON.stringify(presenceCalls(db, "presence_set_focus").map((c) => c.body)));
});

// ====================================================================== ZİYARETÇİ / DİL / DÜZEN
await scenario("22. Ziyaretçi (oturumsuz): hiçbir çevrimiçi isteği atılmaz, nokta yok, kanal açılmaz", async ({ page, db, hub }) => {
  await page.goto(`${BASE}/communities/join#${TOKEN}`);
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/discover`);
  await page.waitForTimeout(1200);
  assert.equal(db.presenceCalls.length, 0, JSON.stringify(db.presenceCalls.map((c) => c.fn)));
  assert.equal(await page.locator("[data-presence-dot]").count(), 0);
  assert.equal(hub.log.filter((e) => e.event === "phx_join" && e.topic.includes("presence:")).length, 0);
}, { guest: true, setup: communitySetup });

await scenario("23. İngilizce: başlıkta 'Online' / 'Last seen …', ayarlar İngilizce", async ({ page, db, hub, newSession }) => {
  const bob = await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("[data-contact-open] [data-presence-status=online]").getByText("Online").waitFor();
  await bob.context().close();
  await page.locator("[data-contact-open] [data-presence-status=last-seen]").getByText(/^Last seen /).waitFor();
  await page.goto(`${BASE}/settings/privacy`);
  await page.getByText("Online status").first().waitFor();
  await page.getByRole("radio", { name: /People I follow/ }).waitFor();
  await page.getByRole("radio", { name: /Invisible/ }).waitFor();
}, { setup: seedDms, lang: "en" });

await scenario("24. Telefon (390 px): listede nokta avatarın sağ altında, satırdan taşmaz; Gizlilik sayfasında yatay kaydırma yok", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages`);
  const dot = dotIn(row(page, "Bob"));
  await dot.waitFor();
  const geo = await row(page, "Bob").evaluate((el) => {
    const d = el.querySelector("[data-presence-dot]").getBoundingClientRect(); const r = el.getBoundingClientRect();
    return { inside: d.left >= r.left && d.right <= r.right && d.top >= r.top && d.bottom <= r.bottom, w: d.width };
  });
  assert.ok(geo.inside, "dot stays inside the row");
  assert.ok(geo.w >= 8 && geo.w <= 14, `small dot (${geo.w})`);
  assert.equal(await noOverflow(page), true);
  await page.goto(`${BASE}/settings/privacy`);
  await page.locator("[data-presence-settings=ready]").waitFor();
  assert.equal(await noOverflow(page), true);
}, { setup: seedDms, device: "iPhone 13" });

await scenario("25. Tablet (820 px) koyu tema: sohbet başlığında durum, nokta yüzey rengi halkasıyla ayrışır", async ({ page, db, hub, newSession }) => {
  await goOnline(newSession, U.bob);
  await waitTracked(hub, db, U.bob);
  await page.goto(`${BASE}/messages/local?id=${CONV}`);
  await page.locator("[data-contact-open] [data-presence-status=online]").waitFor();
  const dot = page.locator("[data-contact-open] [data-presence-dot]");
  await dot.waitFor();
  const cls = await dot.getAttribute("class");
  assert.match(cls, /bg-success/); assert.match(cls, /ring-surface/);
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
  assert.equal(await noOverflow(page), true);
}, { setup: seedDms, viewport: { width: 820, height: 1180 }, theme: "dark" });

await browser.close(); server.close();
let failed = 0;
for (const [s, n] of results) { if (s === "FAIL") failed++; console.log(`${s}  ${n}`); }
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
