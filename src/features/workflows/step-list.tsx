"use client";

import { useState } from "react";
import { ArrowDown, ChevronDown, ChevronUp, GripVertical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";
import { STEP_TYPE_META, stepSubtitle } from "./step-meta";

/**
 * Vertical timeline of steps: numbered, selectable, drag-and-drop reorderable
 * (native HTML5 DnD; up/down buttons are the touch/keyboard alternative), with
 * a connector between steps that names the outputs the next step takes.
 */
export function StepList({
  steps,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
}: {
  steps: WorkflowStep[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const { t, language } = useTranslation();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {steps.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-soft p-5 text-center">
          <p className="text-sm font-medium text-text">{t("workflow.noStepsTitle")}</p>
          <p className="mt-1 text-caption text-text-muted">{t("workflow.noStepsBody")}</p>
        </div>
      ) : (
        <ol className="space-y-0">
          {steps.map((step, index) => {
            const next = steps[index + 1];
            const carried = next ? next.inputs.filter((i) => i.source?.stepId === step.id) : [];
            const meta = STEP_TYPE_META[step.stepType];
            const Icon = meta.icon;
            const selected = step.id === selectedId;
            const subtitle = stepSubtitle(step, language);
            const incoming = step.inputs.filter((i) => i.source).length;
            return (
              <li key={step.id}>
                <div
                  draggable
                  onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", step.id);
                  }}
                  onDragOver={(event) => {
                    if (dragIndex === null) return;
                    event.preventDefault();
                    setOverIndex(index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={cn(
                    "group flex items-start gap-2 rounded-lg border bg-surface p-2.5 transition-[border-color,box-shadow,opacity] duration-200 ease-soft",
                    selected ? "border-primary shadow-card ring-1 ring-primary/30" : "border-border-soft hover:border-border-strong",
                    dragIndex === index && "opacity-40",
                    overIndex === index && dragIndex !== index && "border-primary border-dashed bg-primary-soft",
                  )}
                >
                  <span
                    aria-hidden
                    title={t("workflow.dragStep")}
                    className="mt-1 hidden shrink-0 cursor-grab text-text-muted active:cursor-grabbing sm:block"
                  >
                    <GripVertical size={16} />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelect(step.id)}
                    aria-current={selected ? "step" : undefined}
                    className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                        selected ? "bg-primary text-primary-foreground" : "bg-primary-soft text-primary",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-medium", step.title ? "text-text" : "text-text-muted")}>
                        {step.title || t("workflow.untitledStep")}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 text-caption text-text-muted">
                        <Icon size={12} className="shrink-0" />
                        <span className="truncate">{[t(meta.labelKey), subtitle].filter(Boolean).join(" · ")}</span>
                      </span>
                      {incoming > 0 && (
                        <span className="mt-0.5 block truncate text-caption text-primary">
                          {t("workflow.inputCount", { count: String(incoming) })}
                        </span>
                      )}
                    </span>
                  </button>
                  {selected && (
                    <span className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label={t("workflow.moveUp")}
                        disabled={index === 0}
                        onClick={() => onReorder(index, index - 1)}
                        className="rounded p-1 text-text-muted hover:bg-surface-soft hover:text-text disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflow.moveDown")}
                        disabled={index === steps.length - 1}
                        onClick={() => onReorder(index, index + 1)}
                        className="rounded p-1 text-text-muted hover:bg-surface-soft hover:text-text disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </span>
                  )}
                </div>
                {next && (
                  <div className="flex items-center gap-2 py-1 pl-[26px]" aria-hidden>
                    <span className="flex flex-col items-center text-border-strong">
                      <span className="h-2 w-px bg-border-strong" />
                      <ArrowDown size={13} />
                    </span>
                    {carried.length > 0 && (
                      <span className="flex min-w-0 flex-wrap gap-1">
                        {carried.map((input) => {
                          const output = step.outputs.find((o) => o.id === input.source!.outputId);
                          return (
                            <span key={input.id} className="max-w-[10rem] truncate rounded-full bg-primary-soft px-2 py-0.5 text-caption text-primary">
                              {output?.label}
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Button type="button" variant="outline" className="w-full" onClick={onAdd}>
        <Plus size={16} />
        {t("workflow.addStep")}
      </Button>
    </div>
  );
}
