import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STORY_LIMITS,
  hoursLeft,
  isStoryActive,
  isStoryEmpty,
  parseDraftPayload,
  parseStoryLayout,
  pollPercentages,
  sniffVideoMime,
  storyDisplayDuration,
  validateSticker,
} from "./stories.ts";
import { localizeNotificationMessage } from "./notification-message.ts";

const layer = (over: Record<string, unknown> = {}) => ({ id: "a", text: "Merhaba", x: 0.5, y: 0.5, align: "center", size: "m", color: "white", bg: false, ...over });

test("layout: a valid v1 layout round-trips", () => {
  const raw = { v: 1, bg: "ink", fit: "cover", layers: [layer()], link: { x: 0.5, y: 0.7 }, sticker: { x: 0.2, y: 0.3 } };
  assert.deepEqual(parseStoryLayout(raw), raw);
});

test("layout: rejects what the server rejects (unknown keys, out-of-canvas points, hex colours, long text, wrong version)", () => {
  assert.equal(parseStoryLayout({ v: 1, evil: true }), null);
  assert.equal(parseStoryLayout({ v: 2, layers: [] }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: [layer({ x: 1.2 })] }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: [layer({ color: "#ff0000" })] }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: [layer({ text: "x".repeat(STORY_LIMITS.layerTextMax + 1) })] }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: [layer({ text: "   " })] }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: [layer({ extra: 1 })] }), null);
  assert.equal(parseStoryLayout({ v: 1, link: { x: 0.5 } }), null);
  assert.equal(parseStoryLayout({ v: 1, layers: Array.from({ length: STORY_LIMITS.maxLayers + 1 }, (_, i) => layer({ id: `l${i}` })) }), null);
  assert.equal(parseStoryLayout(null), null);
  assert.equal(parseStoryLayout("{}"), null);
});

test("layout: missing layers become an empty list (text-only defaults)", () => {
  assert.deepEqual(parseStoryLayout({ v: 1, bg: "cobalt" }), { v: 1, bg: "cobalt", layers: [] });
});

test("sticker: poll needs 2–4 non-empty options and a short question; question needs text", () => {
  assert.deepEqual(validateSticker({ kind: "poll", question: " Hangisi? ", options: [" A ", "B"] }), { ok: true, sticker: { kind: "poll", question: "Hangisi?", options: ["A", "B"] } });
  assert.equal(validateSticker({ kind: "poll", question: "?", options: ["A"] }).ok, false);
  assert.equal(validateSticker({ kind: "poll", question: "?", options: ["A", ""] }).ok, false);
  assert.equal(validateSticker({ kind: "poll", question: "?", options: ["A", "B", "C", "D", "E"] }).ok, false);
  assert.equal(validateSticker({ kind: "poll", question: "", options: ["A", "B"] }).ok, false);
  assert.equal(validateSticker({ kind: "question", question: "x".repeat(STORY_LIMITS.questionMax + 1) }).ok, false);
  assert.deepEqual(validateSticker(null), { ok: true, sticker: null });
});

test("empty text story is refused, media/link/sticker stories are not", () => {
  const empty = { v: 1 as const, layers: [] };
  assert.equal(isStoryEmpty("text", empty, false, null), true);
  assert.equal(isStoryEmpty("text", empty, true, null), false);
  assert.equal(isStoryEmpty("text", empty, false, { kind: "question", question: "?" }), false);
  assert.equal(isStoryEmpty("image", empty, false, null), false);
});

test("display duration: photo 6s, text 7s, +3s with a sticker, video its own length capped at 60s", () => {
  assert.equal(storyDisplayDuration({ kind: "image", mediaDurationMs: null, sticker: null }), 6000);
  assert.equal(storyDisplayDuration({ kind: "text", mediaDurationMs: null, sticker: null }), 7000);
  assert.equal(storyDisplayDuration({ kind: "text", mediaDurationMs: null, sticker: { kind: "question", question: "?" } }), 10000);
  assert.equal(storyDisplayDuration({ kind: "video", mediaDurationMs: 12_345, sticker: null }), 12_345);
  assert.equal(storyDisplayDuration({ kind: "video", mediaDurationMs: 90_000, sticker: null }), 60_000);
});

test("expiry uses the stored server timestamp", () => {
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(isStoryActive("2026-10-18T12:00:01Z", now), true);
  assert.equal(isStoryActive("2026-10-18T12:00:00Z", now), false);
  assert.equal(hoursLeft("2026-10-18T13:30:00Z", now), 2);
  assert.equal(hoursLeft("2026-10-18T11:00:00Z", now), 0);
});

test("video type comes from the bytes, not the file name", () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const mov = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
  const html = new TextEncoder().encode("<html><body>");
  assert.equal(sniffVideoMime(mp4), "video/mp4");
  assert.equal(sniffVideoMime(mov), "video/quicktime");
  assert.equal(sniffVideoMime(webm), "video/webm");
  assert.equal(sniffVideoMime(html), null);
  assert.equal(sniffVideoMime(new Uint8Array([0x1a])), null);
});

test("poll percentages always add up to 100 (largest remainder) and are 0 without votes", () => {
  assert.deepEqual(pollPercentages([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(pollPercentages([2, 1]), [67, 33]);
  assert.deepEqual(pollPercentages([0, 0]), [0, 0]);
  assert.equal(pollPercentages([3, 7, 11, 5]).reduce((a, b) => a + b, 0), 100);
});

test("draft payload is re-validated on load", () => {
  const ok = {
    v: 1, kind: "text", layout: { v: 1, bg: "ink", layers: [layer()] }, linkedType: null, linkedId: null, sticker: null,
    audience: "followers", communityId: null, mediaWidth: null, mediaHeight: null, mediaDurationMs: null,
  };
  assert.deepEqual(parseDraftPayload(ok), ok);
  assert.equal(parseDraftPayload({ ...ok, audience: "everyone" }), null);
  assert.equal(parseDraftPayload({ ...ok, linkedType: "prompt" }), null);
  assert.equal(parseDraftPayload({ ...ok, layout: { v: 1, layers: [layer({ color: "red" })] } }), null);
  assert.equal(parseDraftPayload({ ...ok, sticker: { kind: "poll", question: "?", options: [1, 2] } }), null);
});

test("story notification sentences (written in Turkish by SQL) are re-rendered in English; user content passes through", () => {
  const t = ((key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ""}`) as Parameters<typeof localizeNotificationMessage>[2];
  assert.equal(localizeNotificationMessage("Hikâyene tepki verdi: 🔥", "en", t), 'notifMsg.storyReaction{"preview":"🔥"}');
  assert.equal(localizeNotificationMessage("Hikâyendeki ankete oy verdi.", "en", t), "notifMsg.storyPollVote");
  assert.equal(localizeNotificationMessage("Hikâyendeki soruyu yanıtladı.", "en", t), "notifMsg.storyQuestionAnswer");
  assert.equal(localizeNotificationMessage('Hikâyene yanıt verdi: "Harika!"', "en", t), 'notifMsg.storyReply{"preview":"\\"Harika!\\""}');
  assert.equal(localizeNotificationMessage('"Tasarımcılar" topluluğundaki hikâyen kaldırıldı.', "en", t), 'notifMsg.storyRemovedCommunity{"name":"Tasarımcılar"}');
  assert.equal(localizeNotificationMessage("Hikâyene tepki verdi: 🔥", "tr", t), "Hikâyene tepki verdi: 🔥");
});
