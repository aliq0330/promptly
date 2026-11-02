import test from "node:test";
import assert from "node:assert/strict";
import { CONNECT_METHODS, CONNECT_STEPS, clampStep, filledSegments, stepState } from "./connect-guide.ts";

test("both routes have steps; ids are unique per route; every step has a title and a body", () => {
  assert.deepEqual(CONNECT_METHODS, ["oauth", "key"]);
  for (const method of CONNECT_METHODS) {
    const steps = CONNECT_STEPS[method];
    assert.ok(steps.length >= 5, `${method} has a real walkthrough`);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, `${method} step ids are unique`);
    for (const step of steps) {
      assert.ok(step.title && step.body, `${method}/${step.id} has copy`);
    }
  }
});

test("the address code block appears once per route and the key route ends with the header name, value and add", () => {
  for (const method of CONNECT_METHODS) {
    assert.equal(CONNECT_STEPS[method].filter((s) => s.code === "address").length, 1, `${method} shows the address once`);
  }
  const codes = CONNECT_STEPS.key.map((s) => s.code).filter(Boolean);
  assert.deepEqual(codes, ["address", "headerName", "headerValue"]);
  assert.equal(CONNECT_STEPS.key.at(-1)?.id, "add");
  assert.equal(CONNECT_STEPS.oauth.at(-1)?.id, "allow");
});

test("the Bearer warning lives on the header-value step only", () => {
  const warned = CONNECT_STEPS.key.filter((s) => s.warn).map((s) => s.id);
  assert.deepEqual(warned, ["value"]);
  assert.equal(CONNECT_STEPS.oauth.filter((s) => s.warn).length, 0);
});

test("only the key route sends people to My keys; both routes sketch the connector form once", () => {
  assert.equal(CONNECT_STEPS.key.filter((s) => s.keysLink).length, 1);
  assert.equal(CONNECT_STEPS.oauth.filter((s) => s.keysLink).length, 0);
  for (const method of CONNECT_METHODS) assert.equal(CONNECT_STEPS[method].filter((s) => s.sketch).length, 1);
});

test("step state: earlier done, current, later todo", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => stepState(i, 2)), ["done", "done", "current", "todo", "todo"]);
});

test("clampStep keeps the index inside the list and survives junk", () => {
  assert.equal(clampStep(-3, 5), 0);
  assert.equal(clampStep(2.9, 5), 2);
  assert.equal(clampStep(99, 5), 4);
  assert.equal(clampStep(3, 0), 0);
  assert.equal(clampStep(Number.NaN, 5), 0);
});

test("filled segments include the current step", () => {
  assert.equal(filledSegments(0, 5), 1);
  assert.equal(filledSegments(4, 5), 5);
  assert.equal(filledSegments(9, 5), 5);
  assert.equal(filledSegments(0, 0), 0);
});
