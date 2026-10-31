/**
 * Pure state of the "step by step" run mode of a public workflow. Promptly's servers
 * never run a model (CLAUDE.md Bölüm 1): the person works through the steps in their
 * own tool — or lets the browser run the text steps with their own API key
 * (`lib/workflow-auto-run.ts`, docs/history/296-*) — and the output of each step is
 * offered again as the input of the later steps wired to it. Nothing here touches the
 * network or React; the state lives in the browser only (see `workflow-runner.tsx`).
 */
import type { WorkflowInput, WorkflowStep } from "@/types";

export interface WorkflowRunState {
  /** Index of the step being worked on. */
  current: number;
  /** Ids of the steps marked as done. */
  done: string[];
  /** Value typed for a step's OWN input (one not fed by an earlier step), by input id. */
  inputs: Record<string, string>;
  /** What the person pasted as a step's result, by output id. */
  outputs: Record<string, string>;
}

export const MAX_RUN_VALUE_LENGTH = 20000;

export function initialRunState(): WorkflowRunState {
  return { current: 0, done: [], inputs: {}, outputs: {} };
}

export function runStorageKey(workflowId: string): string {
  return `promptly-workflow-run:${workflowId}`;
}

function clampIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index) || 0), stepCount - 1);
}

export function goToStep(state: WorkflowRunState, index: number, steps: WorkflowStep[]): WorkflowRunState {
  return { ...state, current: clampIndex(index, steps.length) };
}

export function toggleStepDone(state: WorkflowRunState, stepId: string): WorkflowRunState {
  const done = state.done.includes(stepId) ? state.done.filter((id) => id !== stepId) : [...state.done, stepId];
  return { ...state, done };
}

export function setRunOutput(state: WorkflowRunState, outputId: string, value: string): WorkflowRunState {
  return { ...state, outputs: { ...state.outputs, [outputId]: value.slice(0, MAX_RUN_VALUE_LENGTH) } };
}

export function setRunOwnInput(state: WorkflowRunState, inputId: string, value: string): WorkflowRunState {
  return { ...state, inputs: { ...state.inputs, [inputId]: value.slice(0, MAX_RUN_VALUE_LENGTH) } };
}

/**
 * The value of one input of a step: an input wired to an EARLIER step's output
 * carries whatever was pasted for that output; any other input holds the text
 * typed for it. A wiring that points at a step/output that no longer exists (or
 * at a later step) is treated as the step's own input.
 */
export type ResolvedInput =
  | { kind: "linked"; input: WorkflowInput; value: string; fromIndex: number; outputLabel: string }
  | { kind: "own"; input: WorkflowInput; value: string };

export function resolveInput(steps: WorkflowStep[], stepIndex: number, input: WorkflowInput, state: WorkflowRunState): ResolvedInput {
  const source = input.source;
  if (source) {
    const fromIndex = steps.findIndex((s) => s.id === source.stepId);
    const output = fromIndex >= 0 && fromIndex < stepIndex ? steps[fromIndex].outputs.find((o) => o.id === source.outputId) : undefined;
    if (output) return { kind: "linked", input, value: state.outputs[output.id] ?? "", fromIndex, outputLabel: output.label };
  }
  return { kind: "own", input, value: state.inputs[input.id] ?? "" };
}

export function resolveInputs(steps: WorkflowStep[], stepIndex: number, state: WorkflowRunState): ResolvedInput[] {
  return steps[stepIndex].inputs.map((input) => resolveInput(steps, stepIndex, input, state));
}

/** Linked inputs whose earlier step has no pasted result yet — shown as a gentle "go back and paste it" hint. */
export function missingLinkedInputs(steps: WorkflowStep[], stepIndex: number, state: WorkflowRunState): ResolvedInput[] {
  return resolveInputs(steps, stepIndex, state).filter((r) => r.kind === "linked" && r.value.trim() === "");
}

export interface RunProgress {
  doneCount: number;
  total: number;
  percent: number;
}

export function runProgress(steps: WorkflowStep[], state: WorkflowRunState): RunProgress {
  const ids = new Set(steps.map((s) => s.id));
  const doneCount = new Set(state.done.filter((id) => ids.has(id))).size;
  const total = steps.length;
  return { doneCount, total, percent: total === 0 ? 0 : Math.round((doneCount / total) * 100) };
}

export interface RunResult {
  stepIndex: number;
  step: WorkflowStep;
  outputId: string;
  label: string;
  value: string;
}

/** Every result the person pasted, in step order — the summary shown at the end. */
export function collectResults(steps: WorkflowStep[], state: WorkflowRunState): RunResult[] {
  const results: RunResult[] = [];
  steps.forEach((step, stepIndex) => {
    for (const output of step.outputs) {
      const value = state.outputs[output.id] ?? "";
      if (value.trim()) results.push({ stepIndex, step, outputId: output.id, label: output.label, value });
    }
  });
  return results;
}

/**
 * Reads a saved run back (sessionStorage). Anything malformed is dropped, and
 * so is every id that is no longer part of the workflow (it may have been edited
 * since), so a stale save can never point at a step or output that is gone.
 */
export function sanitizeRunState(raw: unknown, steps: WorkflowStep[]): WorkflowRunState {
  const base = initialRunState();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Record<string, unknown>;
  const stepIds = new Set(steps.map((s) => s.id));
  const inputIds = new Set(steps.flatMap((s) => s.inputs.map((i) => i.id)));
  const outputIds = new Set(steps.flatMap((s) => s.outputs.map((o) => o.id)));
  const pickStrings = (source: unknown, allowed: Set<string>): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!source || typeof source !== "object") return out;
    for (const [key, val] of Object.entries(source as Record<string, unknown>)) {
      if (allowed.has(key) && typeof val === "string") out[key] = val.slice(0, MAX_RUN_VALUE_LENGTH);
    }
    return out;
  };
  return {
    current: typeof value.current === "number" ? clampIndex(value.current, steps.length) : base.current,
    done: Array.isArray(value.done) ? [...new Set(value.done.filter((id): id is string => typeof id === "string" && stepIds.has(id)))] : [],
    inputs: pickStrings(value.inputs, inputIds),
    outputs: pickStrings(value.outputs, outputIds),
  };
}
