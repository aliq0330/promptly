"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { PresetFieldList } from "@/features/presets/preset-field-list";
import { PresetLists, type PresetBundle } from "@/features/presets/preset-picker";
import { SelectionSummary } from "@/features/presets/selection-summary";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFields, catalogFieldsForType, fieldIdsFor } from "@/lib/prompt-extra-settings";
import {
  composePrompt,
  countSelected,
  mergeFields,
  resolveTypedOption,
  sanitizeSelection,
  withCustomOptions,
  type CustomOptions,
  type PresetField,
  type PresetSelection,
} from "@/lib/preset-fields";
import { cn } from "@/lib/utils";

/**
 * The prompt form's "Ek Ayar Önerileri" row + applied chips. The panel only
 * mounts while open and has three tabs — Alanlar (the platform's fields, the
 * ones recommended for the form's type → category → subcategory first),
 * Kaydettiklerim (presets saved with the ordinary save) and Topluluk
 * (Paylaştıklarım / Diğerleri). Nothing can be CREATED here: presets and their
 * custom fields are made on the preset page. `extraFields` holds the
 * preset-owned fields an applied preset brought along, so they survive closing
 * the panel.
 */
export function ExtraSettingsSection({
  contentType,
  value,
  onChange,
  extraFields,
  onExtraFieldsChange,
  customOptions,
  onCustomOptionsChange,
  englishFragments,
  onEnglishFragmentsChange,
  promptText,
  hasTool,
  category = null,
  subcategory = null,
  tools = [],
}: {
  contentType: ContentTypeId;
  value: PresetSelection;
  onChange: (next: PresetSelection) => void;
  /** Preset-owned fields an applied preset brought along (not part of the platform catalog). */
  extraFields: PresetField[];
  onExtraFieldsChange: (next: PresetField[]) => void;
  /** Options typed with "+ Seçenek oluştur" — temporary, kept only for this form. */
  customOptions: CustomOptions;
  onCustomOptionsChange: (next: CustomOptions) => void;
  englishFragments: boolean;
  onEnglishFragmentsChange: (value: boolean) => void;
  promptText: string;
  hasTool: boolean;
  category?: string | null;
  subcategory?: string | null;
  tools?: string[];
}) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const recommended = useMemo(() => catalogFields(fieldIdsFor(contentType, category, subcategory, tools)), [contentType, category, subcategory, tools]);
  const catalog = useMemo(() => mergeFields(recommended, catalogFieldsForType(contentType)), [recommended, contentType]);
  const allFields = useMemo(() => withCustomOptions(mergeFields(catalog, extraFields), customOptions), [catalog, extraFields, customOptions]);
  const applied = useMemo(() => sanitizeSelection(value, allFields), [value, allFields]);
  const count = countSelected(applied, allFields);
  const fragmentLanguage = englishFragments ? "en" : language;
  const composed = composePrompt(promptText, applied, allFields, fragmentLanguage);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex w-full items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface-soft px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary-soft"
      >
        <Sparkles size={18} className="shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-label font-semibold text-text">{t("extra.title")}</span>
          <span className="block text-caption text-text-secondary">{t("extra.hint")}</span>
        </span>
        {count > 0 && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-caption font-semibold text-primary-foreground">{t("extra.count", { count })}</span>}
        <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden />
      </button>

      {count > 0 && (
        <div className="space-y-2">
          <SelectionSummary fields={allFields} selection={applied} onChange={onChange} />
          <div className="rounded-md border border-border-soft bg-surface-soft p-3">
            <p className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.savedPrompt")}</p>
            <p data-extra-composed className="prompt-text whitespace-pre-wrap break-words text-small text-text">
              {composed || t("extra.emptyBase")}
            </p>
            <p className="mt-1.5 text-caption text-text-muted">{t("extra.originalKept")}</p>
          </div>
        </div>
      )}

      {open && (
        <ExtraSettingsPanel
          contentType={contentType}
          category={category}
          recommended={recommended}
          catalog={catalog}
          initialExtra={extraFields}
          initialCustom={customOptions}
          initial={applied}
          promptText={promptText}
          hasTool={hasTool}
          englishFragments={englishFragments}
          onEnglishFragmentsChange={onEnglishFragmentsChange}
          onClose={() => setOpen(false)}
          onApply={(nextSelection, nextExtra, nextCustom) => {
            onExtraFieldsChange(nextExtra);
            onCustomOptionsChange(nextCustom);
            onChange(nextSelection);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

type PanelTab = "fields" | "saved" | "community";

function ExtraSettingsPanel({
  contentType,
  category,
  recommended,
  catalog,
  initialExtra,
  initialCustom,
  initial,
  promptText,
  hasTool,
  englishFragments,
  onEnglishFragmentsChange,
  onClose,
  onApply,
}: {
  contentType: ContentTypeId;
  category: string | null;
  recommended: PresetField[];
  catalog: PresetField[];
  initialExtra: PresetField[];
  initialCustom: CustomOptions;
  initial: PresetSelection;
  promptText: string;
  hasTool: boolean;
  englishFragments: boolean;
  onEnglishFragmentsChange: (value: boolean) => void;
  onClose: () => void;
  onApply: (selection: PresetSelection, extraFields: PresetField[], customOptions: CustomOptions) => void;
}) {
  const { t, language } = useTranslation();
  const [draft, setDraft] = useState<PresetSelection>(initial);
  const [extra, setExtra] = useState<PresetField[]>(initialExtra);
  const [custom, setCustom] = useState<CustomOptions>(initialCustom);
  const [tab, setTab] = useState<PanelTab>("fields");
  const [showOthers, setShowOthers] = useState(false);
  const fields = useMemo(() => withCustomOptions(mergeFields(catalog, extra), custom), [catalog, extra, custom]);
  const fragmentLanguage = englishFragments ? "en" : language;
  const clean = useMemo(() => sanitizeSelection(draft, fields), [draft, fields]);
  const composed = composePrompt(promptText, clean, fields, fragmentLanguage);
  const selectedCount = countSelected(clean, fields);
  const catalogIds = useMemo(() => new Set(catalog.map((f) => f.id)), [catalog]);
  const recommendedIds = useMemo(() => new Set(recommended.map((f) => f.id)), [recommended]);
  const topFields = useMemo(() => withCustomOptions(mergeFields(recommended, extra), custom), [recommended, extra, custom]);
  const otherFields = useMemo(() => withCustomOptions(catalog.filter((f) => !recommendedIds.has(f.id)), custom), [catalog, recommendedIds, custom]);

  /** "+ Seçenek oluştur": remembers the typed option for this form and returns the value to select. */
  function createOption(field: PresetField, text: string): string | undefined {
    const resolved = resolveTypedOption(field, text);
    if (!resolved) return undefined;
    if (resolved.isNew) setCustom((current) => ({ ...current, [field.id]: [...(current[field.id] ?? []), resolved.option] }));
    return resolved.option.value;
  }

  function applyBundle(bundle: PresetBundle) {
    // Only fills the draft — everything stays editable (a preset is a starting configuration).
    const nextExtra = mergeFields(extra, bundle.fields.filter((f) => !catalogIds.has(f.id)));
    const nextFields = mergeFields(catalog, nextExtra);
    setExtra(nextExtra);
    setDraft(sanitizeSelection({ ...clean, ...bundle.selection }, nextFields));
    setTab("fields");
  }

  function removeExtraField(field: PresetField) {
    setExtra((current) => current.filter((f) => f.id !== field.id));
    setDraft((current) => {
      const next = { ...current };
      delete next[field.id];
      return next;
    });
  }

  const tabs: { key: PanelTab; label: string }[] = [
    { key: "fields", label: t("extra.tabFields") },
    { key: "saved", label: t("extra.tabSaved") },
    { key: "community", label: t("extra.tabCommunity") },
  ];

  return (
    <>
      <Modal onClose={onClose} labelledBy="extra-settings-title">
        <div
          role="document"
          data-extra-panel
          onClick={(event) => event.stopPropagation()}
          className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-pop"
        >
          <div className="flex items-start gap-3 border-b border-border-soft px-4 py-3">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <h2 id="extra-settings-title" className="text-h3 font-semibold text-text">
                {t("extra.title")}
              </h2>
              <p className="text-caption text-text-secondary">{t("extra.hint")}</p>
            </div>
            <button type="button" aria-label={t("extra.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
            <SelectionSummary fields={fields} selection={clean} onChange={setDraft} className="rounded-md border border-border-soft bg-surface-soft p-3" />

            {language === "tr" && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-soft bg-surface-soft px-3 py-2.5">
                <input type="checkbox" data-english-fragments checked={englishFragments} onChange={(e) => onEnglishFragmentsChange(e.target.checked)} className="mt-0.5" />
                <span>
                  <span className="block text-label font-semibold text-text">{t("extra.englishFragments")}</span>
                  <span className="block text-caption text-text-secondary">{t("extra.englishFragmentsHint")}</span>
                </span>
              </label>
            )}

            {hasTool && fields.some((f) => f.kind === "suffix") && <p className="rounded-md bg-primary-soft px-3 py-2 text-caption text-text-secondary">{t("extra.toolHint")}</p>}

            <Tabs variant="segmented" ariaLabel={t("extra.presets")} active={tab} onChange={setTab} items={tabs} />

            {tab === "fields" ? (
              <section aria-labelledby="extra-fields-title" className="space-y-2.5">
                <h3 id="extra-fields-title" className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("presetField.fieldsHeading")} <span className="tabular-nums">({topFields.length})</span>
                </h3>
                <PresetFieldList
                  fields={topFields}
                  selection={clean}
                  onChange={setDraft}
                  fragmentLanguage={fragmentLanguage}
                  onRemoveField={(field) => removeExtraField(field)}
                  removableIds={new Set(extra.map((f) => f.id))}
                  onCreateOption={createOption}
                />
                {otherFields.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      aria-expanded={showOthers}
                      onClick={() => setShowOthers((v) => !v)}
                      data-show-other-fields
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-left text-label font-semibold text-text-secondary hover:border-primary hover:text-text"
                    >
                      <span>
                        {t("presetField.others")} <span className="tabular-nums">({otherFields.length})</span>
                      </span>
                      <ChevronDown size={16} className={cn("transition-transform duration-200", showOthers && "rotate-180")} aria-hidden />
                    </button>
                    <Collapsible open={showOthers}>
                      <PresetFieldList fields={otherFields} selection={clean} onChange={setDraft} fragmentLanguage={fragmentLanguage} defaultOpenFirst={false} onCreateOption={createOption} />
                    </Collapsible>
                  </div>
                )}
              </section>
            ) : (
              <PresetLists tab={tab} contentType={contentType} category={category} onApply={applyBundle} />
            )}

            <section className="rounded-md border border-border-soft bg-surface-soft p-3">
              <h3 className="mb-1 text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">{t("extra.preview")}</h3>
              <p data-extra-preview className="prompt-text whitespace-pre-wrap break-words text-small text-text">
                {composed || t("extra.emptyBase")}
              </p>
            </section>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" onClick={() => setDraft({})} disabled={selectedCount === 0}>
                {t("extra.clear")}
              </Button>
            </div>
            <Button type="button" onClick={() => onApply(clean, extra, custom)} data-apply-settings>
              {t("extra.apply")}
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}
