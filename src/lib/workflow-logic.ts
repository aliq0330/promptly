/**
 * Pure workflow-editor logic: step operations, link sanitising, validation.
 * No React, no network — unit-testable. A workflow never runs anything; it
 * only organises existing content and describes how outputs feed inputs.
 */
import type { WorkflowInput, WorkflowIO, WorkflowStep, WorkflowStepType } from "@/types";

export const MAX_STEPS = 30;

export function newId(): string {
  return crypto.randomUUID();
}

export function newStep(stepType: WorkflowStepType): WorkflowStep {
  return {
    id: newId(),
    title: "",
    description: "",
    instructions: "",
    stepType,
    content: null,
    contentMissing: false,
    inputs: [],
    outputs: [],
  };
}

/** Copy of a step with fresh ids; its inputs are unlinked (a copy must be wired on purpose). */
export function duplicateStep(step: WorkflowStep, copyLabel: string): WorkflowStep {
  return {
    ...step,
    id: newId(),
    title: step.title ? `${step.title} ${copyLabel}` : step.title,
    inputs: step.inputs.map((input) => ({ ...input, id: newId(), source: null })),
    outputs: step.outputs.map((output) => ({ ...output, id: newId() })),
  };
}

export function moveStep<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * A link must come from an EARLIER step's existing output. Drops the rest
 * (after a reorder / delete / output removal) and reports how many.
 */
export function sanitizeLinks(steps: WorkflowStep[]): { steps: WorkflowStep[]; removed: number } {
  let removed = 0;
  const cleaned = steps.map((step, index) => ({
    ...step,
    inputs: step.inputs.map((input): WorkflowInput => {
      if (!input.source) return input;
      const fromIndex = steps.findIndex((s) => s.id === input.source!.stepId);
      const valid =
        fromIndex !== -1 &&
        fromIndex < index &&
        steps[fromIndex].outputs.some((o) => o.id === input.source!.outputId);
      if (valid) return input;
      removed += 1;
      return { ...input, source: null };
    }),
  }));
  return { steps: cleaned, removed };
}

/** Rows for `workflow_connections`, derived from the linked inputs (single source of truth). */
export function connectionsFromSteps(steps: WorkflowStep[]) {
  const rows: { from_step_id: string; to_step_id: string; output_key: string; input_key: string }[] = [];
  for (const step of steps) {
    for (const input of step.inputs) {
      if (input.source) {
        rows.push({ from_step_id: input.source.stepId, to_step_id: step.id, output_key: input.source.outputId, input_key: input.id });
      }
    }
  }
  return rows;
}

/** Earlier steps' outputs a given step may take as input, in order. */
export function availableSources(steps: WorkflowStep[], stepId: string): { step: WorkflowStep; stepIndex: number; output: WorkflowIO }[] {
  const index = steps.findIndex((s) => s.id === stepId);
  const out: { step: WorkflowStep; stepIndex: number; output: WorkflowIO }[] = [];
  for (let i = 0; i < index; i += 1) {
    for (const output of steps[i].outputs) out.push({ step: steps[i], stepIndex: i, output });
  }
  return out;
}

/** Links feeding INTO this step, resolved to readable pieces. */
export function incomingLinks(steps: WorkflowStep[], stepId: string) {
  const step = steps.find((s) => s.id === stepId);
  if (!step) return [];
  const links: { input: WorkflowInput; fromIndex: number; fromStep: WorkflowStep; output: WorkflowIO }[] = [];
  for (const input of step.inputs) {
    if (!input.source) continue;
    const fromIndex = steps.findIndex((s) => s.id === input.source!.stepId);
    if (fromIndex === -1) continue;
    const output = steps[fromIndex].outputs.find((o) => o.id === input.source!.outputId);
    if (output) links.push({ input, fromIndex, fromStep: steps[fromIndex], output });
  }
  return links;
}

/** How many links leave this step towards later ones. */
export function outgoingCount(steps: WorkflowStep[], stepId: string): number {
  return steps.reduce((sum, s) => sum + s.inputs.filter((i) => i.source?.stepId === stepId).length, 0);
}

export type WorkflowIssueCode = "titleRequired" | "noSteps" | "stepNoTitle" | "stepNoContent" | "stepContentMissing" | "unpublishedGenerator";
export interface WorkflowIssue {
  level: "error" | "warning";
  code: WorkflowIssueCode;
  stepId?: string;
  stepIndex?: number;
}

/**
 * Drafts only need a title; publishing needs a title, at least one step and
 * every step titled and pointing at real content.
 */
export function validateWorkflow(meta: { title: string }, steps: WorkflowStep[], forPublish: boolean): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  if (!meta.title.trim()) issues.push({ level: "error", code: "titleRequired" });
  if (!forPublish) return issues;
  if (steps.length === 0) issues.push({ level: "error", code: "noSteps" });
  steps.forEach((step, stepIndex) => {
    if (!step.title.trim()) issues.push({ level: "error", code: "stepNoTitle", stepId: step.id, stepIndex });
    if (step.contentMissing) issues.push({ level: "error", code: "stepContentMissing", stepId: step.id, stepIndex });
    else if (!step.content) issues.push({ level: "error", code: "stepNoContent", stepId: step.id, stepIndex });
    else if (step.content.type === "generator" && !step.content.published) {
      issues.push({ level: "warning", code: "unpublishedGenerator", stepId: step.id, stepIndex });
    }
  });
  return issues;
}
