import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectResults,
  goToStep,
  initialRunState,
  missingLinkedInputs,
  resolveInputs,
  runProgress,
  sanitizeRunState,
  setRunOutput,
  setRunOwnInput,
  toggleStepDone,
  MAX_RUN_VALUE_LENGTH,
} from "./workflow-run.ts";
import type { WorkflowStep } from "../types/index.ts";

const step = (id: string, over: Partial<WorkflowStep> = {}): WorkflowStep => ({
  id,
  title: id,
  description: "",
  instructions: "",
  stepType: "prompt",
  content: null,
  contentMissing: false,
  inputs: [],
  outputs: [],
  ...over,
});

// s1 --(o1)--> s2 (input i2 linked, i2b own) --(o2)--> s3 (input i3 linked to o1, i3b linked to o2)
const steps: WorkflowStep[] = [
  step("s1", { outputs: [{ id: "o1", label: "Fikir" }] }),
  step("s2", {
    inputs: [
      { id: "i2", label: "Fikir", source: { stepId: "s1", outputId: "o1" } },
      { id: "i2b", label: "Ton", source: null },
    ],
    outputs: [{ id: "o2", label: "Metin" }],
  }),
  step("s3", {
    inputs: [
      { id: "i3", label: "Fikir", source: { stepId: "s1", outputId: "o1" } },
      { id: "i3b", label: "Metin", source: { stepId: "s2", outputId: "o2" } },
    ],
  }),
];

test("a linked input carries the output pasted for an earlier step; own inputs hold their own text", () => {
  let state = setRunOutput(initialRunState(), "o1", "Bir fikir");
  state = setRunOwnInput(state, "i2b", "Samimi");
  const [linked, own] = resolveInputs(steps, 1, state);
  assert.equal(linked.kind, "linked");
  assert.equal(linked.value, "Bir fikir");
  assert.equal(linked.kind === "linked" && linked.fromIndex, 0);
  assert.equal(own.kind, "own");
  assert.equal(own.value, "Samimi");
});

test("an output reaches every later step wired to it", () => {
  const state = setRunOutput(setRunOutput(initialRunState(), "o1", "A"), "o2", "B");
  const [fromFirst, fromSecond] = resolveInputs(steps, 2, state);
  assert.equal(fromFirst.value, "A");
  assert.equal(fromSecond.value, "B");
});

test("a link to a later or missing step is treated as the step's own input", () => {
  const broken: WorkflowStep[] = [
    step("a", { inputs: [{ id: "x", label: "x", source: { stepId: "b", outputId: "ob" } }] }),
    step("b", { outputs: [{ id: "ob", label: "ob" }] }),
  ];
  const state = setRunOwnInput(initialRunState(), "x", "typed");
  const [r] = resolveInputs(broken, 0, state);
  assert.equal(r.kind, "own");
  assert.equal(r.value, "typed");
  const ghost: WorkflowStep[] = [step("a"), step("c", { inputs: [{ id: "y", label: "y", source: { stepId: "zzz", outputId: "q" } }] })];
  assert.equal(resolveInputs(ghost, 1, initialRunState())[0].kind, "own");
});

test("missingLinkedInputs lists only linked inputs with nothing pasted yet", () => {
  assert.equal(missingLinkedInputs(steps, 1, initialRunState()).length, 1);
  assert.equal(missingLinkedInputs(steps, 1, setRunOutput(initialRunState(), "o1", "x")).length, 0);
  assert.equal(missingLinkedInputs(steps, 1, setRunOutput(initialRunState(), "o1", "   ")).length, 1);
  assert.equal(missingLinkedInputs(steps, 0, initialRunState()).length, 0);
});

test("progress counts distinct done steps that still exist", () => {
  let state = toggleStepDone(initialRunState(), "s1");
  assert.deepEqual(runProgress(steps, state), { doneCount: 1, total: 3, percent: 33 });
  state = toggleStepDone(state, "s1");
  assert.equal(runProgress(steps, state).doneCount, 0);
  assert.equal(runProgress(steps, { ...state, done: ["s1", "s1", "gone"] }).doneCount, 1);
  assert.deepEqual(runProgress([], initialRunState()), { doneCount: 0, total: 0, percent: 0 });
});

test("goToStep stays inside the step list", () => {
  assert.equal(goToStep(initialRunState(), 99, steps).current, 2);
  assert.equal(goToStep(initialRunState(), -4, steps).current, 0);
  assert.equal(goToStep(initialRunState(), 1, []).current, 0);
});

test("collectResults returns pasted results in step order, skipping blanks", () => {
  const state = setRunOutput(setRunOutput(initialRunState(), "o2", "İkinci"), "o1", "Birinci");
  assert.deepEqual(collectResults(steps, state).map((r) => [r.stepIndex, r.label, r.value]), [[0, "Fikir", "Birinci"], [1, "Metin", "İkinci"]]);
  assert.equal(collectResults(steps, setRunOutput(initialRunState(), "o1", "  ")).length, 0);
});

test("values are capped", () => {
  const long = "x".repeat(MAX_RUN_VALUE_LENGTH + 50);
  assert.equal(setRunOutput(initialRunState(), "o1", long).outputs.o1.length, MAX_RUN_VALUE_LENGTH);
  assert.equal(setRunOwnInput(initialRunState(), "i2b", long).inputs.i2b.length, MAX_RUN_VALUE_LENGTH);
});

test("sanitizeRunState drops malformed data and ids the workflow no longer has", () => {
  assert.deepEqual(sanitizeRunState(null, steps), initialRunState());
  assert.deepEqual(sanitizeRunState("junk", steps), initialRunState());
  const restored = sanitizeRunState(
    { current: 7, done: ["s1", "s1", "gone", 4], inputs: { i2b: "ok", nope: "x", i3: 5 }, outputs: { o1: "keep", ghost: "x" } },
    steps,
  );
  assert.deepEqual(restored, { current: 2, done: ["s1"], inputs: { i2b: "ok" }, outputs: { o1: "keep" } });
});
