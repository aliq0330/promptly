// 1-1 sesli/görüntülü arama arayüz testi (docs/history/449-*). Çalıştırma: README.md → "1-1 arama".
// İki ayrı tarayıcı bağlamı (Alice = ME, Bob) aynı ağ/Realtime taklidine bağlanır; Chromium SAHTE kamera/mikrofon cihazlarıyla açılır, bu yüzden
// iki taraf arasında GERÇEK bir WebRTC (RTCPeerConnection, P2P, host adayları) bağlantısı kurulur ve medya akışı sınanır.
// Taklit edilen: PostgREST (calls RPC'leri: `call_start`/`call_respond`/`calls_my_open`, sunucudaki kuralların bir özeti), Realtime
// (`postgres_changes` + private Broadcast kanalı `call:<id>`). Gerçek Supabase'e KARŞI DENENMEDİ; asıl DB/RLS doğrulaması `supabase/tests/calls.sql`'dedir.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { serve } from "./server.mjs";
import { createDb, installMock, ME, U } from "./mock.mjs";
import { createRealtimeHub } from "./realtime-hub.mjs";

const PORT = Number(process.env.PORT ?? 4207);
const BASE = `http://localhost:${PORT}/promptly`;
const server = await serve(PORT);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? undefined,
  args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-features=WebRtcHideLocalIpsWithMdns", "--autoplay-policy=no-user-gesture-required"],
});
const results = [];
const CONV = "c0000000-0000-4000-8000-0000000000c1";
const G = "d0000000-0000-4000-8000-0000000000a1";
const BOB = U.bob;

// ---- Sunucu taklidi: `call_start` / `call_respond` / `calls_my_open` (SQL kurallarının özeti) + Realtime yayını ----
function installCallServer(db, hub) {
  db.callRows = [];
  db.callLog = [];
  const err = (message) => ({ status: 400, body: { code: "P0001", message, details: "", hint: "" } });
  const emit = (type, row) => { for (const uid of [row.caller_id, row.callee_id]) hub.emitPostgresChange("calls", type, { ...row }, { only: uid }); };
  const open = (uid) => db.callRows.filter((r) => ["ringing", "accepted"].includes(r.status) && (r.caller_id === uid || r.callee_id === uid));
  db.rpc.call_start = (body, _db, uid) => {
    db.callLog.push({ rpc: "call_start", uid, ...body });
    if (db.failCallStart) return err(db.failCallStart);
    const mine = db.members.find((m) => m.conversation_id === body.p_conversation_id && m.user_id === uid);
    const other = db.members.find((m) => m.conversation_id === body.p_conversation_id && m.user_id !== uid);
    if (!mine || !other || mine.status !== "accepted" || other.status !== "accepted") return err("call_not_allowed");
    if (!["audio", "video"].includes(body.p_type)) return err("call_invalid_type");
    if (open(uid).length || open(other.user_id).length) return err("call_busy");
    const row = { id: crypto.randomUUID(), conversation_id: body.p_conversation_id, caller_id: uid, callee_id: other.user_id, type: body.p_type, status: "ringing", end_reason: null, started_at: new Date().toISOString(), answered_at: null, ended_at: null, created_at: new Date().toISOString() };
    db.callRows.push(row);
    emit("INSERT", row);
    return { body: row };
  };
  db.rpc.call_respond = (body, _db, uid) => {
    db.callLog.push({ rpc: "call_respond", uid, action: body.p_action, reason: body.p_reason });
    const row = db.callRows.find((r) => r.id === body.p_call_id);
    if (!row || ![row.caller_id, row.callee_id].includes(uid)) return err("call_not_found");
    const done = (status, reason, answered) => { Object.assign(row, { status, end_reason: reason, ended_at: new Date().toISOString() }); if (answered === false) row.answered_at = null; emit("UPDATE", row); };
    const a = body.p_action;
    if (a === "accept") {
      if (uid !== row.callee_id) return err("call_not_allowed");
      if (row.status !== "ringing") return err("call_not_ringing");
      Object.assign(row, { status: "accepted", answered_at: new Date().toISOString() });
      emit("UPDATE", row);
      return { body: row };
    }
    if (["rejected", "missed", "ended"].includes(row.status)) return { body: row };
    if (a === "reject" && row.status === "ringing") done("rejected", "rejected");
    else if (a === "cancel" && row.status === "ringing") done("missed", "cancelled");
    else if (a === "timeout" && row.status === "ringing") done("missed", "timeout");
    else if (a === "end") {
      if (row.status === "ringing") done(uid === row.caller_id ? "missed" : "rejected", uid === row.caller_id ? "cancelled" : "rejected");
      else { Object.assign(row, { status: "ended", end_reason: body.p_reason ?? "hangup", ended_at: new Date().toISOString() }); emit("UPDATE", row); }
    }
    return { body: row };
  };
  db.rpc.calls_my_open = (_body, _db, uid) => ({ body: open(uid) });
  // ---- Arama ayarları (docs/history/450-*): kim arayabilir + cevapsız bildirimi (SQL: set_my_call_settings) ----
  // Keşfet sayfasına gezinme testi (24) için boş yanıtlar: sayfa içi gezinmede konsol hatası çıkmasın.
  for (const name of ["feed_page", "trending_tags", "suggest_creators", "discover_tool_counts", "discover_highlights", "community_cards"]) db.rpc[name] ??= () => ({ body: [] });
  db.callSettings = {};
  db.callFollows = []; // { follower_id, following_id }
  const settingsOf = (uid) => (db.callSettings[uid] ??= { privacy: "everyone", notify_missed: true });
  db.rpc.get_my_call_settings = (_b, _d, uid) => ({ body: [settingsOf(uid)] });
  db.rpc.set_my_call_settings = (body, _d, uid) => {
    db.callLog.push({ rpc: "set_my_call_settings", uid, ...body });
    if (!["everyone", "following", "nobody"].includes(body.p_privacy)) return err("call_invalid_privacy");
    db.callSettings[uid] = { privacy: body.p_privacy, notify_missed: body.p_notify_missed };
    return { body: null };
  };
  const startBase = db.rpc.call_start;
  db.rpc.call_start = (body, _db, uid) => {
    const other = db.members.find((m) => m.conversation_id === body.p_conversation_id && m.user_id !== uid);
    if (other) {
      const pv = settingsOf(other.user_id).privacy;
      if (pv === "nobody" || (pv === "following" && !db.callFollows.some((f) => f.follower_id === other.user_id && f.following_id === uid))) return err("call_privacy");
    }
    return startBase(body, _db, uid);
  };
  // ---- Geçmiş okuması: PostgREST `calls` GET (RLS: yalnız arayan/aranan; süzgeç + imleç + sınır) ----
  const prevExtra = db.extraRoutes;
  db.extraRoutes = async (ctx) => {
    const { table, method, q, json, signedIn } = ctx;
    if (table === "calls" && method === "GET") {
      let rows = db.callRows.filter((r) => ["ended", "rejected", "missed"].includes(r.status) && (r.caller_id === signedIn || r.callee_id === signedIn));
      const conv = q.get("conversation_id"); if (conv) rows = rows.filter((r) => r.conversation_id === conv.replace(/^eq\./, ""));
      const lt = q.get("started_at"); if (lt?.startsWith("lt.")) rows = rows.filter((r) => r.started_at < lt.slice(3));
      rows = [...rows].sort((a, b) => b.started_at.localeCompare(a.started_at));
      json(200, rows.slice(0, Number(q.get("limit") ?? 1000)));
      return true;
    }
    return prevExtra ? prevExtra(ctx) : undefined;
  };
}

/** Geçmişe hazır çağrı satırı ekler (`ago`: saniye önce başladı; `dur`: görüşme süresi sn). */
function seedCall(db, { from, to, conv = CONV, type = "audio", status, ago = 60, dur = 0 }) {
  const started = Date.now() - ago * 1000;
  const row = { id: crypto.randomUUID(), conversation_id: conv, caller_id: from, callee_id: to, type, status, end_reason: null, started_at: new Date(started).toISOString(), answered_at: status === "ended" ? new Date(started + 2000).toISOString() : null, ended_at: new Date(started + (status === "ended" ? 2000 + dur * 1000 : 30000)).toISOString(), created_at: new Date(started).toISOString() };
  db.callRows.push(row);
  return row;
}

const callAuthorize = (db) => (topic, userId) => {
  const m = /^realtime:call:(.+)$/.exec(topic);
  if (!m) return true;
  const row = db.callRows?.find((r) => r.id === m[1]);
  return Boolean(row && [row.caller_id, row.callee_id].includes(userId));
};

/** `users`: ek kullanıcılar (her biri ayrı bağlam). `mediaInit`: addInitScript betiği (izin reddi / WebRTC yok taklidi). */
async function scenario(name, fn, { viewport = { width: 1280, height: 900 }, setup, lang = "tr", theme, mediaInit } = {}) {
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return;
  const db = createDb();
  const hub = createRealtimeHub({ authorize: (topic, userId) => callAuthorize(db)(topic, userId) });
  installCallServer(db, hub);
  setup?.(db);
  const opened = [];
  const errors = [];
  const consoleErrors = [];
  async function newSession(userId, { init = mediaInit, context } = {}) {
    const ctx = context ?? (await browser.newContext({ viewport, permissions: ["microphone", "camera"] }));
    if (!context) {
      await installMock(ctx, db, { signedIn: userId });
      await hub.install(ctx, userId);
      await ctx.addInitScript(([l, th]) => { try { localStorage.setItem("promptly-language", l); if (th) localStorage.setItem("promptly-theme", th); } catch {} }, [lang, theme]);
      // Alınan tüm yerel izleri kaydet: arama bitince durdurulduklarını (mikrofon/kamera ışığı) doğrularız.
      await ctx.addInitScript(() => {
        window.__tracks = [];
        const md = navigator.mediaDevices;
        if (md?.getUserMedia) {
          const orig = md.getUserMedia.bind(md);
          md.getUserMedia = async (c) => { const s = await orig(c); s.getTracks().forEach((t) => window.__tracks.push(t)); window.__gumCalls = (window.__gumCalls ?? 0) + 1; return s; };
        }
      });
      if (init) await ctx.addInitScript(init);
      opened.push(ctx);
    }
    const page = await ctx.newPage(); page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error" && !/stun|ERR_|Failed to load resource|net::|favicon/i.test(m.text())) consoleErrors.push(m.text()); });
    return page;
  }
  const alice = await newSession(ME);
  const bob = await newSession(BOB.id);
  try { await fn({ alice, bob, db, hub, newSession, ctxOf: (p) => p.context() }); assert.deepEqual(errors, [], "no uncaught page errors"); assert.deepEqual(consoleErrors, [], "no console errors"); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name + "\n      " + String(e.message).split("\n").slice(0, 12).join("\n      ")]); try { await alice.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/calls-fail-${results.length}-alice.png` }); await bob.screenshot({ path: `${process.env.TMPDIR ?? "/tmp"}/calls-fail-${results.length}-bob.png` }); } catch {} }
  finally { for (const c of opened) await c.close(); }
}

/** Arama başlatır; görüntülüde hazırlık ekranındaki "Ara"ya da basar (docs/history/450-*). */
const startCall = async (page, type) => {
  await page.locator(`[data-call-start="${type}"]`).click();
  if (type === "video") { await page.locator("[data-lobby-start]").waitFor(); await page.locator("[data-lobby-start]").click(); }
};
const seedDm = (db, opts = {}) => db.addConv(CONV, BOB, { texts: ["selam", "merhaba"], ...opts });
const openThread = async (page, id = CONV) => { await page.goto(`${BASE}/messages/local?id=${id}`); await page.locator("[data-message-id]").first().waitFor(); await page.waitForTimeout(300); };
const screen = (page) => page.locator("[data-call-screen]");
const incoming = (page) => page.locator("[data-incoming-call]");
const phaseOf = (page) => screen(page).getAttribute("data-call-phase");
const waitPhase = (page, phase, timeout = 15000) => page.waitForSelector(`[data-call-screen][data-call-phase="${phase}"]`, { timeout });
const tracksEnded = (page) => page.evaluate(() => window.__tracks.length > 0 && window.__tracks.every((t) => t.readyState === "ended"));
const noCallTopics = (hub, uid) => hub.joinedTopics(uid).filter((t) => t.includes("call:")).length === 0;
const rpcs = (db, name) => db.callLog.filter((c) => c.rpc === name);

// ====================================================================== BAŞLIK DÜĞMELERİ
await scenario("1. Başlık: birebir sohbette 🎙/📹 düğmeleri erişilebilir adla görünür; sohbeti bozmaz (mesaj listesi/arama düğmesi yerinde)", async ({ alice }) => {
  await openThread(alice);
  const voice = alice.locator('[data-call-start="audio"]'); const video = alice.locator('[data-call-start="video"]');
  assert.equal(await voice.count(), 1); assert.equal(await video.count(), 1);
  assert.match(await voice.getAttribute("aria-label"), /sesli ara.*Bob|Bob.*sesli/i);
  assert.match(await video.getAttribute("aria-label"), /görüntülü ara|Bob/i);
  assert.equal(await voice.getAttribute("title"), "Sesli arama");
  assert.equal(await alice.locator("[data-chat-search-toggle]").count(), 1, "search button intact");
  assert.ok((await voice.boundingBox()).width >= 36 && (await voice.boundingBox()).height >= 36, "touch target");
  assert.equal(await alice.locator("[data-message-id]").count(), 2);
}, { setup: (db) => seedDm(db) });

await scenario("2. Başlık: grup sohbetinde arama düğmesi YOK; bekleyen mesaj isteğinde ve engelliyken düğmeler soluk (basılamaz)", async ({ alice, newSession, db }) => {
  await openThread(alice, G);
  assert.equal(await alice.locator("[data-call-start]").count(), 0, "no call buttons in a group");
  const p2 = await newSession(ME);
  await openThread(p2, CONV);
  assert.equal(await p2.locator('[data-call-start="audio"]').isDisabled(), true, "pending request");
  assert.match(await p2.locator('[data-call-start="audio"]').getAttribute("title"), /yapılamıyor/);
  assert.equal(rpcs(db, "call_start").length, 0);
}, { setup: (db) => { db.addGroup(G, { members: [[BOB, "admin"]], texts: [[BOB, "merhaba"]] }); seedDm(db, { status: "pending" }); } });

// ====================================================================== SESLİ ARAMA — GERÇEK WEBRTC
await scenario("3. Sesli arama (Alice → Bob): çalar → Bob gelen arama görür → kabul → İKİ TARAF GERÇEK WebRTC ile bağlanır; ses akışı var; süre işler; mikrofon aç/kapa karşıya yansır; bitirince her iki ekran ve medya kapanır", async ({ alice, bob, db, hub }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await waitPhase(alice, "ringing");
  assert.equal(rpcs(db, "call_start").length, 1);
  assert.equal(rpcs(db, "call_start")[0].p_type, "audio");
  assert.equal(rpcs(db, "call_start")[0].p_conversation_id, CONV, "yalnız konuşma kimliği gider; aranan sunucuda çözülür");
  assert.equal("p_callee_id" in rpcs(db, "call_start")[0], false, "no client-supplied callee");

  const inc = incoming(bob); await inc.waitFor();
  assert.equal(await inc.getAttribute("data-call-type"), "audio");
  const txt = await inc.innerText();
  assert.ok(txt.includes("Alice") && txt.includes("Gelen arama") && txt.includes("Sesli arama"), txt);
  assert.equal(await inc.getAttribute("role"), "alertdialog");
  assert.equal(await inc.locator("[data-incoming-accept]").innerText().then((s) => s.trim()), "Kabul et");
  assert.equal(await inc.locator("[data-incoming-reject]").innerText().then((s) => s.trim()), "Reddet");

  await inc.locator("[data-incoming-accept]").click();
  await waitPhase(bob, "connected"); await waitPhase(alice, "connected");
  assert.equal(await incoming(bob).count(), 0, "incoming dialog closed after accepting");
  assert.equal(db.callRows[0].status, "accepted");

  // medya gerçekten akıyor: uzak <audio> elementinde canlı ses izi
  for (const p of [alice, bob]) {
    const info = await p.evaluate(() => { const a = document.querySelector("[data-remote-audio]"); const s = a?.srcObject; return { has: Boolean(s), audio: s?.getAudioTracks().length ?? 0, live: s?.getAudioTracks().every((t) => t.readyState === "live") ?? false }; });
    assert.deepEqual(info, { has: true, audio: 1, live: true }, "remote audio stream attached");
  }
  assert.ok(await screen(alice).locator("[data-call-status]").innerText().then((s) => /^\d{2}:\d{2}$/.test(s.trim())), "duration shown");
  await alice.waitForTimeout(2300);
  const dur = (await screen(alice).locator("[data-call-status]").innerText()).trim();
  assert.notEqual(dur, "00:00", "duration advances: " + dur);

  // mikrofon aç/kapat: kendi durumu + karşıdaki bildirim
  await alice.locator("[data-call-mic]").click();
  assert.equal(await alice.locator("[data-call-mic]").getAttribute("aria-pressed"), "true");
  assert.equal(await alice.locator("[data-call-mic]").getAttribute("data-call-mic"), "off");
  await bob.locator("[data-call-remote-state]").waitFor();
  assert.match(await bob.locator("[data-call-remote-state]").innerText(), /mikrofonunu kapattı/);
  await alice.locator("[data-call-mic]").click();
  await bob.locator("[data-call-remote-state]").waitFor({ state: "detached" });

  // bitir (Bob bitirir): iki taraf da kapanır
  await bob.locator("[data-call-end]").click();
  await alice.waitForSelector('[data-call-screen][data-call-phase="ended"]');
  await Promise.all([screen(alice).waitFor({ state: "detached" }), screen(bob).waitFor({ state: "detached" })]);
  assert.equal(db.callRows[0].status, "ended");
  assert.ok(await tracksEnded(alice) && await tracksEnded(bob), "mic tracks stopped on both sides");
  assert.ok(noCallTopics(hub, ME) && noCallTopics(hub, BOB.id), "signaling channels left (no subscription leak)");
  assert.equal(await alice.locator("[data-remote-audio]").count(), 0, "media elements removed");
}, { setup: (db) => seedDm(db) });

await scenario("4. Karşı yön (Bob → Alice) görüntülü arama: uzak VİDEO karesi gelir, yerel önizleme görünür; kamera kapat/aç karşıya yansır; arayan bitirir", async ({ alice, bob, db }) => {
  await openThread(alice); await openThread(bob);
  await startCall(bob, "video");
  await waitPhase(bob, "ringing");
  const inc = incoming(alice); await inc.waitFor();
  assert.equal(await inc.getAttribute("data-call-type"), "video");
  assert.ok((await inc.innerText()).includes("Görüntülü arama") && (await inc.innerText()).includes("Bob"));
  await inc.locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected"); await waitPhase(bob, "connected");
  assert.equal(await alice.locator("[data-call-camera]").count(), 1, "camera toggle only in video calls");
  for (const p of [alice, bob]) {
    await p.waitForFunction(() => { const v = document.querySelector("[data-remote-video]"); return v && v.videoWidth > 0 && v.readyState >= 2; }, null, { timeout: 15000 });
    assert.equal(await p.locator("[data-local-preview]").count(), 1, "local preview");
    assert.equal(await p.evaluate(() => document.querySelector("[data-local-preview] video").srcObject?.getVideoTracks().length), 1);
  }
  // kamera kapat → karşı tarafta "kamerasını kapattı"
  await alice.locator("[data-call-camera]").click();
  assert.equal(await alice.locator("[data-call-camera]").getAttribute("data-call-camera"), "off");
  await bob.locator("[data-call-remote-state]").waitFor();
  assert.match(await bob.locator("[data-call-remote-state]").innerText(), /kamerasını kapattı/);
  await alice.locator("[data-call-camera]").click();
  await bob.locator("[data-call-remote-state]").waitFor({ state: "detached" });
  await bob.locator("[data-call-end]").click();
  await Promise.all([screen(alice).waitFor({ state: "detached" }), screen(bob).waitFor({ state: "detached" })]);
  assert.ok(await tracksEnded(alice) && await tracksEnded(bob), "camera + mic tracks stopped on both sides");
  assert.equal(db.callRows[0].status, "ended");
}, { setup: (db) => seedDm(db) });

// ====================================================================== REDDET / VAZGEÇ / CEVAPSIZ
await scenario("5. Reddet: Bob reddeder → Alice 'Arama reddedildi' görür, ekran kapanır, medya durur; satır rejected", async ({ alice, bob, db, hub }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor();
  await incoming(bob).locator("[data-incoming-reject]").click();
  await waitPhase(alice, "rejected");
  assert.match(await screen(alice).innerText(), /Arama reddedildi/);
  assert.equal(await incoming(bob).count(), 0);
  assert.equal(db.callRows[0].status, "rejected");
  assert.equal(rpcs(db, "call_respond").at(-1).action, "reject");
  await screen(alice).waitFor({ state: "detached" });
  assert.ok(await tracksEnded(alice), "caller's mic released");
  assert.equal(await bob.evaluate(() => window.__gumCalls ?? 0), 0, "callee never opened the mic when declining");
  assert.ok(noCallTopics(hub, ME));
}, { setup: (db) => seedDm(db) });

await scenario("6. Vazgeç: arayan çalarken iptal eder → Bob'un gelen arama kartı kapanır; satır missed/cancelled; RPC 'cancel'", async ({ alice, bob, db }) => {
  await openThread(alice); await openThread(bob);
  await startCall(alice, "video");
  await incoming(bob).waitFor();
  assert.equal(await alice.locator("[data-call-end]").getAttribute("aria-label"), "Aramayı iptal et");
  await alice.locator("[data-call-end]").click();
  await incoming(bob).waitFor({ state: "detached" });
  await screen(alice).waitFor({ state: "detached" });
  assert.equal(db.callRows[0].status, "missed"); assert.equal(db.callRows[0].end_reason, "cancelled");
  assert.equal(rpcs(db, "call_respond").at(-1).action, "cancel");
  assert.ok(await tracksEnded(alice), "camera + mic released");
}, { setup: (db) => seedDm(db) });

await scenario("7. Cevapsız: Bob cevaplamazsa 45 sn sonra arayanda 'Cevap vermedi' + 'Tekrar ara'; RPC 'timeout'; Bob'un kartı kapanır", async ({ alice, bob, db }) => {
  await alice.clock.install(); // yalnız arayan sayfanın zamanı: 45 sn'lik zaman aşımı hızlandırılır
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await waitPhase(alice, "ringing");
  await incoming(bob).waitFor();
  await alice.clock.fastForward(46_000);
  await waitPhase(alice, "missed");
  assert.match(await screen(alice).innerText(), /Cevap vermedi/);
  assert.equal(await alice.locator("[data-call-retry]").count(), 1, "retry offered");
  assert.equal(rpcs(db, "call_respond").at(-1).action, "timeout");
  assert.equal(db.callRows[0].end_reason, "timeout");
  await incoming(bob).waitFor({ state: "detached" });
  assert.ok(await tracksEnded(alice), "mic released after timeout");
}, { setup: (db) => seedDm(db) });

// ====================================================================== İZİNLER / HATALAR
const DENY_ALL = () => { navigator.mediaDevices.getUserMedia = async () => { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; }; };
await scenario("8. Mikrofon izni reddedilir (sesli): anlaşılır mesaj, çağrı HİÇ oluşturulmaz, ekran açılmaz", async ({ alice, db }) => {
  await openThread(alice);
  await alice.locator('[data-call-start="audio"]').click();
  await alice.getByText("Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.").waitFor();
  assert.equal(rpcs(db, "call_start").length, 0, "no call row created without media permission");
  assert.equal(await screen(alice).count(), 0);
  assert.equal(await alice.getByText(/NotAllowedError/).count(), 0, "no technical error text");
}, { setup: (db) => seedDm(db), mediaInit: DENY_ALL });

await scenario("9. Kamera/mikrofon izni reddedilir (görüntülü): 'Mikrofon veya kamera izni verilmedi…'", async ({ alice, db }) => {
  await openThread(alice);
  await alice.locator('[data-call-start="video"]').click();
  await alice.getByText("Mikrofon veya kamera izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.").waitFor();
  assert.equal(rpcs(db, "call_start").length, 0);
}, { setup: (db) => seedDm(db), mediaInit: DENY_ALL });

await scenario("10. Aranan izin vermezse: kabul → izin hatası gösterilir, arama reddedilir, arayan 'reddedildi' görür", async ({ alice, bob, db, newSession }) => {
  // Bob'un yeni oturumu izni reddeder; (varsayılan Bob sayfası kullanılmaz)
  const denied = await newSession(BOB.id, { init: DENY_ALL });
  await openThread(alice); await openThread(denied);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(denied).waitFor();
  await incoming(denied).locator("[data-incoming-accept]").click();
  await denied.getByText("Mikrofon izni verilmedi. Tarayıcı ayarlarından izin verip tekrar deneyin.").waitFor();
  await waitPhase(alice, "rejected");
  assert.equal(db.callRows[0].status, "rejected");
  assert.equal(await incoming(denied).count(), 0);
  void bob;
}, { setup: (db) => seedDm(db) });

await scenario("11. Meşgul: sunucu call_busy derse arayan 'şu anda başka bir görüşmede' görür; ekran açılmaz, mikrofon bırakılır", async ({ alice, db }) => {
  db.failCallStart = "call_busy";
  await openThread(alice);
  await alice.locator('[data-call-start="audio"]').click();
  await alice.getByText("Bu kişi şu anda başka bir görüşmede.").waitFor();
  assert.equal(await screen(alice).count(), 0);
  assert.ok(await tracksEnded(alice), "mic released after failed start");
}, { setup: (db) => seedDm(db) });

await scenario("12. Engel (sunucu interaction_blocked): anlaşılır mesaj", async ({ alice, db }) => {
  db.failCallStart = "interaction_blocked";
  await openThread(alice);
  await alice.locator('[data-call-start="audio"]').click();
  await alice.getByText("Bu kişiyle etkileşime giremezsin.").first().waitFor();
  await alice.waitForTimeout(500);
  assert.equal(await alice.getByText("Bu kişiyle etkileşime giremezsin.").count(), 1, "shown once, not overwritten by a generic message");
  assert.equal(await alice.getByText("Arama başlatılamadı").count(), 0);
  assert.equal(await screen(alice).count(), 0);
  assert.ok(await tracksEnded(alice), "mic released");
}, { setup: (db) => seedDm(db) });

await scenario("13. WebRTC desteklenmeyen tarayıcı: 'Bu tarayıcı görüntülü görüşmeyi desteklemiyor.' ve hiçbir istek/izin istenmez", async ({ alice, db }) => {
  await openThread(alice);
  await alice.locator('[data-call-start="video"]').click();
  await alice.getByText("Bu tarayıcı görüntülü görüşmeyi desteklemiyor.").waitFor();
  assert.equal(rpcs(db, "call_start").length, 0);
  assert.equal(await alice.evaluate(() => window.__gumCalls ?? 0), 0, "no getUserMedia attempt");
}, { setup: (db) => seedDm(db), mediaInit: () => { delete window.RTCPeerConnection; delete window.webkitRTCPeerConnection; } });

// ====================================================================== YAŞAM DÖNGÜSÜ / ÇOKLU SEKME
await scenario("14. Gelen arama HER sayfada çalar (sohbet dışında, ör. Ayarlar) ve kabul edilebilir", async ({ alice, bob }) => {
  await openThread(alice);
  await bob.goto(`${BASE}/settings`); await bob.waitForTimeout(800);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor();
  await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(bob, "connected"); await waitPhase(alice, "connected");
  await alice.locator("[data-call-end]").click();
  await Promise.all([screen(alice).waitFor({ state: "detached" }), screen(bob).waitFor({ state: "detached" })]);
}, { setup: (db) => seedDm(db) });

await scenario("15. Sayfa yenileme: çalışan sayfa kapanırken karşıya haber verilir, karşı taraf görüşmeyi bitirir; yenilenen sekme takılı çağrıyı 'interrupted' ile kapatır", async ({ alice, bob, db, hub }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected"); await waitPhase(bob, "connected");
  await alice.reload();
  await Promise.all([screen(bob).waitFor({ state: "detached", timeout: 15000 }).catch(() => {}), alice.locator("[data-message-id]").first().waitFor()]);
  await bob.waitForSelector("[data-call-screen]", { state: "detached", timeout: 15000 });
  assert.equal(db.callRows[0].status, "ended", "call ended after reload");
  assert.ok(await tracksEnded(bob), "Bob's media released");
  assert.ok(noCallTopics(hub, BOB.id));
}, { setup: (db) => seedDm(db) });

await scenario("16. Çoklu sekme: Bob'un iki sekmesi de çalar; birinde kabul edilince diğerindeki kart kapanır; diğer sekmeyi yenilemek görüşmeyi BİTİRMEZ", async ({ alice, bob, db, newSession }) => {
  await openThread(alice); await openThread(bob);
  const bob2 = await newSession(BOB.id, { context: bob.context() });
  await openThread(bob2);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor(); await incoming(bob2).waitFor();
  await incoming(bob).locator("[data-incoming-accept]").click();
  await incoming(bob2).waitFor({ state: "detached" });
  await waitPhase(bob, "connected"); await waitPhase(alice, "connected");
  await bob2.reload(); await bob2.locator("[data-message-id]").first().waitFor(); await bob2.waitForTimeout(1200);
  assert.equal(db.callRows[0].status, "accepted", "other tab's reload did not end the live call");
  assert.equal(await phaseOf(alice), "connected");
  assert.equal(await screen(bob2).count(), 0, "second tab shows no call UI");
  await bob.locator("[data-call-end]").click();
  await Promise.all([screen(alice).waitFor({ state: "detached" }), screen(bob).waitFor({ state: "detached" })]);
}, { setup: (db) => seedDm(db) });

await scenario("17. Zaten görüşmedeyken ikinci arama başlatılamaz (düğmeler pasif)", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await waitPhase(alice, "ringing");
  assert.equal(await alice.locator('[data-call-start="audio"]').isDisabled(), true, "buttons disabled while a call is active (visible behind the overlay)");
  await alice.locator("[data-call-end]").click();
  await screen(alice).waitFor({ state: "detached" });
  assert.equal(await alice.locator('[data-call-start="audio"]').isDisabled(), false, "re-enabled afterwards");
}, { setup: (db) => seedDm(db) });

// ====================================================================== DÜZEN
await scenario("18. Masaüstü: görüşme ekranı ortalanmış kart (tam ekran DEĞİL), kontrol çubuğu görünür; taşma yok", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await startCall(alice, "video");
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected");
  const vp = alice.viewportSize();
  const card = await screen(alice).locator("> div").first().boundingBox();
  assert.ok(card.width < vp.width - 100 && card.width <= 770, `card width ${card.width}`);
  assert.ok(Math.abs(card.x + card.width / 2 - vp.width / 2) < 2, "horizontally centered");
  assert.ok(Math.abs(card.y + card.height / 2 - vp.height / 2) < 2, "vertically centered");
  for (const sel of ["[data-call-mic]", "[data-call-camera]", "[data-call-end]"]) { const b = await alice.locator(sel).boundingBox(); assert.ok(b.height >= 44 && b.width >= 44, `${sel} touch target`); }
  assert.equal(await alice.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal overflow");
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db) });

await scenario("19. Mobil (iPhone ölçüsü): görüşme ekranı TAM EKRAN, kontroller altta ve ≥44px, gelen arama kartı sığar, taşma yok", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await startCall(alice, "video");
  const inc = incoming(bob); await inc.waitFor();
  const ib = await inc.boundingBox(); const vp = bob.viewportSize();
  assert.ok(ib.x >= 0 && ib.x + ib.width <= vp.width, "incoming card fits the width");
  for (const sel of ["[data-incoming-accept]", "[data-incoming-reject]"]) { const b = await inc.locator(sel).boundingBox(); assert.ok(b.height >= 44, `${sel} height ${b.height}`); }
  await inc.locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected"); await waitPhase(bob, "connected");
  for (const p of [alice, bob]) {
    const card = await screen(p).locator("> div").first().boundingBox();
    assert.ok(card.width >= vp.width - 1 && card.height >= vp.height - 1, `full-screen ${JSON.stringify(card)}`);
    const end = await p.locator("[data-call-end]").boundingBox();
    assert.ok(end.y > vp.height * 0.7, "controls at the bottom"); assert.ok(end.y + end.height <= vp.height, "controls inside the viewport");
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal overflow");
  }
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db), viewport: { width: 390, height: 844 } });

await scenario("20. İngilizce arayüz: düğme adları, gelen arama, durum ve denetim etiketleri çevrilmiş", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  assert.match(await alice.locator('[data-call-start="audio"]').getAttribute("aria-label"), /voice call/i);
  assert.equal(await alice.locator('[data-call-start="video"]').getAttribute("title"), "Video call");
  await alice.locator('[data-call-start="audio"]').click();
  const inc = incoming(bob); await inc.waitFor();
  const text = await inc.innerText();
  assert.ok(text.includes("Incoming call") && text.includes("Voice call") && text.includes("Accept") && text.includes("Decline"), text);
  await inc.locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected");
  assert.equal(await alice.locator("[data-call-mic]").getAttribute("aria-label"), "Mute microphone");
  assert.equal(await alice.locator("[data-call-end]").getAttribute("aria-label"), "End call");
  await alice.locator("[data-call-end]").click();
  await screen(bob).waitFor({ state: "detached" });
}, { setup: (db) => seedDm(db), lang: "en" });

await scenario("21. Koyu tema: gelen arama ve görüşme ekranı okunur (kart yüzeyi tema renginde)", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  const inc = incoming(bob); await inc.waitFor();
  const bg = await inc.evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(bg, "rgba(0, 0, 0, 0)", "opaque card"); assert.ok(!/^rgb\(255, 255, 255\)/.test(bg), "not light surface in dark theme: " + bg);
  await inc.locator("[data-incoming-reject]").click();
}, { setup: (db) => seedDm(db), theme: "dark" });

await scenario("22. Sinyalleşme güvenliği: arama kanalı PRIVATE; Realtime'a yalnız kanal katılımı + Broadcast gider, SDP/ICE veritabanı isteği olarak GİTMEZ", async ({ alice, bob, db, hub }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected");
  const joins = hub.log.filter((l) => l.event === "phx_join" && l.topic.includes("call:"));
  assert.ok(joins.length >= 2, "both sides joined the call channel");
  assert.ok(joins.every((j) => j.payload?.config?.private === true), "call channel is private");
  const events = new Set(hub.log.filter((l) => l.topic.includes("call:") && l.event?.startsWith("broadcast:")).map((l) => l.event));
  for (const e of ["broadcast:call_accepted", "broadcast:call_offer", "broadcast:call_answer", "broadcast:ice_candidate"]) assert.ok(events.has(e), `${e} sent over Broadcast`);
  const offer = hub.log.find((l) => l.event === "broadcast:call_offer");
  assert.equal(offer.userId, ME, "the CALLER sends the offer (after the callee said ready)");
  assert.equal(hub.log.find((l) => l.event === "broadcast:call_answer").userId, BOB.id);
  const dbWrites = db.calls.filter((c) => /sdp|candidate/i.test(JSON.stringify(c.body ?? {})));
  assert.equal(dbWrites.length, 0, "no SDP/ICE written through REST");
  assert.equal(db.callLog.filter((c) => c.rpc === "call_respond" && c.action !== "accept").length, 0, "no extra writes during the call (only start + accept)");
  await alice.locator("[data-call-end]").click();
  // yetkisiz üçüncü kullanıcı kanala giremez
  const topic = `realtime:call:${db.callRows[0].id}`;
  assert.equal(callAuthorize(db)(topic, U.carol.id), false, "stranger cannot join");
  assert.equal(callAuthorize(db)(topic, ME), true);
}, { setup: (db) => seedDm(db) });


// ====================================================================== FAZ 1–3 (docs/history/450-*)
const bothConnected = async (alice, bob, type = "audio") => {
  await startCall(alice, type);
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected"); await waitPhase(bob, "connected");
};

await scenario("23. Görüntülü hazırlık ekranı: önizleme + anahtarlar; Vazgeç çağrı OLUŞTURMAZ ve kamera ışığı söner; kamera kapalı başlatınca karşı taraf görür", async ({ alice, bob, db }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="video"]').click();
  await alice.locator("[data-call-lobby]").waitFor();
  assert.equal(await alice.locator("[data-lobby-preview] video").count(), 1, "camera preview");
  assert.equal(rpcs(db, "call_start").length, 0, "no call before Ara");
  await alice.locator("[data-lobby-cancel]").click();
  await alice.locator("[data-call-lobby]").waitFor({ state: "detached" });
  assert.equal(rpcs(db, "call_start").length, 0);
  assert.equal(await tracksEnded(alice), true, "camera/mic released on cancel");
  await alice.locator('[data-call-start="video"]').click();
  await alice.locator("[data-call-lobby]").waitFor();
  await alice.locator("[data-lobby-camera]").click();
  assert.equal(await alice.locator("[data-lobby-camera]").getAttribute("data-lobby-camera"), "off");
  await alice.locator("[data-lobby-start]").click();
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected"); await waitPhase(bob, "connected");
  await bob.locator("[data-call-remote-state]").waitFor();
  assert.match(await bob.locator("[data-call-remote-state]").innerText(), /kamerasını kapattı/);
  assert.equal(await alice.locator("[data-call-camera]").getAttribute("data-call-camera"), "off");
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db) });

await scenario("24. Küçült: görüşme mini pencereye döner; ses kesilmez, sayfa değişince sürer; mini'den mikrofon karşıya yansır; Büyüt ekranı getirir; mini'den bitirince iki taraf kapanır", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await bothConnected(alice, bob);
  await alice.evaluate(() => { window.__marker = 1; });
  await alice.locator("[data-call-minimize]").click();
  await alice.locator("[data-mini-call]").waitFor();
  assert.equal(await screen(alice).count(), 0, "full screen gone");
  assert.equal(await alice.evaluate(() => { const a = document.querySelector("[data-remote-audio]"); return Boolean(a && a.srcObject && !a.paused); }), true, "remote audio keeps playing");
  const vp = alice.viewportSize(); const mb = await alice.locator("[data-mini-call]").boundingBox();
  assert.ok(mb.x >= 0 && mb.y >= 0 && mb.x + mb.width <= vp.width && mb.y + mb.height <= vp.height, "mini inside the viewport");
  await alice.locator('nav a[href$="/discover"], nav a[href$="/discover/"]').first().click();
  await alice.waitForURL(/\/discover/);
  assert.equal(await alice.evaluate(() => window.__marker), 1, "client-side navigation, page not reloaded");
  await alice.locator("[data-mini-call]").waitFor();
  assert.equal(await phaseOf(bob), "connected", "call survives navigation");
  await alice.locator("[data-mini-call] [data-call-mic]").click();
  await bob.locator("[data-call-remote-state]").waitFor();
  assert.match(await bob.locator("[data-call-remote-state]").innerText(), /mikrofonunu kapattı/);
  await alice.locator("[data-call-expand]").click();
  await screen(alice).waitFor();
  assert.equal(await alice.locator("[data-mini-call]").count(), 0);
  await alice.locator("[data-call-minimize]").click();
  await alice.locator("[data-mini-call] [data-call-end]").click();
  await alice.locator("[data-mini-call]").waitFor({ state: "detached" });
  await screen(bob).waitFor({ state: "detached", timeout: 8000 });
  assert.equal(await tracksEnded(alice), true, "media released");
}, { setup: (db) => seedDm(db) });

await scenario("25. Görüntülü: küçük pencere fareyle sürüklenip köşeye yapışır; dokununca görüntüler yer değiştirir; kalite çipi görünür", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await bothConnected(alice, bob, "video");
  const pip = alice.locator("[data-local-preview]"); await pip.waitFor();
  const card = await screen(alice).locator("> div").first().boundingBox();
  const b0 = await pip.boundingBox();
  assert.ok(b0.x > card.x + card.width / 2, "starts at the right");
  await alice.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await alice.mouse.down();
  await alice.mouse.move(card.x + 90, card.y + card.height - 170, { steps: 8 });
  await alice.mouse.up();
  await alice.waitForTimeout(450);
  const b1 = await pip.boundingBox();
  assert.ok(b1.x < card.x + card.width / 2 && b1.y > card.y + card.height / 2, `snapped to bottom-left ${JSON.stringify(b1)}`);
  assert.equal(await pip.getAttribute("data-pip-swapped"), "false", "dragging does not swap");
  assert.equal(await alice.locator("[data-local-preview] [data-remote-video]").count(), 0, "pip shows my own view");
  await pip.click();
  assert.equal(await pip.getAttribute("data-pip-swapped"), "true");
  assert.equal(await alice.locator("[data-local-preview] [data-remote-video]").count(), 1, "pip now shows the speaker");
  await pip.click();
  assert.equal(await pip.getAttribute("data-pip-swapped"), "false");
  await alice.locator("[data-call-quality]").waitFor({ timeout: 10000 });
  assert.match(await alice.locator("[data-call-quality]").innerText(), /İyi|Orta|Zayıf/);
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db) });

await scenario("26. ⋯ menüsü: görüntüleri değiştir menüden de çalışır; mikrofon seçimi görüşmeyi koparmadan yeni mikrofonu alır ve tercih olarak saklanır", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await bothConnected(alice, bob, "video");
  await alice.locator("[data-call-more]").click();
  await alice.locator("[data-call-menu]").waitFor();
  await alice.locator("[data-call-swap]").click();
  assert.equal(await alice.locator("[data-local-preview]").getAttribute("data-pip-swapped"), "true");
  assert.equal(await alice.locator("[data-call-menu]").count(), 0, "menu closes after the action");
  await alice.locator("[data-call-more]").click();
  const mics = alice.locator('[data-call-menu] [role="group"]').first().locator('[role="menuitemradio"]');
  await mics.first().waitFor();
  assert.ok((await mics.count()) >= 1, "microphone list");
  const before = await alice.evaluate(() => window.__gumCalls);
  await mics.last().click();
  await alice.waitForFunction((n) => window.__gumCalls > n, before);
  assert.equal(await phaseOf(alice), "connected", "call stays connected");
  assert.equal(await alice.evaluate(() => Boolean(JSON.parse(localStorage.getItem("promptly-call-devices") || "{}").mic)), true, "device remembered");
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db) });

const seedHistory = (db) => {
  seedDm(db);
  seedCall(db, { from: BOB.id, to: ME, status: "missed", type: "audio", ago: 300 });
  seedCall(db, { from: ME, to: BOB.id, status: "ended", type: "video", ago: 200, dur: 65 });
  seedCall(db, { from: ME, to: BOB.id, status: "rejected", type: "audio", ago: 100 });
};

await scenario("27. Sohbet akışı: bitmiş aramalar kayıt satırı olur (cevapsız kırmızı, süre, 'Geri ara'); canlı arama bitince yeni kayıt kendiliğinden eklenir", async ({ alice, bob, db }) => {
  await openThread(alice);
  const rows = alice.locator("[data-call-log]");
  assert.equal(await rows.count(), 3);
  assert.deepEqual(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-call-outcome"))), ["missed", "completed", "declined"], "oldest → newest, after the messages");
  assert.match(await rows.nth(0).innerText(), /Cevapsız sesli arama/);
  assert.equal(await rows.nth(0).locator("span.text-danger").count() > 0, true, "missed is red");
  assert.match(await rows.nth(1).innerText(), /Giden görüntülü arama/);
  assert.match(await rows.nth(1).innerText(), /01:05/);
  assert.match(await rows.nth(2).innerText(), /Arama reddedildi/);
  assert.equal(await rows.nth(2).locator("[data-call-callback]").innerText(), "Tekrar ara");
  assert.equal(await rows.nth(1).locator("[data-call-callback]").count(), 0, "completed has no action");
  await openThread(bob);
  await rows.nth(0).locator("[data-call-callback]").click();
  await incoming(bob).waitFor();
  assert.equal(rpcs(db, "call_start").at(-1).p_type, "audio", "callback keeps the call type");
  await alice.locator("[data-call-end]").click();
  await alice.waitForFunction(() => document.querySelectorAll("[data-call-log]").length === 4);
  assert.match(await alice.locator("[data-call-log]").last().innerText(), /Cevap vermedi/);
}, { setup: seedHistory });

await scenario("28. Mesaj listesi: son arama son mesajdan yeniyse önizleme aramayı gösterir (cevapsız kırmızı)", async ({ alice }) => {
  await alice.goto(`${BASE}/messages`);
  const row = alice.locator("[data-conversation-row]").first(); await row.waitFor();
  const prev = row.locator('[data-call-preview="missed"]'); await prev.waitFor();
  assert.match(await prev.innerText(), /Cevapsız sesli arama/);
  assert.equal(await row.locator("[data-call-preview]").count(), 1);
}, { setup: (db) => { seedDm(db); seedCall(db, { from: BOB.id, to: ME, status: "missed", type: "audio", ago: 20 }); } });

await scenario("28b. Mesaj listesi: eski arama son mesajın yerine geçmez", async ({ alice }) => {
  await alice.goto(`${BASE}/messages`);
  await alice.locator("[data-conversation-row]").first().waitFor(); await alice.waitForTimeout(600);
  assert.equal(await alice.locator("[data-call-preview]").count(), 0);
}, { setup: (db) => { seedDm(db); seedCall(db, { from: BOB.id, to: ME, status: "missed", type: "audio", ago: 90_000_000 }); } });

await scenario("29. Aramalar bölümü: menüde cevapsız rozeti; satırlar kişi adı + sonuç; süzgeç çipleri; satırdan tekrar arama", async ({ alice, bob, db }) => {
  await alice.goto(`${BASE}/messages`);
  await alice.locator("[data-conversation-row]").first().waitFor();
  await alice.locator("[data-section-menu]").first().click();
  const option = alice.locator('[data-section-option="calls"]'); await option.waitFor();
  assert.match(await option.innerText(), /Aramalar/);
  await option.click();
  await alice.locator("[data-call-history]").waitFor();
  const items = alice.locator("[data-call-item]");
  await items.first().waitFor();
  assert.equal(await items.count(), 3);
  assert.match(await items.first().innerText(), /Bob/);
  assert.match(await items.first().innerText(), /Arama reddedildi/, "newest first");
  await alice.locator('[data-call-filter="missed"]').click();
  assert.equal(await items.count(), 1);
  assert.equal(await items.first().getAttribute("data-call-outcome"), "missed");
  await alice.locator('[data-call-filter="video"]').click();
  assert.equal(await items.count(), 1);
  await alice.locator('[data-call-filter="all"]').click();
  await openThread(bob);
  await items.first().locator('[data-call-again="audio"]').click();
  await incoming(bob).waitFor();
  assert.equal(rpcs(db, "call_start").at(-1).p_type, "audio");
  await alice.locator("[data-call-end]").click();
}, { setup: seedHistory });

await scenario("29b. Aramalar bölümü: hiç arama yoksa boş durum gösterilir", async ({ alice }) => {
  await alice.goto(`${BASE}/messages`);
  await alice.locator("[data-conversation-row]").first().waitFor();
  await alice.locator("[data-section-menu]").first().click();
  await alice.locator('[data-section-option="calls"]').click();
  await alice.getByText("Henüz arama yok.").waitFor();
}, { setup: (db) => seedDm(db) });

await scenario("30. Kişi bilgisi: bu kişiyle son aramalar listelenir", async ({ alice }) => {
  await openThread(alice);
  await alice.locator("[data-contact-open]").click();
  const box = alice.locator("[data-contact-calls]"); await box.waitFor();
  await box.locator("[data-call-log]").first().waitFor();
  assert.equal(await box.locator("[data-call-log]").count(), 3);
}, { setup: seedHistory });

await scenario("31. Ayarlar → Aramalar: kim arayabilir (sunucuda zorlanır), cevapsız bildirimi, cihaz tercihleri; kalıcı", async ({ alice, bob, db }) => {
  await alice.goto(`${BASE}/settings`);
  await alice.locator('a[href$="/settings/calls"], a[href$="/settings/calls/"]').first().waitFor();
  await alice.goto(`${BASE}/settings/calls`);
  await alice.locator('[data-call-privacy="everyone"]').waitFor();
  assert.equal(await alice.locator('[data-call-privacy="everyone"]').isChecked(), true);
  await alice.locator('[data-call-privacy="nobody"]').click();
  await alice.waitForFunction(() => document.querySelector('[data-call-privacy="nobody"]')?.checked);
  assert.equal(rpcs(db, "set_my_call_settings").at(-1).p_privacy, "nobody");
  await openThread(bob);
  const bobCallEnabled = () => bob.waitForFunction(() => { const b = document.querySelector('[data-call-start="audio"]'); return b && !b.disabled; });
  await bob.locator('[data-call-start="audio"]').click();
  await bob.getByText("Bu kişi şu an senden arama kabul etmiyor.").waitFor();
  assert.equal(db.callRows.length, 0, "no call row created");
  await alice.locator("[data-call-notify-missed]").click();
  await alice.waitForFunction(() => document.querySelector("[data-call-notify-missed]")?.getAttribute("aria-checked") === "false");
  assert.equal(rpcs(db, "set_my_call_settings").at(-1).p_notify_missed, false);
  await alice.locator('[data-call-pref="ring"]').click();
  assert.equal(await alice.evaluate(() => JSON.parse(localStorage.getItem("promptly-call-prefs")).ringSound), false);
  await alice.reload();
  await alice.waitForFunction(() => document.querySelector('[data-call-privacy="nobody"]')?.checked, null, { timeout: 8000 });
  assert.equal(await alice.locator('[data-call-privacy="nobody"]').isChecked(), true, "persisted");
  assert.equal(await alice.locator('[data-call-pref="ring"]').getAttribute("aria-checked"), "false");
  assert.match(await alice.locator("[data-call-privacy-note]").innerText(), /IP adresini/);
  // Takip ettiklerim: aranan arayanı takip ediyorsa arama başlar
  await alice.locator('[data-call-privacy="following"]').click();
  await alice.waitForFunction(() => document.querySelector('[data-call-privacy="following"]')?.checked);
  await bobCallEnabled();
  await bob.locator('[data-call-start="audio"]').click();
  await bob.waitForFunction(() => document.body.innerText.includes("kabul etmiyor"));
  await bobCallEnabled();
  db.callFollows.push({ follower_id: ME, following_id: BOB.id });
  await bob.locator('[data-call-start="audio"]').click();
  await bob.locator("[data-call-screen]").waitFor();
  await bob.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db) });

await scenario("32. Gelen arama zili cihaz tercihine uyar (kapalıysa ses üretilmez); kart yine görünür", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor();
  await bob.waitForFunction(() => window.__acCount >= 1);
  await incoming(bob).locator("[data-incoming-reject]").click();
  await bob.evaluate(() => localStorage.setItem("promptly-call-prefs", JSON.stringify({ ringSound: false, respectQuietHours: true, browserNotify: true })));
  await bob.reload(); await bob.locator("[data-message-id]").first().waitFor(); await bob.waitForTimeout(400);
  await bob.evaluate(() => { window.__acCount = 0; });
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor(); await bob.waitForTimeout(700);
  assert.equal(await bob.evaluate(() => window.__acCount), 0, "no ringtone");
  await incoming(bob).locator("[data-incoming-reject]").click();
}, { setup: (db) => { seedDm(db); db.rpc.get_my_quiet_hours = () => ({ body: [{ enabled: false, start_minute: 1380, end_minute: 480, tz: "UTC" }] }); },
  mediaInit: () => { window.__acCount = 0; const A = window.AudioContext; if (A) window.AudioContext = class extends A { constructor(...a) { super(...a); window.__acCount += 1; } }; } });

await scenario("32b. Sekme arka plandayken gelen arama başlığa 'Gelen arama' uyarısı koyar, kapanınca kaldırır", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  const base = await bob.title();
  await alice.locator('[data-call-start="audio"]').click();
  await incoming(bob).waitFor();
  await bob.waitForFunction(() => /^Gelen arama/.test(document.title));
  await incoming(bob).locator("[data-incoming-reject]").click();
  await bob.waitForFunction((b) => document.title === b, base);
}, { setup: (db) => { seedDm(db); db.rpc.get_my_quiet_hours = () => ({ body: [{ enabled: false, start_minute: 1380, end_minute: 480, tz: "UTC" }] }); },
  mediaInit: () => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); } });

await scenario("33. Mesajlar çalışma alanı: masaüstünde 84 px ince ray (248 px kenar çubuğu YOK); diğer sayfalarda kenar çubuğu kalır", async ({ alice }) => {
  await alice.goto(`${BASE}/messages`);
  await alice.locator("[data-conversation-row]").first().waitFor();
  const rail = alice.locator("aside[data-app-chrome]");
  assert.equal(await rail.count(), 1, "only the rail on /messages");
  const rb = await rail.boundingBox();
  assert.ok(Math.abs(rb.width - 84) <= 1, `rail width ${rb.width}`);
  const rowX = (await alice.locator("[data-conversation-row]").first().boundingBox()).x;
  assert.ok(rowX >= 84 && rowX < 130, `workspace starts right after the rail (${rowX})`);
  assert.equal(await alice.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no overflow");
  await alice.goto(`${BASE}/discover`);
  await alice.waitForSelector("aside[data-app-chrome]", { state: "attached" });
  await alice.waitForTimeout(400);
  const widths = await alice.locator("aside[data-app-chrome]").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().width)));
  assert.deepEqual(widths, [248], "regular pages keep the 248px sidebar at lg+");
}, { setup: (db) => seedDm(db), viewport: { width: 1440, height: 900 } });

await scenario("34. Mobil: küçültülmüş görüşme ekrana sığar ve dokununca büyür", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await bothConnected(alice, bob);
  await alice.locator("[data-call-minimize]").click();
  const mini = alice.locator("[data-mini-call]"); await mini.waitFor();
  const vp = alice.viewportSize(); const b = await mini.boundingBox();
  assert.ok(b.x >= 0 && b.x + b.width <= vp.width && b.y >= 0 && b.y + b.height <= vp.height, `mini fits ${JSON.stringify(b)}`);
  for (const sel of ["[data-call-expand]", "[data-call-mic]", "[data-call-end]"]) { const bb = await mini.locator(sel).boundingBox(); assert.ok(bb.width >= 36 && bb.height >= 36, `${sel} touch target ${bb.width}x${bb.height}`); }
  await mini.locator("[data-call-expand]").click();
  await screen(alice).waitFor();
  await alice.locator("[data-call-end]").click();
}, { setup: (db) => seedDm(db), viewport: { width: 390, height: 844 } });

await scenario("35. İngilizce: hazırlık ekranı, mini pencere, kayıt satırları ve ayarlar çevrilmiş", async ({ alice, bob }) => {
  await openThread(alice); await openThread(bob);
  await alice.locator('[data-call-start="video"]').click();
  await alice.locator("[data-call-lobby]").waitFor();
  assert.match(await alice.locator("[data-call-lobby]").innerText(), /Video call[\s\S]*Call/);
  await alice.locator("[data-lobby-start]").click();
  await incoming(bob).waitFor(); await incoming(bob).locator("[data-incoming-accept]").click();
  await waitPhase(alice, "connected");
  assert.equal(await alice.locator("[data-call-minimize]").getAttribute("aria-label"), "Minimize");
  assert.equal(await alice.locator("[data-local-preview]").getAttribute("title"), "Drag to move · Tap to swap");
  await alice.locator("[data-call-end]").click();
  await alice.waitForFunction(() => document.querySelectorAll("[data-call-log]").length >= 1);
  assert.match(await alice.locator("[data-call-log]").first().innerText(), /Missed voice call|Outgoing|No answer|Incoming/);
  await alice.goto(`${BASE}/settings/calls`);
  await alice.getByText("Who can call you?").waitFor();
}, { setup: seedHistory, lang: "en" });

console.log(results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
