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
  setup?.(db);
  const hub = createRealtimeHub({ authorize: (topic, userId) => callAuthorize(db)(topic, userId) });
  installCallServer(db, hub);
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
  await bob.locator('[data-call-start="video"]').click();
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
  await alice.locator('[data-call-start="video"]').click();
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
  await alice.locator('[data-call-start="video"]').click();
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
  await alice.locator('[data-call-start="video"]').click();
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

console.log(results.map(([s, n]) => `${s}  ${n}`).join("\n"));
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close(); server.close();
process.exit(failed ? 1 : 0);
