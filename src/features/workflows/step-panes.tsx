"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronUp, Copy, ExternalLink, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { availableSources, newId } from "@/lib/workflow-logic";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";
import { MEDIA_ICON, STEP_TYPE_META, stepSubtitle } from "./step-meta";

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60";

interface PaneProps {
  step: WorkflowStep;
  steps: WorkflowStep[];
  index: number;
  onChange: (patch: Partial<WorkflowStep>) => void;
}

export function GeneralPane({ step, onChange }: Pick<PaneProps, "step" | "onChange">) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`step-title-${step.id}`} className="mb-1.5 block text-sm font-medium text-text">
          {t("workflow.stepTitleLabel")} <span className="text-danger">*</span>
        </label>
        <input
          id={`step-title-${step.id}`}
          value={step.title}
          maxLength={120}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder={t("workflow.stepTitlePlaceholder")}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`step-desc-${step.id}`} className="mb-1.5 block text-sm font-medium text-text">
          {t("workflow.stepDescriptionLabel")}
        </label>
        <textarea
          id={`step-desc-${step.id}`}
          rows={3}
          value={step.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder={t("workflow.stepDescriptionPlaceholder")}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
        />
      </div>
      <div>
        <label htmlFor={`step-instr-${step.id}`} className="mb-1.5 block text-sm font-medium text-text">
          {t("workflow.instructionsLabel")}
        </label>
        <textarea
          id={`step-instr-${step.id}`}
          rows={3}
          value={step.instructions}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder={t("workflow.instructionsPlaceholder")}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
        />
      </div>
    </div>
  );
}

/** The linked prompt / generator / request as a compact card, with view / change / create-new actions. */
export function ContentPane({
  step,
  onPick,
}: {
  step: WorkflowStep;
  /** Opens the content modal on the given mode. */
  onPick: (mode: "existing" | "scratch") => void;
}) {
  const { t, language } = useTranslation();
  const meta = STEP_TYPE_META[step.stepType];
  const Icon = meta.icon;
  const c = step.content;
  const MediaIcon = c?.contentType ? MEDIA_ICON[c.contentType] : null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text">{t("workflow.contentUsed")}</p>
      {c ? (
        <div className="flex items-start gap-3 rounded-lg border border-border-soft bg-surface-soft p-3">
          {c.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- real (possibly data-URL) thumbnail
            <img src={c.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon size={20} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-caption font-medium text-text-muted">
              <Icon size={12} />
              {t(meta.labelKey)}
            </p>
            <p className="truncate text-sm font-semibold text-text">{c.title}</p>
            <p className="flex items-center gap-1 truncate text-caption text-text-muted">
              {MediaIcon && <MediaIcon size={12} className="shrink-0" />}
              <span className="truncate">{[stepSubtitle(step, language), `@${c.authorUsername}`].filter(Boolean).join(" · ")}</span>
            </p>
            {!c.published && <p className="mt-1 text-caption text-warning">{t("workflow.unpublishedGenerator")}</p>}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-soft p-4 text-sm text-text-muted">
          {step.contentMissing ? t("workflow.contentMissing") : t("workflow.noContent")}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {c && (
          <Link href={c.href} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-label font-medium text-text hover:bg-surface-soft">
            <ExternalLink size={14} />
            {t("workflow.viewContent")}
          </Link>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => onPick("existing")}>
          {c ? t("workflow.changeContent") : t("workflow.useExisting")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onPick("scratch")}>
          {t("workflow.createNew")}
        </Button>
      </div>
      {step.stepType === "request" && <p className="text-caption text-danger">{t("workflow.requestStepLegacy")}</p>}
      <p className="text-caption text-text-muted">{t("workflow.contentIsReference")}</p>
    </div>
  );
}

/** What the step takes in and produces; each input can be fed by an earlier step's output. */
export function IOPane({ step, steps, index, onChange }: PaneProps) {
  const { t } = useTranslation();
  const sources = availableSources(steps, step.id);

  function setInput(id: string, patch: { label?: string; source?: string }) {
    onChange({
      inputs: step.inputs.map((input) => {
        if (input.id !== id) return input;
        const next = { ...input };
        if (patch.label !== undefined) next.label = patch.label;
        if (patch.source !== undefined) {
          if (patch.source === "") next.source = null;
          else {
            const [stepId, outputId] = patch.source.split("::");
            next.source = { stepId, outputId };
            // A freshly linked, still-unnamed input takes the output's name.
            if (!next.label) next.label = steps.find((s) => s.id === stepId)?.outputs.find((o) => o.id === outputId)?.label ?? "";
          }
        }
        return next;
      }),
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">{t("workflow.inputsHeading")}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ inputs: [...step.inputs, { id: newId(), label: "", source: null }] })}>
            <Plus size={14} />
            {t("workflow.addInput")}
          </Button>
        </div>
        {step.inputs.length === 0 && <p className="text-caption text-text-muted">{t("workflow.noInputs")}</p>}
        {index === 0 && step.inputs.length > 0 && <p className="text-caption text-text-muted">{t("workflow.firstStepNoSources")}</p>}
        {step.inputs.map((input) => (
          <div key={input.id} className={cn("space-y-1.5 rounded-lg border p-2.5", input.source ? "border-primary/40 bg-primary-soft/40" : "border-border-soft")}>
            <div className="flex items-center gap-2">
              <input
                value={input.label}
                maxLength={80}
                onChange={(event) => setInput(input.id, { label: event.target.value })}
                placeholder={t("workflow.inputPlaceholder")}
                aria-label={t("workflow.inputLabel")}
                className={inputClass}
              />
              <button
                type="button"
                aria-label={t("workflow.removeItem")}
                onClick={() => onChange({ inputs: step.inputs.filter((i) => i.id !== input.id) })}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger"
              >
                <X size={16} />
              </button>
            </div>
            {index > 0 && (
              <select
                aria-label={t("workflow.useFromPrevious")}
                value={input.source ? `${input.source.stepId}::${input.source.outputId}` : ""}
                onChange={(event) => setInput(input.id, { source: event.target.value })}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm text-text"
              >
                <option value="">{sources.length ? t("workflow.noLink") : t("workflow.noSourcesBefore")}</option>
                {sources.map(({ step: from, stepIndex, output }) => (
                  <option key={`${from.id}::${output.id}`} value={`${from.id}::${output.id}`}>
                    {t("workflow.sourceOption", { n: String(stepIndex + 1), label: output.label || t("workflow.outputLabel") })}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text">{t("workflow.outputsHeading")}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ outputs: [...step.outputs, { id: newId(), label: "" }] })}>
            <Plus size={14} />
            {t("workflow.addOutput")}
          </Button>
        </div>
        {step.outputs.length === 0 && <p className="text-caption text-text-muted">{t("workflow.noOutputs")}</p>}
        {step.outputs.map((output) => (
          <div key={output.id} className="flex items-center gap-2">
            <input
              value={output.label}
              maxLength={80}
              onChange={(event) => onChange({ outputs: step.outputs.map((o) => (o.id === output.id ? { ...o, label: event.target.value } : o)) })}
              placeholder={t("workflow.outputPlaceholder")}
              aria-label={t("workflow.outputLabel")}
              className={inputClass}
            />
            <button
              type="button"
              aria-label={t("workflow.removeItem")}
              onClick={() => onChange({ outputs: step.outputs.filter((o) => o.id !== output.id) })}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-danger"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Duplicate / delete / move — the keyboard & touch route to reordering. */
export function SettingsPane({
  index,
  count,
  onDuplicate,
  onDelete,
  onMove,
}: {
  index: number;
  count: number;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text">{t("workflow.settingsHeading")}</h3>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
          <ChevronUp size={14} />
          {t("workflow.moveUp")}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ChevronDown size={14} />
          {t("workflow.moveDown")}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDuplicate}>
          <Copy size={14} />
          {t("workflow.duplicate")}
        </Button>
        <Button
          type="button"
          variant={confirm ? "danger" : "outline"}
          size="sm"
          onClick={() => {
            if (confirm) {
              setConfirm(false);
              onDelete();
            } else setConfirm(true);
          }}
          onBlur={() => setConfirm(false)}
        >
          <Trash2 size={14} />
          {confirm ? t("workflow.confirmDelete") : t("workflow.delete")}
        </Button>
      </div>
    </div>
  );
}

/** "What does this step take, do and give?" at a glance. */
export function StepPreview({ step, steps, index }: Omit<PaneProps, "onChange">) {
  const { t, language } = useTranslation();
  const meta = STEP_TYPE_META[step.stepType];
  const Icon = meta.icon;
  const isLast = index === steps.length - 1;
  return (
    <div className="space-y-2.5 rounded-lg border border-border-soft bg-surface-soft p-3">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("workflow.previewHeading")}</p>
      <p className="flex items-center gap-2 text-sm font-semibold text-text">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-caption text-primary-foreground">{index + 1}</span>
        <span className="truncate">{step.title || t("workflow.untitledStep")}</span>
      </p>
      <p className="flex items-center gap-1.5 text-caption text-text-secondary">
        <Icon size={12} />
        {t(meta.labelKey)}
        {step.content && <span className="truncate text-text-muted">· {step.content.title}</span>}
      </p>
      {stepSubtitle(step, language) && <p className="text-caption text-text-muted">{stepSubtitle(step, language)}</p>}
      <div className="grid grid-cols-2 gap-3 text-caption">
        <div className="min-w-0">
          <p className="mb-1 font-semibold text-text-muted">{t("workflow.inputLabel").toUpperCase()}</p>
          {step.inputs.length === 0 ? (
            <p className="text-text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {step.inputs.map((input) => (
                <li key={input.id} className="truncate text-text">
                  • {input.label || "…"}
                  {input.source && <ArrowRight size={10} className="ml-1 inline text-primary" aria-hidden />}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <p className="mb-1 font-semibold text-text-muted">{t("workflow.outputLabel").toUpperCase()}</p>
          {step.outputs.length === 0 ? (
            <p className="text-text-muted">—</p>
          ) : (
            <ul className="space-y-0.5">
              {step.outputs.map((output) => (
                <li key={output.id} className="truncate text-text">
                  • {output.label || "…"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {!isLast && <p className="text-caption text-text-muted">{t("workflow.previewNextHint")}</p>}
    </div>
  );
}
