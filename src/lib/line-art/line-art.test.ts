import assert from "node:assert/strict";
import test from "node:test";
import { elbowFor, FOREARM, reachable, UPPER_ARM } from "./arm.ts";
import { gait } from "./gait.ts";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("a planted foot slides back at exactly the walking speed, so it stays still on the ground", () => {
  for (const kind of ["walk", "shuffle", "run"] as const) {
    const g = gait({ kind });
    const dPhase = 0.001;
    // early in the stance of foot 0, before the heel peels off
    const a = g.pose(0.05), b = g.pose(0.05 + dPhase);
    assert.ok(a.feet[0].stance && b.feet[0].stance, `${kind}: foot 0 planted`);
    const vx = (b.feet[0].ankle[0] - a.feet[0].ankle[0]) / (dPhase * g.period);
    assert.ok(Math.abs(vx + g.speed) < 1e-6, `${kind}: ${vx} vs ${-g.speed}`);
  }
});

test("go = 0 brings both feet to a standstill on the ground", () => {
  const g = gait({ kind: "walk" });
  for (const phase of [0, 0.3, 0.71]) {
    const p = g.pose(phase, 0);
    p.feet.forEach((foot) => {
      assert.equal(foot.stance, true);
      assert.ok(Math.abs(foot.ankle[1] - g.ankleY) < 1e-9);
      assert.ok(Math.abs(foot.ankle[0] - 40) <= 2 + 1e-9);
    });
  }
});

test("elbowFor keeps both bones their length and bends the way arms bend", () => {
  const s: [number, number] = [42.6, 43.4];
  // forward reach: elbow below the shoulder→hand line
  const forward: [number, number] = [70, 50];
  const e1 = elbowFor(s, forward);
  assert.ok(Math.abs(dist(s, e1) - UPPER_ARM) < 1e-9);
  assert.ok(Math.abs(dist(e1, forward) - FOREARM) < 1e-6);
  const lineY = s[1] + ((forward[1] - s[1]) * (e1[0] - s[0])) / (forward[0] - s[0]);
  assert.ok(e1[1] > lineY, "elbow below a forward reach");
  // hanging arm, hand slightly forward: elbow behind (toward -x)
  const e2 = elbowFor(s, [46, 72]);
  assert.ok(e2[0] < 46, "elbow behind a hanging arm");
  // raised arm (waving): elbow in front
  const e3 = elbowFor(s, [44, 16]);
  assert.ok(e3[0] > 44, "elbow in front of a raised arm");
});

test("reachable pulls an out-of-reach target back onto the arm's reach", () => {
  const s: [number, number] = [0, 0];
  assert.deepEqual(reachable(s, [10, 10]), [10, 10]);
  const far = reachable(s, [100, 0]);
  assert.ok(Math.abs(far[0] - (UPPER_ARM + FOREARM - 0.4)) < 1e-9 && far[1] === 0);
});
