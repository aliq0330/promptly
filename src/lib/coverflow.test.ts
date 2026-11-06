import assert from "node:assert/strict";
import test from "node:test";
import { COVERFLOW_MAX_VISIBLE, coverflowCardSize, coverflowPose, coverflowTransform, stepIndex, wrapOffset } from "./coverflow.ts";

test("wrapOffset takes the shortest way round the loop", () => {
  assert.equal(wrapOffset(0, 0, 7), 0);
  assert.equal(wrapOffset(1, 0, 7), 1);
  assert.equal(wrapOffset(6, 0, 7), -1);
  assert.equal(wrapOffset(0, 6, 7), 1);
  assert.equal(wrapOffset(3, 0, 7), 3);
  assert.equal(wrapOffset(4, 0, 7), -3);
  // an even count puts the opposite card on the positive side, and never twice
  assert.equal(wrapOffset(3, 0, 6), 3);
  assert.equal(wrapOffset(0, 0, 0), 0);
});

test("stepIndex loops in both directions", () => {
  assert.equal(stepIndex(0, -1, 5), 4);
  assert.equal(stepIndex(4, 1, 5), 0);
  assert.equal(stepIndex(2, 1, 5), 3);
  assert.equal(stepIndex(2, 0, 0), 0);
});

test("the centre card is upright, full size, and the nearest to the viewer", () => {
  const centre = coverflowPose(0, 200);
  assert.deepEqual(centre, { x: 0, z: -0, rotateY: -0, rotateZ: 0, scale: 1, visible: true });
  const right = coverflowPose(1, 200);
  const left = coverflowPose(-1, 200);
  assert.ok(right.x > 0 && left.x < 0);
  assert.equal(right.x, -left.x);
  assert.ok(right.z < centre.z, "neighbours fall back in depth");
  assert.ok(right.scale < 1 && right.scale > coverflowPose(2, 200).scale);
  assert.ok(right.rotateY < 0 && left.rotateY > 0, "they tilt towards the centre");
});

test("only the nearest cards are visible", () => {
  assert.equal(coverflowPose(COVERFLOW_MAX_VISIBLE, 100).visible, true);
  assert.equal(coverflowPose(-COVERFLOW_MAX_VISIBLE, 100).visible, true);
  assert.equal(coverflowPose(COVERFLOW_MAX_VISIBLE + 1, 100).visible, false);
  assert.equal(coverflowPose(10, 100).scale, 0.4, "the scale never collapses");
});

test("card size follows the stage and keeps the aspect ratio", () => {
  const tall = coverflowCardSize(1000, 300, 0.8);
  assert.equal(Math.round(tall.height), 240);
  assert.equal(Math.round(tall.width), 192);
  // a narrow stage caps the width instead
  const narrow = coverflowCardSize(200, 600, 0.8);
  assert.equal(Math.round(narrow.width), 92);
  assert.equal(Math.round(narrow.height), 115);
  assert.deepEqual(coverflowCardSize(0, 0, 0.8), { width: 0, height: 0 });
});

test("the transform centres the card before moving it", () => {
  const css = coverflowTransform(coverflowPose(1, 100));
  assert.ok(css.startsWith("translate(-50%, -50%) translateX(60px) translateZ(-60px)"));
  assert.match(css, /rotateY\(-12deg\) rotateZ\(8deg\) scale\(0\.84\)$/);
});
