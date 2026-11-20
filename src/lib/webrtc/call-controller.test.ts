/**
 * `CallController` yaşam döngüsü testi (docs/history/449-*): gerçek WebRTC/Realtime YERİNE sahte eş + sahte sinyal kanalı.
 * Burada sınanan: aşama geçişleri, el sıkışma sırası (aranan "hazırım" → arayan teklif → aranan yanıt), zaman aşımları, temizlik.
 * Gerçek iki tarayıcı arası medya bağlantısı ayrıca elle sınanır (docs/history/449-*, "Elle test listesi").
 */
import { test, mock, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { CallController, type CallDeps } from "./call-controller.ts";
import { CALL_CONNECT_TIMEOUT_MS, CALL_DISCONNECT_GRACE_MS, CALL_READY_MAX_RETRIES, CALL_READY_RETRY_MS, CALL_RING_TIMEOUT_MS } from "./call-rules.ts";
import type { PeerLike, PeerOptions } from "./peer.ts";
import type { SignalingLike } from "./signaling.ts";
import type { CallAction, CallRole, CallRow, CallSignalEvent, CallSignalHandlers, CallSignalPayloads, CallType } from "./types.ts";

class FakeTrack {
  kind: "audio" | "video";
  enabled = true;
  stopped = false;
  constructor(kind: "audio" | "video") {
    this.kind = kind;
  }
  stop() {
    this.stopped = true;
  }
}

function fakeStream(type: CallType) {
  const tracks = type === "video" ? [new FakeTrack("audio"), new FakeTrack("video")] : [new FakeTrack("audio")];
  const stream = {
    tracks,
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
    getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
  };
  return stream as unknown as MediaStream & { tracks: FakeTrack[] };
}

class FakePeer implements PeerLike {
  opts: PeerOptions;
  closed = false;
  offers = 0;
  offerSdp = "v=0 offer";
  answerSdp = "v=0 answer";
  remoteOffer: string | null = null;
  remoteAnswer: string | null = null;
  candidates: RTCIceCandidateInit[] = [];
  failOffer = false;
  constructor(opts: PeerOptions) {
    this.opts = opts;
  }
  addLocalStream() {}
  async createOffer() {
    this.offers += 1;
    if (this.failOffer) throw new Error("boom");
    return { type: "offer" as const, sdp: this.offerSdp };
  }
  async acceptOffer(sdp: string) {
    this.remoteOffer = sdp;
    return { type: "answer" as const, sdp: this.answerSdp };
  }
  async acceptAnswer(sdp: string) {
    this.remoteAnswer = sdp;
  }
  async addIceCandidate(c: RTCIceCandidateInit) {
    this.candidates.push(c);
  }
  close() {
    this.closed = true;
  }
}

class FakeSignaling implements SignalingLike {
  handlers: CallSignalHandlers;
  sent: { event: string; payload: unknown }[] = [];
  left = 0;
  joinError: Error | null = null;
  joinGate: Promise<void> | null = null;
  constructor(handlers: CallSignalHandlers) {
    this.handlers = handlers;
  }
  async join() {
    if (this.joinGate) await this.joinGate;
    if (this.joinError) throw this.joinError;
  }
  async send<E extends CallSignalEvent>(event: E, payload: CallSignalPayloads[E]) {
    this.sent.push({ event, payload });
  }
  leave() {
    this.left += 1;
  }
  emit<E extends CallSignalEvent>(event: E, payload: CallSignalPayloads[E]) {
    (this.handlers[event] as ((p: CallSignalPayloads[E]) => void) | undefined)?.(payload);
  }
  count(event: string) {
    return this.sent.filter((s) => s.event === event).length;
  }
}

function makeCall(type: CallType, role: CallRole, over: Partial<CallRow> = {}): CallRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    conversationId: "44444444-4444-4444-8444-444444444444",
    callerId: role === "caller" ? "me" : "them",
    calleeId: role === "caller" ? "them" : "me",
    type,
    status: role === "caller" ? "ringing" : "accepted",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    ...over,
  };
}

function setup(t: TestContext, type: CallType, role: CallRole) {
  // Aynı testte birden çok denetleyici kurulabilir: mock zamanlayıcı yalnız bir kez açılır.
  try {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  } catch {
    /* zaten açık */
  }
  const stream = fakeStream(type);
  const rpc: { action: CallAction; reason?: string }[] = [];
  const owner: string[] = [];
  const created: { peer?: FakePeer; signaling?: FakeSignaling } = {};
  const deps: CallDeps = {
    iceServers: [],
    createPeer: (opts) => (created.peer = new FakePeer(opts)),
    createSignaling: (_id, handlers) => (created.signaling = new FakeSignaling(handlers)),
    respond: async (_id, action, reason) => {
      rpc.push({ action, reason });
    },
    claimOwner: (id) => owner.push(`claim:${id}`),
    releaseOwner: (id) => owner.push(`release:${id}`),
  };
  const controller = new CallController(makeCall(type, role), role, stream, deps);
  return { controller, stream, rpc, owner, created };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function flush() {
  for (let i = 0; i < 6; i += 1) await tick();
}

test("arayan: calling → ringing → (aranan hazır) connecting + teklif → yanıt → connected → kapat", async (t) => {
  const { controller, stream, rpc, owner, created } = setup(t, "audio", "caller");
  assert.equal(controller.getSnapshot().phase, "calling");
  await controller.start();
  assert.equal(controller.getSnapshot().phase, "ringing");
  assert.equal(created.signaling!.count("call_offer"), 0, "aranan kanala girmeden teklif GÖNDERİLMEZ (Broadcast kalıcı değil)");

  created.signaling!.emit("call_accepted", {});
  await flush();
  assert.equal(controller.getSnapshot().phase, "connecting");
  assert.equal(created.peer!.offers, 1);
  assert.deepEqual(created.signaling!.sent.find((s) => s.event === "call_offer")?.payload, { sdp: "v=0 offer" });

  created.signaling!.emit("call_answer", { sdp: "v=0 answer" });
  await flush();
  assert.equal(created.peer!.remoteAnswer, "v=0 answer");

  created.peer!.opts.onConnectionState("connected");
  const snap = controller.getSnapshot();
  assert.equal(snap.phase, "connected");
  assert.notEqual(snap.connectedAt, null);

  controller.hangup();
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.deepEqual(rpc, [{ action: "end", reason: "hangup" }]);
  assert.equal(created.peer!.closed, true, "PeerConnection kapatıldı");
  assert.ok(stream.tracks.every((tr) => tr.stopped), "yerel izler durduruldu (mikrofon/kamera ışığı söner)");
  assert.equal(created.signaling!.count("call_ended"), 1, "karşıya haber verildi");
  assert.deepEqual(owner, [`claim:${snap.callId}`, `release:${snap.callId}`]);
  t.mock.timers.tick(2_000);
  assert.equal(created.signaling!.left >= 1, true, "kanaldan çıkıldı");
});

test("arayan: yinelenen 'hazırım' aynı teklifi yeniden gönderir, ikinci teklif ÜRETMEZ; yanıttan sonra göndermez", async (t) => {
  const { controller, created } = setup(t, "audio", "caller");
  await controller.start();
  created.signaling!.emit("call_accepted", {});
  await flush();
  created.signaling!.emit("call_accepted", {});
  await flush();
  assert.equal(created.peer!.offers, 1);
  assert.equal(created.signaling!.count("call_offer"), 2);
  created.signaling!.emit("call_answer", { sdp: "a" });
  await flush();
  created.signaling!.emit("call_accepted", {});
  await flush();
  assert.equal(created.signaling!.count("call_offer"), 2, "yanıt alındıktan sonra tekrar gönderilmez");
  assert.equal(controller.getSnapshot().phase, "connecting");
});

test("arayan: cevap verilmezse 45 sn sonra cevapsız + 'timeout' RPC'si", async (t) => {
  const { controller, rpc, created } = setup(t, "video", "caller");
  await controller.start();
  t.mock.timers.tick(CALL_RING_TIMEOUT_MS - 1);
  assert.equal(controller.getSnapshot().phase, "ringing");
  t.mock.timers.tick(1);
  assert.equal(controller.getSnapshot().phase, "missed");
  assert.deepEqual(rpc, [{ action: "timeout", reason: undefined }]);
  assert.equal(created.peer!.closed, true);
});

test("arayan: çalarken kapatırsa 'cancel' (cevapsız kaydı), 'end' değil", async (t) => {
  const { controller, rpc } = setup(t, "audio", "caller");
  await controller.start();
  controller.hangup();
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.deepEqual(rpc, [{ action: "cancel", reason: undefined }]);
});

test("arayan: aranan reddederse (DB satırı) rejected; RPC çağrılmaz", async (t) => {
  const { controller, rpc, stream } = setup(t, "audio", "caller");
  await controller.start();
  controller.handleRow({ ...makeCall("audio", "caller"), status: "rejected", endedAt: new Date().toISOString() });
  assert.equal(controller.getSnapshot().phase, "rejected");
  assert.deepEqual(rpc, []);
  assert.ok(stream.tracks.every((tr) => tr.stopped));
});

test("arayan: karşı taraf kanaldan 'call_rejected' / 'call_ended' gönderirse buna göre biter", async (t) => {
  const a = setup(t, "audio", "caller");
  await a.controller.start();
  a.created.signaling!.emit("call_rejected", {});
  assert.equal(a.controller.getSnapshot().phase, "rejected");
  const b = setup(t, "audio", "caller");
  await b.controller.start();
  b.created.signaling!.emit("call_ended", {});
  assert.equal(b.controller.getSnapshot().phase, "ended");
  assert.deepEqual(b.rpc, [], "karşı taraf zaten bitirdi: ikinci RPC yok");
});

test("aranan: kabul → connecting, 'hazırım' teklif gelene dek tekrarlanır, teklif gelince yanıt gönderilir ve tekrar durur", async (t) => {
  const { controller, created } = setup(t, "audio", "callee");
  assert.equal(controller.getSnapshot().phase, "connecting");
  await controller.start();
  assert.equal(created.signaling!.count("call_accepted"), 1, "kanala girince hemen hazırım");
  t.mock.timers.tick(CALL_READY_RETRY_MS * 2);
  assert.equal(created.signaling!.count("call_accepted"), 3);

  created.signaling!.emit("call_offer", { sdp: "v=0 offer" });
  await flush();
  assert.equal(created.peer!.remoteOffer, "v=0 offer");
  assert.deepEqual(created.signaling!.sent.find((s) => s.event === "call_answer")?.payload, { sdp: "v=0 answer" });
  t.mock.timers.tick(CALL_READY_RETRY_MS * 3);
  assert.equal(created.signaling!.count("call_accepted"), 3, "teklif geldikten sonra tekrar yok");

  created.signaling!.emit("call_offer", { sdp: "başka" });
  await flush();
  assert.equal(created.peer!.remoteOffer, "v=0 offer", "ikinci teklif yok sayılır");
  created.peer!.opts.onConnectionState("connected");
  assert.equal(controller.getSnapshot().phase, "connected");
});

test("aranan: 'hazırım' en çok CALL_READY_MAX_RETRIES kez gönderilir", async (t) => {
  const { created, controller } = setup(t, "audio", "callee");
  await controller.start();
  t.mock.timers.tick(CALL_READY_RETRY_MS * (CALL_READY_MAX_RETRIES + 5));
  assert.equal(created.signaling!.count("call_accepted"), CALL_READY_MAX_RETRIES);
  assert.equal(controller.getSnapshot().phase, "connecting");
});

test("aranan: teklif hiç gelmezse bağlantı süresi dolunca başarısız (connection)", async (t) => {
  const { controller, rpc } = setup(t, "audio", "callee");
  await controller.start();
  t.mock.timers.tick(CALL_CONNECT_TIMEOUT_MS);
  const snap = controller.getSnapshot();
  assert.equal(snap.phase, "failed");
  assert.equal(snap.failure, "connection");
  assert.deepEqual(rpc, [{ action: "end", reason: "failed" }]);
});

test("ICE adayları: gelenler eşe iletilir, eşin ürettikleri sinyal kanalından gönderilir", async (t) => {
  const { controller, created } = setup(t, "audio", "caller");
  await controller.start();
  const candidate = { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0 };
  created.signaling!.emit("ice_candidate", { candidate });
  assert.deepEqual(created.peer!.candidates, [candidate]);
  created.peer!.opts.onIceCandidate(candidate);
  await flush();
  assert.deepEqual(created.signaling!.sent.find((s) => s.event === "ice_candidate")?.payload, { candidate });
  controller.hangup();
});

test("uzak akış gelince anlık görüntüye yansır; bitince temizlenir", async (t) => {
  const { controller, created } = setup(t, "video", "callee");
  await controller.start();
  const remote = fakeStream("video");
  created.peer!.opts.onRemoteStream(remote);
  assert.equal(controller.getSnapshot().remoteStream, remote);
  controller.hangup();
  assert.equal(controller.getSnapshot().remoteStream, null, "uzak akış bırakıldı (bellek sızıntısı yok)");
});

test("bağlantı 'failed' olursa başarısız (connection) + RPC + karşıya haber", async (t) => {
  const { controller, rpc, created } = setup(t, "audio", "caller");
  await controller.start();
  created.peer!.opts.onConnectionState("failed");
  const snap = controller.getSnapshot();
  assert.equal(snap.phase, "failed");
  assert.equal(snap.failure, "connection");
  assert.deepEqual(rpc, [{ action: "end", reason: "failed" }]);
  assert.equal(created.signaling!.count("call_ended"), 1);
});

test("geçici kopma: 'disconnected' → kararsız; süre içinde toparlanırsa devam, dolarsa başarısız", async (t) => {
  const a = setup(t, "audio", "caller");
  await a.controller.start();
  a.created.peer!.opts.onConnectionState("connected");
  a.created.peer!.opts.onConnectionState("disconnected");
  assert.equal(a.controller.getSnapshot().unstable, true);
  assert.equal(a.controller.getSnapshot().phase, "connected");
  t.mock.timers.tick(CALL_DISCONNECT_GRACE_MS - 1);
  a.created.peer!.opts.onConnectionState("connected");
  assert.equal(a.controller.getSnapshot().unstable, false);
  t.mock.timers.tick(CALL_DISCONNECT_GRACE_MS * 2);
  assert.equal(a.controller.getSnapshot().phase, "connected", "toparlanınca eski süre aşımı tetiklenmez");

  const b = setup(t, "audio", "callee");
  await b.controller.start();
  b.created.peer!.opts.onConnectionState("connected");
  b.created.peer!.opts.onConnectionState("disconnected");
  t.mock.timers.tick(CALL_DISCONNECT_GRACE_MS);
  assert.equal(b.controller.getSnapshot().phase, "failed");
});

test("sinyal kanalına girilemezse başarısız (signaling), eş/medya temizlenir", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const stream = fakeStream("audio");
  const rpc: CallAction[] = [];
  let peer: FakePeer | undefined;
  const controller = new CallController(makeCall("audio", "caller"), "caller", stream, {
    iceServers: [],
    createPeer: (o) => (peer = new FakePeer(o)),
    createSignaling: (_id, h) => {
      const s = new FakeSignaling(h);
      s.joinError = new Error("signaling_failed");
      return s;
    },
    respond: async (_id, action) => {
      rpc.push(action);
    },
  });
  await controller.start();
  const snap = controller.getSnapshot();
  assert.equal(snap.phase, "failed");
  assert.equal(snap.failure, "signaling");
  assert.equal(peer!.closed, true);
  assert.ok(stream.tracks.every((tr) => tr.stopped));
  assert.deepEqual(rpc, ["end"]);
});

test("katılma sürerken kapatılırsa 'ended' kalır (gecikmiş katılma hatası 'failed'e çevirmez)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const stream = fakeStream("audio");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let signaling: FakeSignaling | undefined;
  const controller = new CallController(makeCall("audio", "caller"), "caller", stream, {
    iceServers: [],
    createPeer: (o) => new FakePeer(o),
    createSignaling: (_id, h) => {
      signaling = new FakeSignaling(h);
      signaling.joinGate = gate;
      signaling.joinError = new Error("signaling_failed");
      return signaling;
    },
    respond: async () => {},
  });
  const started = controller.start();
  await tick();
  controller.hangup();
  release();
  await started;
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.equal(controller.getSnapshot().failure, null);
});

test("teklif üretilemezse başarısız (connection)", async (t) => {
  const { controller, created } = setup(t, "audio", "caller");
  await controller.start();
  created.peer!.failOffer = true;
  created.signaling!.emit("call_accepted", {});
  await flush();
  assert.equal(controller.getSnapshot().phase, "failed");
  assert.equal(controller.getSnapshot().failure, "connection");
});

test("mikrofon: yerel iz kapanır/açılır, durum karşıya bildirilir", async (t) => {
  const { controller, stream, created } = setup(t, "audio", "caller");
  await controller.start();
  controller.toggleMic();
  assert.equal(controller.getSnapshot().micOn, false);
  assert.equal(stream.getAudioTracks()[0]!.enabled, false);
  await flush();
  assert.deepEqual(created.signaling!.sent.find((s) => s.event === "call_media")?.payload, { mic: false, camera: false });
  controller.toggleMic();
  assert.equal(controller.getSnapshot().micOn, true);
  assert.equal(stream.getAudioTracks()[0]!.enabled, true);
  controller.hangup();
});

test("kamera: görüntülüde çalışır; sesli aramada etkisiz", async (t) => {
  const v = setup(t, "video", "caller");
  await v.controller.start();
  v.controller.toggleCamera();
  assert.equal(v.controller.getSnapshot().camOn, false);
  assert.equal(v.stream.getVideoTracks()[0]!.enabled, false);
  assert.equal(v.stream.getAudioTracks()[0]!.enabled, true, "kamera kapanınca mikrofon etkilenmez");
  v.controller.hangup();

  const a = setup(t, "audio", "caller");
  await a.controller.start();
  a.controller.toggleCamera();
  assert.equal(a.controller.getSnapshot().camOn, false);
  assert.equal(a.created.signaling!.count("call_media"), 0);
  a.controller.hangup();
});

test("karşı tarafın medya durumu (call_media) anlık görüntüye yansır", async (t) => {
  const { controller, created } = setup(t, "video", "callee");
  await controller.start();
  created.signaling!.emit("call_media", { mic: false, camera: false });
  const snap = controller.getSnapshot();
  assert.equal(snap.remoteMic, false);
  assert.equal(snap.remoteCamera, false);
  controller.hangup();
});

test("biten arama geri dönmez: gecikmiş 'connected', satır ve eylemler etkisiz; ikinci hangup RPC'yi tekrarlamaz", async (t) => {
  const { controller, rpc, created } = setup(t, "audio", "caller");
  await controller.start();
  controller.hangup();
  controller.hangup();
  created.peer!.opts.onConnectionState("connected");
  controller.handleRow({ ...makeCall("audio", "caller"), status: "missed" });
  controller.toggleMic();
  assert.equal(controller.getSnapshot().phase, "ended");
  assert.equal(rpc.length, 1);
});

test("başka çağrının satırı yok sayılır; accepted satırı aşamayı değiştirmez", async (t) => {
  const { controller } = setup(t, "audio", "caller");
  await controller.start();
  controller.handleRow({ ...makeCall("audio", "caller", { id: "99999999-9999-4999-8999-999999999999" }), status: "ended" });
  assert.equal(controller.getSnapshot().phase, "ringing");
  controller.handleRow({ ...makeCall("audio", "caller"), status: "accepted" });
  assert.equal(controller.getSnapshot().phase, "ringing");
  controller.hangup();
});

test("subscribe: her değişiklikte bildirim, abonelik iptali çalışır", async (t) => {
  const { controller } = setup(t, "audio", "caller");
  let n = 0;
  const off = controller.subscribe(() => (n += 1));
  await controller.start();
  const before = n;
  assert.ok(before >= 1);
  off();
  controller.hangup();
  assert.equal(n, before);
});

test("start iki kez çağrılsa bile tek eş ve tek kanal kurulur", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  let peers = 0;
  let channels = 0;
  const controller = new CallController(makeCall("audio", "caller"), "caller", fakeStream("audio"), {
    iceServers: [],
    createPeer: (o) => (peers += 1, new FakePeer(o)),
    createSignaling: (_id, h) => (channels += 1, new FakeSignaling(h)),
    respond: async () => {},
  });
  await Promise.all([controller.start(), controller.start()]);
  assert.equal(peers, 1);
  assert.equal(channels, 1);
  controller.hangup();
});

void mock;
