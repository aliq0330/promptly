import test from "node:test";
import assert from "node:assert/strict";
import type { WorkflowStep } from "@/types";
import { initialRunState, type WorkflowRunState } from "./workflow-run.ts";
import {
  clearAutoResults,
  composeStepPrompt,
  firstStepToRun,
  planChain,
  runWorkflowChain,
  stepRunBlock,
  type ChainDeps,
  type ChainEvent,
} from "./workflow-auto-run.ts";

interface StepOpts {
  contentType?: "text" | "image" | null;
  type?: "prompt" | "request";
  published?: boolean;
  noContent?: boolean;
  noOutput?: boolean;
  /** `[stepIndex]` of the earlier step whose first output this step's input reads. */
  from?: number;
  ownInput?: boolean;
}

/** Steps `s0, s1, …`: each has output `o<i>`; a step with `from` has an input `i<i>` wired to `o<from>`. */
function build(specs: StepOpts[]): WorkflowStep[] {
  return specs.map((spec, i) => ({
    id: `s${i}`,
    title: `Step ${i}`,
    description: "",
    instructions: "",
    stepType: spec.type ?? "prompt",
    content: spec.noContent
      ? null
      : { type: spec.type ?? "prompt", id: `p${i}`, title: `P${i}`, contentType: spec.contentType === undefined ? "text" : spec.contentType, category: null, authorName: "A", authorUsername: "a", thumbnailUrl: null, published: spec.published ?? true, href: "/x" },
    contentMissing: false,
    inputs: [
      ...(spec.from !== undefined ? [{ id: `i${i}`, label: `In${i}`, source: { stepId: `s${spec.from}`, outputId: `o${spec.from}` } }] : []),
      ...(spec.ownInput ? [{ id: `own${i}`, label: "", source: null }] : []),
    ],
    outputs: spec.noOutput ? [] : [{ id: `o${i}`, label: `Out${i}` }],
  })) as unknown as WorkflowStep[];
}

const text = {};
function deps(overrides: Partial<ChainDeps> = {}, log: string[] = []): ChainDeps {
  return {
    loadPrompt: async (step) => ({ ok: true, text: `PROMPT ${step.id}` }),
    generate: async (prompt) => {
      log.push(prompt);
      return `result-of(${prompt.split("\n")[0]})`;
    },
    ...overrides,
  };
}
const run = (steps: WorkflowStep[], state: WorkflowRunState, d: ChainDeps, from = 0, signal = new AbortController().signal) => {
  const events: ChainEvent[] = [];
  return runWorkflowChain({ steps, state, from, deps: d, signal, onEvent: (e) => events.push(e), defaultInputLabel: "Input" }).then((result) => ({ ...result, events }));
};
void text;

test("stepRunBlock names the reason a step cannot run automatically", () => {
  const steps = build([{}, { noContent: true }, { type: "request" }, { published: false }, { contentType: "image" }, { noOutput: true }]);
  assert.deepEqual(steps.map(stepRunBlock), [null, "no_content", "not_prompt", "unpublished", "not_text", "no_output"]);
});

test("composeStepPrompt appends non-empty inputs as 'Label:\\nvalue' blocks", () => {
  assert.equal(composeStepPrompt("  Write it  ", []), "Write it");
  assert.equal(composeStepPrompt("Write it", [{ label: "Topic", value: " cats " }, { label: "Empty", value: "  " }, { label: "Tone", value: "calm" }]), "Write it\n\nTopic:\ncats\n\nTone:\ncalm");
});

test("planChain counts model calls and reports where the chain stops", () => {
  const steps = build([{}, { from: 0 }, { contentType: "image", from: 1 }, { from: 2 }]);
  const plan = planChain(steps, initialRunState());
  assert.deepEqual(plan.runs, [0, 1]);
  assert.deepEqual(plan.stopsAt, { index: 2, reason: "not_text" });
  // The person did step 2 by hand → the chain continues past it.
  const withManual = { ...initialRunState(), outputs: { o2: "picture caption" } };
  const resumed = planChain(steps, withManual);
  assert.deepEqual(resumed.runs, [0, 1, 3]);
  assert.equal(resumed.stopsAt, null);
  assert.equal(firstStepToRun(steps, withManual), 0);
  assert.equal(firstStepToRun(steps, { ...withManual, done: ["s0", "s1"], outputs: { ...withManual.outputs, o0: "a", o1: "b" } }), 3, "finished steps are skipped");
});

test("a 3-step chain feeds each result into the next step's prompt and marks every step done", async () => {
  const log: string[] = [];
  const steps = build([{ ownInput: true }, { from: 0 }, { from: 1 }]);
  const start = { ...initialRunState(), inputs: { own0: "a product" } };
  const result = await run(steps, start, deps({}, log));
  assert.equal(result.stop, "completed");
  assert.equal(log.length, 3);
  assert.equal(log[0], "PROMPT s0\n\nInput:\na product", "an own input with no label uses the default label");
  assert.equal(log[1], "PROMPT s1\n\nIn1:\nresult-of(PROMPT s0)", "step 2 receives step 1's output");
  assert.equal(log[2].startsWith("PROMPT s2\n\nIn2:\nresult-of(PROMPT s1"), true);
  assert.deepEqual(result.state.done, ["s0", "s1", "s2"]);
  assert.equal(result.state.outputs.o0, "result-of(PROMPT s0)");
  assert.deepEqual(result.events.map((e) => `${e.type}:${e.index}`), ["start:0", "done:0", "start:1", "done:1", "start:2", "done:2"]);
  assert.equal(start.outputs.o0, undefined, "the input state is not mutated");
});

test("the chain STOPS at a step it cannot run, and resumes after the person did it by hand", async () => {
  const log: string[] = [];
  const steps = build([{}, { contentType: "image", from: 0 }, { from: 1 }]);
  const first = await run(steps, initialRunState(), deps({}, log));
  assert.equal(first.stop, "blocked");
  assert.equal(first.at, 1);
  assert.equal(log.length, 1, "nothing after the blocked step ran");
  assert.deepEqual(first.events.at(-1), { type: "blocked", index: 1, reason: "not_text" });
  const manual = { ...first.state, outputs: { ...first.state.outputs, o1: "I made the image by hand" } };
  const second = await run(steps, manual, deps({}, log), 0);
  assert.equal(second.stop, "completed");
  assert.equal(log.length, 2, "step 0 was already done and is reused; only step 2 ran");
  assert.ok(second.events.some((e) => e.type === "kept" && e.index === 0));
  assert.ok(second.events.some((e) => e.type === "kept" && e.index === 1));
  assert.ok(log[1].includes("In2:\nI made the image by hand"));
});

test("an empty LINKED input never reaches the model (no money spent on an incomplete request)", async () => {
  const log: string[] = [];
  const steps = build([{}, { from: 0 }]);
  const result = await run(steps, initialRunState(), deps({}, log), 1);
  assert.equal(result.stop, "error");
  assert.deepEqual(result.events.at(-1), { type: "error", index: 1, error: { kind: "missing_input", detail: "Out0" } });
  assert.equal(log.length, 0);
});

test("provider errors keep their kind; unknown errors become 'unknown'; an unresolved variable stops before any call", async () => {
  const steps = build([{}]);
  const quota = await run(steps, initialRunState(), deps({ generate: async () => { throw Object.assign(new Error("429 too many"), { kind: "quota" }); } }));
  assert.deepEqual(quota.events.at(-1), { type: "error", index: 0, error: { kind: "quota", detail: "429 too many" } });
  const odd = await run(steps, initialRunState(), deps({ generate: async () => { throw new Error("boom"); } }));
  assert.equal((odd.events.at(-1) as { error: { kind: string } }).error.kind, "unknown");
  const log: string[] = [];
  const variable = await run(steps, initialRunState(), deps({ loadPrompt: async () => ({ ok: false, missingVariable: "topic" }) }, log));
  assert.deepEqual(variable.events.at(-1), { type: "error", index: 0, error: { kind: "variable", detail: "topic" } });
  assert.equal(log.length, 0);
  const loadFail = await run(steps, initialRunState(), deps({ loadPrompt: async () => { throw new Error("net"); } }));
  assert.equal((loadFail.events.at(-1) as { error: { kind: string } }).error.kind, "prompt_load");
  const empty = await run(steps, initialRunState(), deps({ generate: async () => "   " }));
  assert.equal((empty.events.at(-1) as { error: { kind: string } }).error.kind, "empty");
});

test("aborting cancels the running call; finished steps are kept, the aborted step writes nothing", async () => {
  const controller = new AbortController();
  const steps = build([{}, { from: 0 }]);
  let calls = 0;
  const abortingDeps = deps({
    generate: async (_prompt, signal) => {
      calls += 1;
      if (calls === 2) {
        controller.abort();
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return signal.aborted ? "" : "first result";
    },
  });
  const result = await run(steps, initialRunState(), abortingDeps, 0, controller.signal);
  assert.equal(result.stop, "aborted");
  assert.equal(result.at, 1);
  assert.equal(result.state.outputs.o0, "first result");
  assert.equal(result.state.outputs.o1, undefined);
  assert.deepEqual(result.state.done, ["s0"]);
  assert.ok(!result.events.some((e) => e.type === "error"), "an abort is not reported as a failure");
});

test("clearAutoResults wipes only what the model produces, keeping hand-made results and the person's own inputs", () => {
  const steps = build([{ ownInput: true }, { contentType: "image", from: 0 }, { from: 1 }]);
  const state: WorkflowRunState = { current: 2, done: ["s0", "s1", "s2"], inputs: { own0: "keep me" }, outputs: { o0: "auto", o1: "by hand", o2: "auto 2" } };
  const cleared = clearAutoResults(steps, state);
  assert.deepEqual(cleared.outputs, { o1: "by hand" });
  assert.deepEqual(cleared.done, ["s1"]);
  assert.deepEqual(cleared.inputs, { own0: "keep me" });
  assert.equal(cleared.current, 2);
});
