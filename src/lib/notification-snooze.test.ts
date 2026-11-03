import test from "node:test";
import assert from "node:assert/strict";
import { snoozeTimes } from "./notification-snooze.ts";

test("öğleden önce: bu akşam 18:00, yarın 09:00", () => {
  const t = snoozeTimes(new Date(2026, 10, 3, 10, 30)); // Salı 3 Kasım 2026
  assert.deepEqual(t.tonight, new Date(2026, 10, 3, 18, 0));
  assert.deepEqual(t.tomorrow, new Date(2026, 10, 4, 9, 0));
});

test("17:00'den sonra bu akşam sunulmaz", () => {
  assert.equal(snoozeTimes(new Date(2026, 10, 3, 17, 0)).tonight, null);
  assert.equal(snoozeTimes(new Date(2026, 10, 3, 23, 0)).tonight, null);
});

test("gelecek hafta = bir sonraki pazartesi 09:00 (pazartesiyse 7 gün sonra)", () => {
  assert.deepEqual(snoozeTimes(new Date(2026, 10, 3, 10)).nextWeek, new Date(2026, 10, 9, 9, 0)); // Salı → Pzt 9
  assert.deepEqual(snoozeTimes(new Date(2026, 10, 2, 10)).nextWeek, new Date(2026, 10, 9, 9, 0)); // Pzt → Pzt 9
  assert.deepEqual(snoozeTimes(new Date(2026, 10, 8, 10)).nextWeek, new Date(2026, 10, 9, 9, 0)); // Paz → Pzt 9
});

test("ay sonunu aşan günler doğru yuvarlanır", () => {
  assert.deepEqual(snoozeTimes(new Date(2026, 10, 30, 10)).tomorrow, new Date(2026, 11, 1, 9, 0));
});
