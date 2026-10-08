"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowDownToLine, ArrowUp, Blocks, ExternalLink, Plus, SquareTerminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { availableSources, incomingLinks, moveStep, newId, sanitizeLinks } from "@/lib/workflow-logic";
import type { StudioSnapshot } from "@/lib/studio-diff";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";

type Update = (fn: (draft: StudioSnapshot) => StudioSnapshot, key?: string | null) => void;

const STEP_ICON = { prompt: SquareTerminal, generator: Blocks, request: SquareTerminal } as const;

/**
 * The existing sequential workflow, as an editable vertical chain in the
 * Studio draft (same data model, same link rules — `workflow-logic.ts`).
 * Selecting a step shows its detail; there is no canvas, branching or conditions.
 */
export function WorkflowPane({
  draft,
  edit,
  onAddStep,
  onOpenStepContent,
}: {
  draft: StudioSnapshot;
  edit: Update;
  onAddStep: () => void;
  onOpenStepContent: (step: WorkflowStep) => void;
}) {
  const { t } = useTranslation();
  const workflow = draft.workflow;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!workflow) return null;
  const steps = workflow.steps;
  const selected = steps.find((s) => s.id === selectedId) ?? null;

  function setSteps(next: WorkflowStep[], key: string | null = null) {
    edit((d) => (d.workflow ? { ...d, workflow: { ...d.workflow, steps: sanitizeLinks(next).steps } } : d), key);
  }
  function patchStep(id: string, patch: Partial<WorkflowStep>, key: string | null = null) {
    setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)), key);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="studio-workflow-title" className="mb-1.5 block text-small font-medium text-text">
          {t("studio.workflowTitle")}
        </label>
        <input
          id="studio-workflow-title"
          value={workflow.title}
          onChange={(event) => edit((d) => (d.workflow ? { ...d, workflow: { ...d.workflow, title: event.target.value } } : d), "workflow-title")}
          className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-body text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong"
        />
      </div>

      <ol className="space-y-0">
        {steps.map((step, index) => {
          const Icon = STEP_ICON[step.stepType];
          const links = incomingLinks(steps, step.id);
          const isSelected = selectedId === step.id;
          const previous = steps[index - 1];
          return (
            <li key={step.id}>
              {previous && (
                <div className="flex items-center gap-2 py-1.5 pl-5 text-caption text-text-muted" aria-hidden>
                  <ArrowDown className="h-3.5 w-3.5" />
                  {links.length > 0 ? links.map((l) => l.output.label || "·").join(", ") : t("studio.noLink")}
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedId(isSelected ? null : step.id)}
                aria-expanded={isSelected}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft",
                )}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-soft text-small font-semibold text-primary">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-text">{step.title || t("studio.untitledStep")}</span>
                  <span className="flex items-center gap-1.5 truncate text-caption text-text-secondary">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {step.content?.title ?? t("studio.noContent")}
                  </span>
                </span>
              </button>

              {isSelected && selected && (
                <div className="animate-fade-in space-y-4 border-l-2 border-primary/40 py-3 pl-3 sm:pl-4">
                  <div>
                    <label htmlFor="studio-step-title" className="mb-1.5 block text-small font-medium text-text">
                      {t("studio.stepTitle")}
                    </label>
                    <input
                      id="studio-step-title"
                      value={selected.title}
                      onChange={(event) => patchStep(selected.id, { title: event.target.value }, `step-title-${selected.id}`)}
                      className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-body text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong"
                    />
                  </div>
                  <div>
                    <label htmlFor="studio-step-instructions" className="mb-1.5 block text-small font-medium text-text">
                      {t("studio.stepInstructions")}
                    </label>
                    <textarea
                      id="studio-step-instructions"
                      value={selected.instructions}
                      onChange={(event) => patchStep(selected.id, { instructions: event.target.value }, `step-instr-${selected.id}`)}
                      rows={3}
                      className="w-full min-w-0 resize-y rounded-lg border border-border bg-background p-3 text-small text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong"
                    />
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-small font-medium text-text">{t("studio.stepInputs")}</legend>
                    {selected.inputs.length === 0 && <p className="text-caption text-text-muted">{t("studio.noInputs")}</p>}
                    {selected.inputs.map((input) => {
                      const options = availableSources(steps, selected.id);
                      const value = input.source ? `${input.source.stepId}:${input.source.outputId}` : "";
                      return (
                        <div key={input.id} className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
                          <span className="shrink-0 truncate text-small text-text-secondary sm:w-32">{input.label || "·"}</span>
                          <select
                            value={value}
                            aria-label={t("studio.inputSource", { name: input.label || "·" })}
                            onChange={(event) => {
                              const [stepId, outputId] = event.target.value.split(":");
                              patchStep(selected.id, {
                                inputs: selected.inputs.map((i) => (i.id === input.id ? { ...i, source: stepId ? { stepId, outputId } : null } : i)),
                              });
                            }}
                            className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-small text-text focus:border-primary"
                          >
                            <option value="">{t("studio.ownInput")}</option>
                            {options.map(({ step: from, stepIndex, output }) => (
                              <option key={`${from.id}:${output.id}`} value={`${from.id}:${output.id}`}>
                                {`#${stepIndex + 1} ${from.title || t("studio.untitledStep")} · ${output.label || "·"}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patchStep(selected.id, { inputs: [...selected.inputs, { id: newId(), label: t("studio.defaultInput"), source: null }] })}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {t("studio.addInput")}
                    </Button>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-small font-medium text-text">{t("studio.stepOutputs")}</legend>
                    {selected.outputs.map((output) => (
                      <input
                        key={output.id}
                        value={output.label}
                        aria-label={t("studio.stepOutputs")}
                        onChange={(event) =>
                          patchStep(selected.id, { outputs: selected.outputs.map((o) => (o.id === output.id ? { ...o, label: event.target.value } : o)) }, `out-${output.id}`)
                        }
                        className="h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-small text-text focus:border-primary/60 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong"
                      />
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patchStep(selected.id, { outputs: [...selected.outputs, { id: newId(), label: t("studio.defaultOutput") }] })}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      {t("studio.addOutput")}
                    </Button>
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-2">
                    {selected.content && !selected.contentMissing && (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenStepContent(selected)}>
                          <ArrowDownToLine className="h-4 w-4" aria-hidden />
                          {t("studio.openStepInStudio")}
                        </Button>
                        <Link href={selected.content.href} className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-small font-medium text-primary hover:underline">
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          {t("studio.openContent")}
                        </Link>
                      </>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={t("studio.moveUp")}
                        disabled={index === 0}
                        onClick={() => setSteps(moveStep(steps, index, index - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t("studio.moveDown")}
                        disabled={index === steps.length - 1}
                        onClick={() => setSteps(moveStep(steps, index, index + 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={t("studio.removeStep")}
                        onClick={() => {
                          setSelectedId(null);
                          setSteps(steps.filter((s) => s.id !== selected.id));
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {steps.length === 0 && <p className="rounded-md bg-surface-soft p-4 text-small text-text-secondary">{t("studio.noSteps")}</p>}
      <Button type="button" variant="outline" onClick={onAddStep} disabled={steps.length >= 30} className="h-11 w-full">
        <Plus className="h-4 w-4" aria-hidden />
        {t("studio.addStep")}
      </Button>
    </div>
  );
}
