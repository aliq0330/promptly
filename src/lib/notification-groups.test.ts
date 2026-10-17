import { test } from "node:test";
import assert from "node:assert/strict";
import { groupNotificationsByDay, notificationDayGroup } from "./notification-groups.ts";

// Yerel saatle 17 Ekim 2026, 15:00.
const now = new Date(2026, 9, 17, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

test("today / yesterday / this week / older follow local calendar days", () => {
  assert.equal(notificationDayGroup(at(2026, 9, 17, 0), now), "today");
  assert.equal(notificationDayGroup(at(2026, 9, 16, 23), now), "yesterday");
  assert.equal(notificationDayGroup(at(2026, 9, 16, 0), now), "yesterday");
  assert.equal(notificationDayGroup(at(2026, 9, 15), now), "thisWeek");
  assert.equal(notificationDayGroup(at(2026, 9, 11), now), "thisWeek");
  assert.equal(notificationDayGroup(at(2026, 9, 10), now), "older");
});

test("a future or unparsable timestamp counts as today", () => {
  assert.equal(notificationDayGroup(at(2026, 9, 18), now), "today");
  assert.equal(notificationDayGroup("not a date", now), "today");
});

test("grouping keeps the incoming order and drops empty groups", () => {
  const items = [at(2026, 9, 17), at(2026, 9, 17, 8), at(2026, 9, 13), at(2026, 8, 1)].map((createdAt, i) => ({ id: i, createdAt }));
  const groups = groupNotificationsByDay(items, now);
  assert.deepEqual(groups.map((g) => g.group), ["today", "thisWeek", "older"]);
  assert.deepEqual(groups.map((g) => g.items.map((x) => x.id)), [[0, 1], [2], [3]]);
  assert.deepEqual(groupNotificationsByDay([], now), []);
});
