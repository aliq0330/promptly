import { test } from "node:test";
import assert from "node:assert/strict";
import { focusActiveIndex, focusKeyAction, focusResultStep, focusSheetDrag, focusSheetGesture, focusSheetRelease, focusSheetStep, focusTabs } from "./focus-sheet.ts";

test("the card steps closed → half → full and back; the ends stay put", () => {
  assert.equal(focusSheetStep(null, "up"), "half");
  assert.equal(focusSheetStep("half", "up"), "full");
  assert.equal(focusSheetStep("full", "up"), "full");
  assert.equal(focusSheetStep("full", "down"), "half");
  assert.equal(focusSheetStep("half", "down"), null);
  assert.equal(focusSheetStep(null, "down"), null);
});

test("a drag counts past 48 px or as a quick flick; a small slow one decides nothing", () => {
  assert.equal(focusSheetGesture(-60, 400), "up");
  assert.equal(focusSheetGesture(60, 400), "down");
  assert.equal(focusSheetGesture(-30, 400), null);
  assert.equal(focusSheetGesture(-30, 40), "up", "fast flick");
  assert.equal(focusSheetGesture(6, 10), null, "a tap's jitter is nothing");
});

test("only a prompt has results and versions; the other kinds have their own tab + comments", () => {
  assert.deepEqual(focusTabs("prompt", false), ["main", "comments", "results"]);
  assert.deepEqual(focusTabs("prompt", true), ["main", "comments", "results", "versions"]);
  for (const kind of ["request", "workflow", "preset", "skill"] as const) assert.deepEqual(focusTabs(kind, true), ["main", "comments"]);
});

test("results step sideways and stop at the ends", () => {
  assert.equal(focusResultStep(0, 4, 1), 1);
  assert.equal(focusResultStep(3, 4, 1), 3);
  assert.equal(focusResultStep(0, 4, -1), 0);
  assert.equal(focusResultStep(2, 0, 1), 0);
});

test("the active post is the screen the vertical scroller rests on", () => {
  assert.equal(focusActiveIndex(0, 800, 10), 0);
  assert.equal(focusActiveIndex(799, 800, 10), 1);
  assert.equal(focusActiveIndex(2400, 800, 10), 3);
  assert.equal(focusActiveIndex(99999, 800, 10), 9, "never past the last post");
  assert.equal(focusActiveIndex(100, 0, 10), 0);
  assert.equal(focusActiveIndex(100, 800, 0), 0);
});

test("keys: ↑ ↓ move between posts, ← → between results, P panel, C copy, Esc close", () => {
  assert.equal(focusKeyAction("ArrowDown"), "next");
  assert.equal(focusKeyAction("j"), "next");
  assert.equal(focusKeyAction("PageUp"), "prev");
  assert.equal(focusKeyAction("ArrowRight"), "resultNext");
  assert.equal(focusKeyAction("h"), "resultPrev");
  assert.equal(focusKeyAction("p"), "panel");
  assert.equal(focusKeyAction("C"), "copy");
  assert.equal(focusKeyAction("Escape"), "close");
  assert.equal(focusKeyAction("Home"), "first");
  assert.equal(focusKeyAction("x"), null);
});

test("focusSheetRelease: yarımın %70'inin altı kapatır, yolun üçte birini geçmek büyütür, ötesi yarımda kalır", () => {
  const half = 600;
  const tall = 720;
  assert.equal(focusSheetRelease(half, 0, half, tall), "half");
  assert.equal(focusSheetRelease(half - 100, 0, half, tall), "half", "küçük bir aşağı çekiş yarımda kalır");
  assert.equal(focusSheetRelease(half * 0.7 - 1, 0, half, tall), "closed");
  assert.equal(focusSheetRelease(half, -1, half, tall), "closed", "hızlı aşağı fırlatma kapatır (izdüşüm 600 - 200)");
  assert.equal(focusSheetRelease(half + 39, 0, half, tall), "half", "yolun üçte biri = 639,6");
  assert.equal(focusSheetRelease(half + 41, 0, half, tall), "full");
  assert.equal(focusSheetRelease(half, 0.4, half, tall), "full", "hızlı yukarı fırlatma büyütür");
  assert.equal(focusSheetRelease(tall, 0, half, tall), "full");
});

test("focusSheetDrag: başlıktan yukarı büyütür, %90'da durur; içerikten %90'a kadar kaymaz, sonra kayar; en üstteyken aşağı küçültür", () => {
  const g = (over: Partial<Parameters<typeof focusSheetDrag>[0]>) => focusSheetDrag({ height: 600, dy: 0, region: "head", tall: 720, floor: -50, scrollTop: 0, ...over });
  assert.deepEqual(g({ dy: -50 }), { height: 650, scroll: 0 }, "yukarı = büyür");
  assert.deepEqual(g({ dy: -200 }), { height: 720, scroll: 0 }, "başlıktan %90'ı aşmaz");
  assert.deepEqual(g({ dy: -200, region: "body" }), { height: 720, scroll: 80 }, "içerikten artan hareket içeriği kaydırır");
  assert.deepEqual(g({ dy: -30, region: "body" }), { height: 630, scroll: 0 }, "yarımda içerik kaymaz");
  assert.deepEqual(g({ height: 720, dy: -40, region: "body", scrollTop: 10 }), { height: 720, scroll: 40 }, "%90'da içerik kayar");
  assert.deepEqual(g({ height: 720, dy: 40, region: "body", scrollTop: 0 }), { height: 680, scroll: 0 }, "üstteyken aşağı kart küçülür");
  assert.deepEqual(g({ height: 720, dy: 40, region: "body", scrollTop: 100 }), { height: 720, scroll: -40 }, "içerik aşağıdayken aşağı çekmek içeriği geri kaydırır");
  assert.equal(g({ dy: 900 }).height, -50, "kapalının biraz ötesinde durur");
});
