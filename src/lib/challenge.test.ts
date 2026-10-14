import { test } from "node:test";
import assert from "node:assert/strict";
import {
  challengeStatus,
  defaultChallengeWindow,
  fromDateTimeLocalValue,
  localizeChallenge,
  pickActiveChallenge,
  toDateTimeLocalValue,
  validateChallengeForm,
  type WeeklyChallenge,
} from "./challenge.ts";

const make = (over: Partial<WeeklyChallenge> = {}): WeeklyChallenge => ({
  id: "c1",
  titleTr: "Işık oyunları",
  titleEn: "Light play",
  descriptionTr: "Haftanın teması",
  descriptionEn: "Theme of the week",
  tagSlug: "isik-oyunu",
  tagLabel: "Işık Oyunu",
  startsAt: "2026-10-12T00:00:00.000Z",
  endsAt: "2026-10-19T00:00:00.000Z",
  ...over,
});

test("status: upcoming / active / ended, with the end instant already ended", () => {
  const c = make();
  assert.equal(challengeStatus(c, new Date("2026-10-11T23:59:59Z")), "upcoming");
  assert.equal(challengeStatus(c, new Date("2026-10-12T00:00:00Z")), "active");
  assert.equal(challengeStatus(c, new Date("2026-10-18T23:59:59Z")), "active");
  assert.equal(challengeStatus(c, new Date("2026-10-19T00:00:00Z")), "ended");
});

test("pickActiveChallenge shows the most recently started active theme, ignores upcoming/ended, null when none", () => {
  const older = make({ id: "older", startsAt: "2026-10-10T00:00:00Z", endsAt: "2026-10-20T00:00:00Z" });
  const newer = make({ id: "newer", startsAt: "2026-10-13T00:00:00Z", endsAt: "2026-10-20T00:00:00Z" });
  const upcoming = make({ id: "up", startsAt: "2026-10-16T00:00:00Z", endsAt: "2026-10-23T00:00:00Z" });
  const ended = make({ id: "ended", startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-10-08T00:00:00Z" });
  const now = new Date("2026-10-14T12:00:00Z");
  assert.equal(pickActiveChallenge([older, upcoming, newer, ended], now)?.id, "newer");
  assert.equal(pickActiveChallenge([upcoming, ended], now), null);
  assert.equal(pickActiveChallenge([], now), null);
});

test("localizeChallenge follows the language and falls back when one side is empty", () => {
  const c = make();
  assert.deepEqual(localizeChallenge(c, "tr"), { title: "Işık oyunları", description: "Haftanın teması" });
  assert.deepEqual(localizeChallenge(c, "en"), { title: "Light play", description: "Theme of the week" });
  assert.deepEqual(localizeChallenge(make({ titleEn: "  ", descriptionEn: "" }), "en"), { title: "Işık oyunları", description: "Haftanın teması" });
  assert.deepEqual(localizeChallenge(make({ descriptionTr: "" }), "tr").description, "Theme of the week");
});

test("default window starts now (to the minute) and lasts 7 days", () => {
  const w = defaultChallengeWindow(new Date("2026-10-14T12:34:56.789Z"));
  assert.equal(w.startsAt, "2026-10-14T12:34:00.000Z");
  assert.equal(w.endsAt, "2026-10-21T12:34:00.000Z");
});

test("datetime-local conversion round-trips in the viewer's timezone", () => {
  const iso = "2026-10-14T12:30:00.000Z";
  // Istanbul is UTC+3 → getTimezoneOffset() = -180
  assert.equal(toDateTimeLocalValue(iso, -180), "2026-10-14T15:30");
  assert.equal(toDateTimeLocalValue(iso, 0), "2026-10-14T12:30");
  assert.equal(toDateTimeLocalValue(iso, 300), "2026-10-14T07:30");
  const local = fromDateTimeLocalValue("2026-10-14T15:30");
  assert.ok(local);
  assert.equal(fromDateTimeLocalValue(""), null);
  assert.equal(fromDateTimeLocalValue("2026-13-45T99:99"), null);
  assert.equal(fromDateTimeLocalValue("not a date"), null);
});

test("form validation mirrors the database rules", () => {
  const ok = { titleTr: "Başlık", titleEn: "Title", descriptionTr: "", descriptionEn: "", tagLabel: "Portre", startsAt: "2026-10-14T00:00:00Z", endsAt: "2026-10-21T00:00:00Z" };
  assert.equal(validateChallengeForm(ok), null);
  assert.equal(validateChallengeForm({ ...ok, titleTr: "   " }), "title");
  assert.equal(validateChallengeForm({ ...ok, titleEn: "x".repeat(81) }), "title");
  assert.equal(validateChallengeForm({ ...ok, titleEn: "x".repeat(80) }), null);
  assert.equal(validateChallengeForm({ ...ok, descriptionTr: "x".repeat(301) }), "description");
  assert.equal(validateChallengeForm({ ...ok, tagLabel: "" }), "tag");
  assert.equal(validateChallengeForm({ ...ok, tagLabel: "<b>" }), "tag");
  assert.equal(validateChallengeForm({ ...ok, tagLabel: "x".repeat(61) }), "tag");
  assert.equal(validateChallengeForm({ ...ok, endsAt: ok.startsAt }), "window");
  assert.equal(validateChallengeForm({ ...ok, startsAt: null }), "window");
});
