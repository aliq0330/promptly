import { test } from "node:test";
import assert from "node:assert/strict";
import {
  callPreviewWins,
  filterCalls,
  interleaveCalls,
  isMissedForMe,
  lastCallByConversation,
  missedCount,
  otherParty,
  sortCallsNewestFirst,
  summarizeCall,
  upsertCall,
} from "./call-history.ts";
import type { CallRow } from "./types.ts";

const ME = "me";
const THEM = "them";
const T0 = Date.parse("2026-12-12T10:00:00Z");
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();
const dayKey = (s: string) => s.slice(0, 10);

function call(over: Partial<CallRow> & { id: string }): CallRow {
  return { conversationId: "c1", callerId: ME, calleeId: THEM, type: "audio", status: "ended", startedAt: iso(0), answeredAt: iso(0.1), endedAt: iso(5), ...over };
}

test("özet: giden/gelen, sonuç ve süre", () => {
  const done = summarizeCall(call({ id: "a", answeredAt: iso(0), endedAt: iso(4.5) }), ME)!;
  assert.deepEqual([done.direction, done.outcome, done.durationSec], ["out", "completed", 270]);
  assert.equal(summarizeCall(call({ id: "b", callerId: THEM, calleeId: ME }), ME)!.direction, "in");
  assert.equal(summarizeCall(call({ id: "c", status: "missed", answeredAt: null }), ME)!.outcome, "unanswered", "giden + açılmadı");
  assert.equal(summarizeCall(call({ id: "d", status: "missed", answeredAt: null, callerId: THEM, calleeId: ME }), ME)!.outcome, "missed", "gelen + açmadım");
  assert.equal(summarizeCall(call({ id: "e", status: "rejected", answeredAt: null }), ME)!.outcome, "declined", "giden + karşı reddetti");
  assert.equal(summarizeCall(call({ id: "f", status: "rejected", answeredAt: null, callerId: THEM, calleeId: ME }), ME)!.outcome, "rejected", "gelen + ben reddettim");
  assert.equal(summarizeCall(call({ id: "g", status: "ringing", answeredAt: null, endedAt: null }), ME), null);
  assert.equal(summarizeCall(call({ id: "h", status: "accepted", endedAt: null }), ME), null);
  assert.equal(summarizeCall(call({ id: "i", answeredAt: iso(5), endedAt: iso(1) }), ME)!.durationSec, 0, "ters zaman: negatif süre olmaz");
  assert.equal(isMissedForMe(summarizeCall(call({ id: "j", status: "missed", answeredAt: null, callerId: THEM, calleeId: ME }), ME)!), true);
  assert.equal(isMissedForMe(summarizeCall(call({ id: "k", status: "missed", answeredAt: null }), ME)!), false);
});

test("sıralama ve upsert: yeni üstte, tekrar çoğaltmaz, çalan satır kaldırılır", () => {
  const a = call({ id: "a", endedAt: iso(5) });
  const b = call({ id: "b", endedAt: iso(9) });
  assert.deepEqual(sortCallsNewestFirst([a, b]).map((r) => r.id), ["b", "a"]);
  assert.deepEqual(upsertCall([a], b, ME).map((r) => r.id), ["b", "a"]);
  assert.deepEqual(upsertCall([a, b], { ...a, endedAt: iso(20) }, ME).map((r) => r.id), ["a", "b"], "güncellenen satır yeniden sıralanır");
  assert.equal(upsertCall([a], a, ME).length, 1);
  assert.deepEqual(upsertCall([a], call({ id: "a", status: "ringing", answeredAt: null, endedAt: null }), ME), [], "çalan satır geçmişte yok");
});

test("zaman çizelgesi: çağrılar mesajlar arasına zaman sırasıyla girer, gün ayracı birleşik dizide", () => {
  const msgs = [
    { createdAt: iso(-60 * 24) }, // dün
    { createdAt: iso(60) },
    { createdAt: iso(180) },
  ];
  const calls = [call({ id: "x", endedAt: iso(-60 * 24 + 10) }), call({ id: "y", endedAt: iso(120) }), call({ id: "z", endedAt: iso(240) })];
  const t = interleaveCalls(msgs, calls, { hasOlder: false, dayKey, userId: ME });
  assert.deepEqual(t.map((e) => (e.kind === "call" ? e.call.id : "m" + e.index)), ["m0", "x", "m1", "y", "m2", "z"]);
  const starts = t.filter((e) => e.dayStart).map((e) => (e.kind === "call" ? e.call.id : "m" + e.index));
  assert.deepEqual(starts, ["m0", "m1"], "dün: ilk mesaj; bugün: ilk öğe m1 (aynı güne düşen çağrı ayraç açmaz)");
  const callFirst = interleaveCalls([{ createdAt: iso(60) }], [call({ id: "early", endedAt: iso(10) })], { hasOlder: false, dayKey, userId: ME });
  assert.deepEqual(callFirst.map((e) => e.kind), ["call", "message"]);
  assert.equal(callFirst[0]!.dayStart, true);
  assert.equal(callFirst[1]!.dayStart, false, "çağrının açtığı günde mesaj ayraç tekrar etmez");
});

test("zaman çizelgesi: daha eski mesaj sayfası varsa pencere öncesi çağrılar gizlenir; sayfa yoksa ya da mesaj yoksa görünür", () => {
  const msgs = [{ createdAt: iso(100) }];
  const old = call({ id: "old", endedAt: iso(10) });
  assert.equal(interleaveCalls(msgs, [old], { hasOlder: true, dayKey, userId: ME }).filter((e) => e.kind === "call").length, 0);
  assert.equal(interleaveCalls(msgs, [old], { hasOlder: false, dayKey, userId: ME }).filter((e) => e.kind === "call").length, 1);
  assert.equal(interleaveCalls([], [old], { hasOlder: true, dayKey, userId: ME }).length, 1, "mesajsız sohbette çağrılar görünür");
  const ringing = call({ id: "r", status: "ringing", answeredAt: null, endedAt: null });
  assert.equal(interleaveCalls(msgs, [ringing], { hasOlder: false, dayKey, userId: ME }).filter((e) => e.kind === "call").length, 0, "çalan çağrı akışta yok");
});

test("konuşma başına son çağrı ve önizleme kararı", () => {
  const a = call({ id: "a", conversationId: "c1", endedAt: iso(5) });
  const b = call({ id: "b", conversationId: "c1", endedAt: iso(50) });
  const c = call({ id: "c", conversationId: "c2", endedAt: iso(20) });
  const map = lastCallByConversation([a, b, c], ME);
  assert.equal(map.get("c1")!.id, "b");
  assert.equal(map.get("c2")!.id, "c");
  assert.equal(callPreviewWins(iso(10), b), true, "çağrı son mesajdan yeni");
  assert.equal(callPreviewWins(iso(60), b), false, "son mesaj daha yeni");
  assert.equal(callPreviewWins(null, b), true);
  assert.equal(callPreviewWins(iso(1), undefined), false);
});

test("filtreler ve cevapsız sayacı", () => {
  const rows = [
    call({ id: "1", type: "audio" }),
    call({ id: "2", type: "video" }),
    call({ id: "3", status: "missed", answeredAt: null, callerId: THEM, calleeId: ME, type: "video" }),
    call({ id: "4", status: "missed", answeredAt: null }),
    call({ id: "5", status: "ringing", answeredAt: null, endedAt: null }),
  ];
  assert.deepEqual(filterCalls(rows, "all", ME).map((r) => r.id), ["1", "2", "3", "4"]);
  assert.deepEqual(filterCalls(rows, "missed", ME).map((r) => r.id), ["3"], "yalnız BENİM cevapsızım");
  assert.deepEqual(filterCalls(rows, "audio", ME).map((r) => r.id), ["1", "4"]);
  assert.deepEqual(filterCalls(rows, "video", ME).map((r) => r.id), ["2", "3"]);
  assert.equal(missedCount(rows, ME), 1);
  assert.equal(otherParty(rows[0]!, ME), THEM);
  assert.equal(otherParty(rows[2]!, ME), THEM);
});
