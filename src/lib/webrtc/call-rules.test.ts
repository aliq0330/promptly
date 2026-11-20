import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALL_INCOMING_MAX_MS,
  CALL_OWNER_STALE_MS,
  MAX_SDP_LENGTH,
  callTopic,
  callerCanSendOffer,
  classifyCallStartError,
  classifyMediaError,
  CALL_DEVICES_KEY,
  decideOpenCall,
  deviceConstraint,
  parseDevicePrefs,
  qualityFrom,
  elapsedSeconds,
  formatCallDuration,
  incomingRemainingMs,
  isIncomingFresh,
  isLivePhase,
  isOwnedByLiveTab,
  isTerminalPhase,
  mapCallRow,
  parseCallOwner,
  parseSignalPayload,
  phaseForRowStatus,
  reduceConnectionState,
} from "./call-rules.ts";
import type { CallRow } from "./types.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-12-12T10:00:00Z");

function row(over: Partial<CallRow> = {}): CallRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    conversationId: "44444444-4444-4444-8444-444444444444",
    callerId: THEM,
    calleeId: ME,
    type: "audio",
    status: "ringing",
    startedAt: new Date(NOW - 3_000).toISOString(),
    answeredAt: null,
    endedAt: null,
    ...over,
  };
}

test("aşamalar: terminal ve canlı ayrımı", () => {
  for (const p of ["ended", "rejected", "missed", "failed"] as const) assert.equal(isTerminalPhase(p), true, p);
  for (const p of ["idle", "calling", "ringing", "connecting", "connected"] as const) assert.equal(isTerminalPhase(p), false, p);
  for (const p of ["calling", "ringing", "connecting", "connected"] as const) assert.equal(isLivePhase(p), true, p);
  assert.equal(isLivePhase("idle"), false);
  assert.equal(isLivePhase("ended"), false);
});

test("bağlantı durumu: connected → connected; failed → failed; disconnected yalnız bağlıyken kararsız", () => {
  assert.deepEqual(reduceConnectionState("connected", "connecting"), { phase: "connected", unstable: false, connected: true });
  assert.deepEqual(reduceConnectionState("failed", "connecting"), { phase: "failed", unstable: false, connected: false });
  assert.deepEqual(reduceConnectionState("failed", "connected"), { phase: "failed", unstable: false, connected: false });
  assert.deepEqual(reduceConnectionState("disconnected", "connected"), { phase: "connected", unstable: true, connected: true });
  assert.deepEqual(reduceConnectionState("disconnected", "connecting"), { phase: "connecting", unstable: false, connected: false });
  assert.deepEqual(reduceConnectionState("connecting", "connecting"), { phase: "connecting", unstable: false, connected: false });
  assert.equal(reduceConnectionState("closed", "connected").phase, "connected", "closed tek başına aşama değiştirmez");
});

test("bağlantı durumu: terminal aşama geri dönmez (gecikmiş olay)", () => {
  for (const phase of ["ended", "rejected", "missed", "failed"] as const) {
    assert.equal(reduceConnectionState("connected", phase).phase, phase);
  }
});

test("satır durumu → aşama: yalnız terminal durumlar aşama değiştirir", () => {
  assert.equal(phaseForRowStatus("rejected", "ringing"), "rejected");
  assert.equal(phaseForRowStatus("missed", "ringing"), "missed");
  assert.equal(phaseForRowStatus("ended", "connected"), "ended");
  assert.equal(phaseForRowStatus("accepted", "ringing"), "ringing", "accepted sinyal kanalıyla işlenir");
  assert.equal(phaseForRowStatus("ringing", "connecting"), "connecting");
  assert.equal(phaseForRowStatus("ended", "failed"), "failed", "terminal aşama korunur");
});

test("süre biçimi", () => {
  assert.equal(formatCallDuration(0), "00:00");
  assert.equal(formatCallDuration(272), "04:32");
  assert.equal(formatCallDuration(59.9), "00:59");
  assert.equal(formatCallDuration(3600), "1:00:00");
  assert.equal(formatCallDuration(3725), "1:02:05");
  assert.equal(formatCallDuration(-5), "00:00");
  assert.equal(formatCallDuration(Number.NaN), "00:00");
});

test("geçen süre: bağlanmadıysa 0, saat geri giderse negatif olmaz", () => {
  assert.equal(elapsedSeconds(null, NOW), 0);
  assert.equal(elapsedSeconds(NOW - 65_400, NOW), 65);
  assert.equal(elapsedSeconds(NOW + 5_000, NOW), 0);
});

test("arayan teklifi yalnız çalma/bağlanma aşamasında gönderir", () => {
  assert.equal(callerCanSendOffer("ringing"), true);
  assert.equal(callerCanSendOffer("connecting"), true);
  assert.equal(callerCanSendOffer("connected"), false);
  assert.equal(callerCanSendOffer("ended"), false);
});

test("getUserMedia hataları kullanıcıya anlaşılır türe çevrilir", () => {
  assert.equal(classifyMediaError({ name: "NotAllowedError" }), "permission");
  assert.equal(classifyMediaError(new DOMException("x", "NotAllowedError")), "permission");
  assert.equal(classifyMediaError({ name: "SecurityError" }), "permission");
  assert.equal(classifyMediaError({ name: "NotFoundError" }), "notFound");
  assert.equal(classifyMediaError({ name: "NotReadableError" }), "inUse");
  assert.equal(classifyMediaError({ name: "TypeError" }), "unsupported");
  assert.equal(classifyMediaError({ name: "Boom" }), "unknown");
  assert.equal(classifyMediaError(null), "unknown");
  assert.equal(classifyMediaError("string"), "unknown");
});

test("call_start hataları sunucu kodundan sınıflanır", () => {
  assert.equal(classifyCallStartError("call_busy"), "busy");
  assert.equal(classifyCallStartError("ERROR: call_busy"), "busy");
  assert.equal(classifyCallStartError("interaction_blocked"), "blocked");
  assert.equal(classifyCallStartError("call_not_allowed"), "notAllowed");
  assert.equal(classifyCallStartError("call_not_direct"), "notDirect");
  assert.equal(classifyCallStartError("call_privacy"), "privacy");
  assert.equal(classifyCallStartError("rate_limit"), "rateLimit");
  assert.equal(classifyCallStartError("başka bir şey"), "unknown");
  assert.equal(classifyCallStartError(null), "unknown");
});

test("satır eşleme: geçerli satır, eksik/yanlış alan null", () => {
  const ok = mapCallRow({
    id: "a",
    conversation_id: "b",
    caller_id: "c",
    callee_id: "d",
    type: "video",
    status: "accepted",
    started_at: "2026-12-12T10:00:00Z",
    answered_at: "2026-12-12T10:00:05Z",
    ended_at: null,
  });
  assert.deepEqual(ok, {
    id: "a",
    conversationId: "b",
    callerId: "c",
    calleeId: "d",
    type: "video",
    status: "accepted",
    startedAt: "2026-12-12T10:00:00Z",
    answeredAt: "2026-12-12T10:00:05Z",
    endedAt: null,
  });
  assert.equal(mapCallRow(null), null);
  assert.equal(mapCallRow({}), null);
  assert.equal(mapCallRow({ id: "a", conversation_id: "b", caller_id: "c", callee_id: "d", type: "screen", status: "ringing" }), null);
  assert.equal(mapCallRow({ id: "a", conversation_id: "b", caller_id: "c", callee_id: "d", type: "audio", status: "weird" }), null);
});

test("gelen çağrı tazeliği", () => {
  assert.equal(isIncomingFresh(row(), NOW), true);
  assert.equal(isIncomingFresh(row({ status: "accepted" }), NOW), false);
  assert.equal(isIncomingFresh(row({ startedAt: new Date(NOW - CALL_INCOMING_MAX_MS - 1).toISOString() }), NOW), false);
  assert.equal(isIncomingFresh(row({ startedAt: "bozuk" }), NOW), false);
  assert.equal(incomingRemainingMs(row({ startedAt: new Date(NOW - 10_000).toISOString() }), NOW), CALL_INCOMING_MAX_MS - 10_000);
  assert.equal(incomingRemainingMs(row({ startedAt: new Date(NOW - 999_999).toISOString() }), NOW), 0);
});

test("sinyal yükü: offer/answer", () => {
  assert.deepEqual(parseSignalPayload("call_offer", { sdp: "v=0" }), { sdp: "v=0" });
  assert.deepEqual(parseSignalPayload("call_answer", { sdp: "v=0", extra: 1 }), { sdp: "v=0" }, "fazladan alan atılır");
  assert.equal(parseSignalPayload("call_offer", {}), null);
  assert.equal(parseSignalPayload("call_offer", { sdp: "" }), null);
  assert.equal(parseSignalPayload("call_offer", { sdp: 5 }), null);
  assert.equal(parseSignalPayload("call_offer", null), null);
  assert.equal(parseSignalPayload("call_offer", { sdp: "x".repeat(MAX_SDP_LENGTH + 1) }), null, "dev SDP reddedilir");
});

test("sinyal yükü: ICE adayı", () => {
  const ok = parseSignalPayload("ice_candidate", { candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "u" } });
  assert.deepEqual(ok, { candidate: { candidate: "candidate:1 1 udp 1 1.2.3.4 5 typ host", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: "u" } });
  assert.equal(parseSignalPayload("ice_candidate", { candidate: "string" }), null);
  assert.equal(parseSignalPayload("ice_candidate", {}), null);
  assert.equal(parseSignalPayload("ice_candidate", { candidate: { candidate: 5 } }), null);
  assert.equal(parseSignalPayload("ice_candidate", { candidate: { candidate: "x".repeat(2_001) } }), null);
});

test("sinyal yükü: medya durumu, bitiş, kabul/ret", () => {
  assert.deepEqual(parseSignalPayload("call_media", { mic: false, camera: true }), { mic: false, camera: true });
  assert.equal(parseSignalPayload("call_media", { mic: "evet", camera: true }), null);
  assert.equal(parseSignalPayload("call_media", {}), null);
  assert.deepEqual(parseSignalPayload("call_ended", { reason: "timeout" }), { reason: "timeout" });
  assert.deepEqual(parseSignalPayload("call_ended", {}), { reason: undefined });
  assert.equal(parseSignalPayload("call_ended", { reason: "x".repeat(100) })?.reason?.length, 40);
  assert.deepEqual(parseSignalPayload("call_accepted", undefined), {});
  assert.deepEqual(parseSignalPayload("call_rejected", null), {});
});

test("kanal adı sunucudaki politikayla aynı biçimdedir", () => {
  const id = "33333333-3333-4333-8333-333333333333";
  assert.equal(callTopic(id), `call:${id}`);
  assert.match(callTopic(id), /^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("sekme sahipliği: ayrıştırma ve canlılık", () => {
  assert.equal(parseCallOwner(null), null);
  assert.equal(parseCallOwner("bozuk json"), null);
  assert.equal(parseCallOwner(JSON.stringify({ callId: 1 })), null);
  const entry = parseCallOwner(JSON.stringify({ callId: "x", at: NOW - 1_000 }));
  assert.deepEqual(entry, { callId: "x", at: NOW - 1_000 });
  assert.equal(isOwnedByLiveTab(entry, "x", NOW), true);
  assert.equal(isOwnedByLiveTab(entry, "y", NOW), false, "başka çağrının kaydı");
  assert.equal(isOwnedByLiveTab({ callId: "x", at: NOW - CALL_OWNER_STALE_MS - 1 }, "x", NOW), false, "bayat kayıt = ölü sekme");
  assert.equal(isOwnedByLiveTab(null, "x", NOW), false);
});

test("açılışta takılı çağrı kararı", () => {
  // Gelen çalan çağrı (aranan benim)
  assert.deepEqual(decideOpenCall(row(), ME, false, NOW), { kind: "show-incoming" });
  assert.deepEqual(decideOpenCall(row({ startedAt: new Date(NOW - CALL_INCOMING_MAX_MS - 1).toISOString() }), ME, false, NOW), { kind: "ignore" });
  // Çalan çağrı, ben arayanım, sayfa yenilendi → vazgeç; başka canlı sekme yönetiyorsa dokunma
  const mine = row({ callerId: ME, calleeId: THEM });
  assert.deepEqual(decideOpenCall(mine, ME, false, NOW), { kind: "end", action: "cancel" });
  assert.deepEqual(decideOpenCall(mine, ME, true, NOW), { kind: "ignore" });
  // Yarım kalan görüşme: sayfa yenilendi → bitir; canlı başka sekme varsa dokunma (çoklu sekme)
  const accepted = row({ status: "accepted", answeredAt: new Date(NOW).toISOString() });
  assert.deepEqual(decideOpenCall(accepted, ME, false, NOW), { kind: "end", action: "end", reason: "interrupted" });
  assert.deepEqual(decideOpenCall(accepted, ME, true, NOW), { kind: "ignore" });
  // Sonlanmış satırlara dokunulmaz
  assert.deepEqual(decideOpenCall(row({ status: "ended" }), ME, false, NOW), { kind: "ignore" });
});

test("bağlantı kalitesi: eşikler; ölçülemeyen ölçüt atlanır; hiçbiri yoksa null", () => {
  assert.equal(qualityFrom({ rttMs: 40, lossPct: 0 }), "good");
  assert.equal(qualityFrom({ rttMs: 149, lossPct: 1.9 }), "good");
  assert.equal(qualityFrom({ rttMs: 150, lossPct: 0 }), "mid");
  assert.equal(qualityFrom({ rttMs: 60, lossPct: 2 }), "mid");
  assert.equal(qualityFrom({ rttMs: 349, lossPct: 7.9 }), "mid");
  assert.equal(qualityFrom({ rttMs: 350, lossPct: 0 }), "low");
  assert.equal(qualityFrom({ rttMs: 20, lossPct: 8 }), "low");
  assert.equal(qualityFrom({ rttMs: null, lossPct: 12 }), "low", "yalnız kayıp ölçüldü");
  assert.equal(qualityFrom({ rttMs: 30, lossPct: null }), "good", "yalnız RTT ölçüldü");
  assert.equal(qualityFrom({ rttMs: null, lossPct: null }), null);
  assert.equal(qualityFrom(null), null);
});

test("cihaz kısıtı ve kayıtlı tercihler", () => {
  assert.deepEqual(deviceConstraint("abc"), { deviceId: { ideal: "abc" } });
  assert.deepEqual(deviceConstraint(null), {});
  assert.deepEqual(deviceConstraint(""), {});
  assert.equal(CALL_DEVICES_KEY, "promptly-call-devices");
  assert.deepEqual(parseDevicePrefs(JSON.stringify({ mic: "m", camera: "c", speaker: "s", extra: 1 })), { mic: "m", camera: "c", speaker: "s" });
  assert.deepEqual(parseDevicePrefs(JSON.stringify({ mic: 5, camera: "", speaker: "x".repeat(400) })), { mic: null, camera: null, speaker: null }, "geçersiz değerler elenir");
  assert.deepEqual(parseDevicePrefs("bozuk"), { mic: null, camera: null, speaker: null });
  assert.deepEqual(parseDevicePrefs(null), { mic: null, camera: null, speaker: null });
});
