import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIVE_NOTIFY_PREFS,
  LIVE_TOAST_BURST_THRESHOLD,
  LIVE_TOAST_BURST_WINDOW_MS,
  LIVE_TOAST_GROUPS,
  isBurst,
  isQuietNow,
  liveToastGroupOf,
  localMinuteOfDay,
  minutesToTime,
  parseLiveNotifyPrefs,
  parseQuietHoursRow,
  pushArrival,
  serializeLiveNotifyPrefs,
  timeToMinutes,
  type QuietHours,
} from "./live-notification-prefs.ts";
import { NOTIFICATION_PREF_KEYS } from "./notification-mirror.ts";

test("tür grupları: her bildirim türü tek bir gruba düşer, bilinmeyen 'other' olur", () => {
  assert.equal(liveToastGroupOf("like"), "reactions");
  assert.equal(liveToastGroupOf("story_reaction"), "reactions");
  assert.equal(liveToastGroupOf("story_poll_vote"), "reactions");
  assert.equal(liveToastGroupOf("comment"), "comments");
  assert.equal(liveToastGroupOf("comment_reply"), "comments");
  assert.equal(liveToastGroupOf("follow"), "follows");
  assert.equal(liveToastGroupOf("message"), "messages");
  assert.equal(liveToastGroupOf("message_request"), "messages");
  for (const other of ["quote", "system", "request_response", "prompt_edited", "edit_suggestion_received", "yeni_tur"]) assert.equal(liveToastGroupOf(other), "other");
  assert.deepEqual([...LIVE_TOAST_GROUPS], ["reactions", "comments", "follows", "messages", "other"]);
  assert.ok(NOTIFICATION_PREF_KEYS.length > 0);
});

test("ince ayar: varsayılan, kısmi ve bozuk yük", () => {
  assert.deepEqual(parseLiveNotifyPrefs(null), DEFAULT_LIVE_NOTIFY_PREFS);
  assert.deepEqual(parseLiveNotifyPrefs(""), DEFAULT_LIVE_NOTIFY_PREFS);
  assert.deepEqual(parseLiveNotifyPrefs("{bozuk"), DEFAULT_LIVE_NOTIFY_PREFS);
  assert.deepEqual(parseLiveNotifyPrefs("null"), DEFAULT_LIVE_NOTIFY_PREFS);
  const partial = parseLiveNotifyPrefs(JSON.stringify({ types: { reactions: false, comments: "yok" }, sound: true }));
  assert.equal(partial.types.reactions, false);
  assert.equal(partial.types.comments, true, "boolean olmayan değer varsayılana döner");
  assert.equal(partial.sound, true);
  assert.equal(partial.tabBadge, true);
  assert.equal(DEFAULT_LIVE_NOTIFY_PREFS.types.reactions, true, "varsayılan nesne değişmedi");
  const round = parseLiveNotifyPrefs(serializeLiveNotifyPrefs({ ...partial, tabBadge: false }));
  assert.deepEqual(round, { ...partial, tabBadge: false });
});

test("saat çevirileri", () => {
  assert.equal(minutesToTime(0), "00:00");
  assert.equal(minutesToTime(1380), "23:00");
  assert.equal(minutesToTime(485), "08:05");
  assert.equal(minutesToTime(5000), "23:59");
  assert.equal(timeToMinutes("23:00"), 1380);
  assert.equal(timeToMinutes("8:05"), 485);
  assert.equal(timeToMinutes("24:00"), null);
  assert.equal(timeToMinutes("12:60"), null);
  assert.equal(timeToMinutes("abc"), null);
});

const q = (over: Partial<QuietHours>): QuietHours => ({ enabled: true, startMinute: 1380, endMinute: 480, tz: "Europe/Istanbul", ...over });
const at = (iso: string) => new Date(iso);

test("sessiz saat: SQL _in_quiet_hours ile AYNI örnekler (gece yarısını aşan pencere, İstanbul = UTC+3)", () => {
  assert.equal(isQuietNow(q({}), at("2026-11-18T20:30:00Z")), true, "23:30 yerel");
  assert.equal(isQuietNow(q({}), at("2026-11-19T00:00:00Z")), true, "03:00 yerel");
  assert.equal(isQuietNow(q({}), at("2026-11-19T04:59:00Z")), true, "07:59 yerel");
  assert.equal(isQuietNow(q({}), at("2026-11-19T05:00:00Z")), false, "08:00 yerel (bitiş hariç)");
  assert.equal(isQuietNow(q({}), at("2026-11-19T09:00:00Z")), false, "12:00 yerel");
  assert.equal(isQuietNow(q({}), at("2026-11-18T20:00:00Z")), true, "23:00 yerel (başlangıç dahil)");
  assert.equal(isQuietNow(q({}), at("2026-11-18T19:59:00Z")), false, "22:59 yerel");
});

test("sessiz saat: gün içi pencere, saat dilimi, kapalı ve boş pencere", () => {
  const ny = q({ startMinute: 780, endMinute: 930, tz: "America/New_York" });
  assert.equal(isQuietNow(ny, at("2026-11-18T19:00:00Z")), true, "14:00 New York");
  assert.equal(isQuietNow(ny, at("2026-11-18T20:30:00Z")), false, "15:30 New York");
  assert.equal(isQuietNow(ny, at("2026-11-18T17:59:00Z")), false, "12:59 New York");
  assert.equal(isQuietNow({ ...ny, enabled: false }, at("2026-11-18T19:00:00Z")), false);
  assert.equal(isQuietNow(q({ startMinute: 600, endMinute: 600, tz: "UTC" }), at("2026-11-18T10:00:00Z")), false);
  assert.equal(isQuietNow(q({ tz: "Mars/Olympus" }), at("2026-11-18T20:30:00Z")), false, "bilinmeyen saat dilimi → sessiz değil");
  assert.equal(localMinuteOfDay(at("2026-11-18T21:00:00Z"), "Europe/Istanbul"), 0, "gece yarısı 00:00 (24 değil)");
});

test("sunucu satırı: bozuk alan varsayılana döner", () => {
  assert.deepEqual(parseQuietHoursRow({ enabled: true, start_minute: 60, end_minute: 120, tz: "UTC" }), { enabled: true, startMinute: 60, endMinute: 120, tz: "UTC" });
  assert.deepEqual(parseQuietHoursRow(null), { enabled: false, startMinute: 1380, endMinute: 480, tz: "UTC" });
  assert.deepEqual(parseQuietHoursRow({ enabled: "evet", start_minute: 99999, end_minute: -1, tz: "" }), { enabled: false, startMinute: 1380, endMinute: 480, tz: "UTC" });
});

test("yoğunluk: eşik ve pencere", () => {
  let arrivals: number[] = [];
  for (let i = 0; i < LIVE_TOAST_BURST_THRESHOLD - 1; i += 1) arrivals = pushArrival(arrivals, 1000 + i * 100);
  assert.equal(isBurst(arrivals), false);
  arrivals = pushArrival(arrivals, 1500);
  assert.equal(isBurst(arrivals), true);
  // Pencere dışına düşenler atılır: uzun sessizlikten sonra tek varış yoğunluk sayılmaz.
  const later = pushArrival(arrivals, 1500 + LIVE_TOAST_BURST_WINDOW_MS + 1);
  assert.deepEqual(later, [1500 + LIVE_TOAST_BURST_WINDOW_MS + 1]);
  assert.equal(isBurst(later), false);
});
