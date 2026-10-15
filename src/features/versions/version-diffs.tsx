"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { DiffText } from "@/features/prompts/diff-text";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  diffPresetVersions,
  diffWorkflowVersions,
  type PresetFieldChange,
  type PresetVersionContent,
  type WorkflowStepFieldKey,
  type WorkflowVersionContent,
} from "@/lib/version-history";

/** The shared look of one diff section: a small heading over its content. */
function DiffBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {children}
    </div>
  );
}

function NoDifference() {
  const { t } = useTranslation();
  return <p className="text-xs text-text-muted">{t("history.noDifference")}</p>;
}

/** A plain before → after pair for short non-text values (a type, a position). */
function Change({ before, after }: { before: string; after: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-small text-text">
      <span className="rounded-[2px] bg-danger/10 px-1 text-danger line-through decoration-danger/60">{before}</span>
      <ArrowRight size={12} className="text-text-muted" aria-hidden />
      <span className="rounded-[2px] bg-success/15 px-1 text-success">{after}</span>
    </span>
  );
}

function BulletList({ children }: { children: ReactNode }) {
  return <ul className="space-y-1 text-small text-text">{children}</ul>;
}

/** Title / description of a workflow or preset: the word diff, only when the field changed. */
function TextChange({ labelKey, change }: { labelKey: TranslationKey; change: { before: string; after: string } | null }) {
  const { t } = useTranslation();
  if (!change) return null;
  return (
    <DiffBlock title={t(labelKey)}>
      <DiffText before={change.before} after={change.after} />
    </DiffBlock>
  );
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

const STEP_FIELD_LABELS: Record<WorkflowStepFieldKey, TranslationKey> = {
  title: "forms.title",
  description: "forms.shortDescription",
  instructions: "history.field.instructions",
  stepType: "history.field.stepType",
  content: "history.field.content",
  inputs: "history.field.inputs",
  outputs: "history.field.outputs",
};

const TEXT_STEP_FIELDS: ReadonlySet<WorkflowStepFieldKey> = new Set(["title", "description", "instructions"]);

/** Readable workflow diff: title/description, added/removed/reordered/changed steps, added/removed connections. Never raw JSON. */
export function WorkflowDiffView({ older, newer }: { older: WorkflowVersionContent; newer: WorkflowVersionContent }) {
  const { t } = useTranslation();
  const diff = diffWorkflowVersions(older, newer);
  if (diff.isEmpty) return <NoDifference />;
  const stepName = (title: string, position: number) => title || t("history.untitledStep") + ` (${t("history.stepPosition", { n: position })})`;

  return (
    <div className="space-y-3">
      <TextChange labelKey="forms.title" change={diff.title} />
      <TextChange labelKey="forms.shortDescription" change={diff.description} />

      {diff.added.length > 0 && (
        <DiffBlock title={t("history.stepsAdded")}>
          <BulletList>
            {diff.added.map((step) => (
              <li key={step.key} className="rounded-[2px] bg-success/15 px-1.5 py-0.5 text-success">
                {t("history.stepPosition", { n: step.position })} · {stepName(step.title, step.position)}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.removed.length > 0 && (
        <DiffBlock title={t("history.stepsRemoved")}>
          <BulletList>
            {diff.removed.map((step) => (
              <li key={step.key} className="rounded-[2px] bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/60">
                {t("history.stepPosition", { n: step.position })} · {stepName(step.title, step.position)}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.moved.length > 0 && (
        <DiffBlock title={t("history.stepsMoved")}>
          <BulletList>
            {diff.moved.map((step) => (
              <li key={step.key}>
                <span className="font-medium">{stepName(step.title, step.to)}</span> — {t("history.moved", { from: step.from, to: step.to })}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.changed.length > 0 && (
        <DiffBlock title={t("history.stepsChanged")}>
          <div className="space-y-3">
            {diff.changed.map((step) => (
              <div key={step.key} className="space-y-2 rounded-md border border-border-soft p-2.5">
                <p className="text-small font-medium text-text">{stepName(step.title, step.index)}</p>
                {step.fields.map((change) => (
                  <div key={change.field} className="space-y-1">
                    <p className="text-xs text-text-muted">{t(STEP_FIELD_LABELS[change.field])}</p>
                    {TEXT_STEP_FIELDS.has(change.field) ? (
                      <DiffText before={change.before} after={change.after} />
                    ) : change.field === "content" ? (
                      <p className="text-small text-text">
                        {!change.before ? t("history.field.contentAdded") : !change.after ? t("history.field.contentRemoved") : t("history.field.contentChanged")}
                      </p>
                    ) : change.field === "stepType" ? (
                      <Change before={stepTypeLabel(change.before, t)} after={stepTypeLabel(change.after, t)} />
                    ) : (
                      <Change before={change.before || t("history.none")} after={change.after || t("history.none")} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DiffBlock>
      )}
      {diff.connectionsAdded.length > 0 && (
        <DiffBlock title={t("history.connectionsAdded")}>
          <BulletList>
            {diff.connectionsAdded.map((c, index) => (
              <li key={index} className="rounded-[2px] bg-success/15 px-1.5 py-0.5 text-success">
                {t("history.connection", { from: c.fromTitle, output: c.outputLabel, to: c.toTitle, input: c.inputLabel })}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.connectionsRemoved.length > 0 && (
        <DiffBlock title={t("history.connectionsRemoved")}>
          <BulletList>
            {diff.connectionsRemoved.map((c, index) => (
              <li key={index} className="rounded-[2px] bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/60">
                {t("history.connection", { from: c.fromTitle, output: c.outputLabel, to: c.toTitle, input: c.inputLabel })}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
    </div>
  );
}

function stepTypeLabel(type: string, t: (key: TranslationKey) => string): string {
  return type === "prompt" || type === "request" ? t(`history.stepType.${type}`) : type;
}

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

const FIELD_TYPE_KEYS = ["single_select", "multi_select", "dropdown", "text", "number", "slider", "toggle", "color"] as const;

function fieldTypeLabel(type: string, t: (key: TranslationKey) => string): string {
  return (FIELD_TYPE_KEYS as readonly string[]).includes(type) ? t(`history.fieldType.${type}` as TranslationKey) : type;
}

function PresetFieldChangeView({ change }: { change: PresetFieldChange }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 rounded-md border border-border-soft p-2.5">
      <p className="text-small font-medium text-text">{change.name}</p>
      {change.nameChange && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">{t("history.fieldRenamed")}</p>
          <DiffText before={change.nameChange.before} after={change.nameChange.after} />
        </div>
      )}
      {change.typeChange && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">{t("history.fieldTypeChanged")}</p>
          <Change before={fieldTypeLabel(change.typeChange.before, t)} after={fieldTypeLabel(change.typeChange.after, t)} />
        </div>
      )}
      {(change.kindChanged || change.configChanged) && <p className="text-small text-text">{t("history.fieldSettingsChanged")}</p>}
      {change.valueChange && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">{t("history.valueChanged")}</p>
          <Change before={change.valueChange.before || t("history.none")} after={change.valueChange.after || t("history.none")} />
        </div>
      )}
      {change.optionsAdded.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">{t("history.optionsAdded")}</p>
          <BulletList>
            {change.optionsAdded.map((option) => (
              <li key={option.key} className="rounded-[2px] bg-success/15 px-1.5 py-0.5 text-success">
                {option.label}
              </li>
            ))}
          </BulletList>
        </div>
      )}
      {change.optionsRemoved.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-text-muted">{t("history.optionsRemoved")}</p>
          <BulletList>
            {change.optionsRemoved.map((option) => (
              <li key={option.key} className="rounded-[2px] bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/60">
                {option.label}
              </li>
            ))}
          </BulletList>
        </div>
      )}
      {change.optionsChanged.map((option) => (
        <div key={option.key} className="space-y-1">
          {option.labelChange && (
            <>
              <p className="text-xs text-text-muted">{t("history.optionLabelChanged")}</p>
              <DiffText before={option.labelChange.before} after={option.labelChange.after} />
            </>
          )}
          {option.valueChange && (
            <>
              <p className="text-xs text-text-muted">{t("history.optionValueChanged")}</p>
              <DiffText before={option.valueChange.before} after={option.valueChange.after} />
            </>
          )}
          {option.fragmentChanged && <p className="text-small text-text">{t("history.optionTextChanged", { label: option.label })}</p>}
        </div>
      ))}
      {change.optionsReordered && <p className="text-small text-text">{t("history.optionsReordered")}</p>}
    </div>
  );
}

/** Readable preset diff: title/description, added/removed/renamed/retyped/reordered fields, and option changes. Never raw JSON. */
export function PresetDiffView({ older, newer }: { older: PresetVersionContent; newer: PresetVersionContent }) {
  const { t } = useTranslation();
  const diff = diffPresetVersions(older, newer);
  if (diff.isEmpty) return <NoDifference />;

  return (
    <div className="space-y-3">
      <TextChange labelKey="forms.title" change={diff.title} />
      <TextChange labelKey="forms.shortDescription" change={diff.description} />
      {diff.fieldsAdded.length > 0 && (
        <DiffBlock title={t("history.fieldsAdded")}>
          <BulletList>
            {diff.fieldsAdded.map((field) => (
              <li key={field.key} className="rounded-[2px] bg-success/15 px-1.5 py-0.5 text-success">
                {field.name} · {fieldTypeLabel(field.type, t)}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.fieldsRemoved.length > 0 && (
        <DiffBlock title={t("history.fieldsRemoved")}>
          <BulletList>
            {diff.fieldsRemoved.map((field) => (
              <li key={field.key} className="rounded-[2px] bg-danger/10 px-1.5 py-0.5 text-danger line-through decoration-danger/60">
                {field.name} · {fieldTypeLabel(field.type, t)}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.fieldsMoved.length > 0 && (
        <DiffBlock title={t("history.fieldsMoved")}>
          <BulletList>
            {diff.fieldsMoved.map((field) => (
              <li key={field.key}>
                <span className="font-medium">{field.name}</span> — {t("history.moved", { from: field.from, to: field.to })}
              </li>
            ))}
          </BulletList>
        </DiffBlock>
      )}
      {diff.fieldsChanged.length > 0 && (
        <DiffBlock title={t("history.fieldsChanged")}>
          <div className="space-y-3">
            {diff.fieldsChanged.map((change) => (
              <PresetFieldChangeView key={change.key} change={change} />
            ))}
          </div>
        </DiffBlock>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prompt / request text fields
// ---------------------------------------------------------------------------

/** The changed text fields as word diffs; `labelKeyFor` maps a field key to its existing label. */
export function TextFieldsDiffView<K extends string>({
  diffs,
  labelKeyFor,
}: {
  diffs: { key: K; before: string; after: string }[];
  labelKeyFor: (key: K) => TranslationKey;
}) {
  const { t } = useTranslation();
  if (diffs.length === 0) return <NoDifference />;
  return (
    <div className="space-y-3">
      {diffs.map((diff) => (
        <DiffBlock key={diff.key} title={t(labelKeyFor(diff.key))}>
          <DiffText before={diff.before} after={diff.after} />
        </DiffBlock>
      ))}
    </div>
  );
}
