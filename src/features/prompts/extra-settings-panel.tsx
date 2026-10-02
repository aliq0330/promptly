"use client";

import { useMemo, useState } from "react";
import { BookmarkPlus, ChevronRight, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { AddFieldModal } from "@/features/presets/add-field-modal";
import { PresetBuilderModal } from "@/features/presets/preset-builder-modal";
import { PresetFieldList } from "@/features/presets/preset-field-list";
import { PresetPicker, type PresetBundle } from "@/features/presets/preset-picker";
import { SelectionSummary } from "@/features/presets/selection-summary";
import type { ContentTypeId } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { catalogFields, fieldIdsFor } from "@/lib/prompt-extra-settings";
import { composePrompt, countSelected, mergeFields, sanitizeSelection, type PresetField, type PresetSelection } from "@/lib/preset-fields";
import { recordPresetUse } from "@/lib/supabase/presets";

/**
 * The prompt form's "Ek Ayar Önerileri" row + applied chips. The panel
 * (Promptly / my presets, fields to pick values from, "+ Alan Ekle", "Seçtiklerin")
 * only mounts while open. Fields offered by default follow the form's
 * type → category → subcategory (`fieldIdsFor`); anything else is added with
 * "+ Alan Ekle" and kept in `extraFields` so it survives closing the panel.
 */
export function ExtraSettingsSection({
  contentType,
  value,
  onChange,
  extraFields,
  onExtraFieldsChange,
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
  /** Fields the user added on top of the recommended ones (platform, their own, or a preset's). */
  extraFields: PresetField[];
  onExtraFieldsChange: (next: PresetField[]) => void;
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
  const allFields = useMemo(() => mergeFields(recommended, extraFields), [recommended, extraFields]);
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
          subcategory={subcategory}
          tools={tools}
          recommended={recommended}
          initialExtra={extraFields}
          initial={applied}
          promptText={promptText}
          hasTool={hasTool}
          englishFragments={englishFragments}
          onEnglishFragmentsChange={onEnglishFragmentsChange}
          onClose={() => setOpen(false)}
          onApply={(nextSelection, nextExtra) => {
            onExtraFieldsChange(nextExtra);
            onChange(nextSelection);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ExtraSettingsPanel({
  contentType,
  category,
  subcategory,
  tools,
  recommended,
  initialExtra,
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
  subcategory: string | null;
  tools: string[];
  recommended: PresetField[];
  initialExtra: PresetField[];
  initial: PresetSelection;
  promptText: string;
  hasTool: boolean;
  englishFragments: boolean;
  onEnglishFragmentsChange: (value: boolean) => void;
  onClose: () => void;
  onApply: (selection: PresetSelection, extraFields: PresetField[]) => void;
}) {
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const [draft, setDraft] = useState<PresetSelection>(initial);
  const [extra, setExtra] = useState<PresetField[]>(initialExtra);
  const [adding, setAdding] = useState(false);
  const [builder, setBuilder] = useState<"empty" | "current" | null>(null);
  const [presetsVersion, setPresetsVersion] = useState(0);
  const fields = useMemo(() => mergeFields(recommended, extra), [recommended, extra]);
  const fragmentLanguage = englishFragments ? "en" : language;
  const clean = useMemo(() => sanitizeSelection(draft, fields), [draft, fields]);
  const composed = composePrompt(promptText, clean, fields, fragmentLanguage);
  const selectedCount = countSelected(clean, fields);
  const recommendedIds = useMemo(() => new Set(recommended.map((f) => f.id)), [recommended]);

  function applyBundle(bundle: PresetBundle, preset: { id: string } | null) {
    // Only fills the draft — everything stays editable (a preset is a starting configuration).
    const nextExtra = mergeFields(extra, bundle.fields.filter((f) => !recommendedIds.has(f.id)));
    const nextFields = mergeFields(recommended, nextExtra);
    setExtra(nextExtra);
    setDraft(sanitizeSelection({ ...clean, ...bundle.selection }, nextFields));
    if (preset && user) void recordPresetUse(preset.id, user.id);
  }

  function removeExtraField(field: PresetField) {
    setExtra((current) => current.filter((f) => f.id !== field.id));
    setDraft((current) => {
      const next = { ...current };
      delete next[field.id];
      return next;
    });
  }

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

            <PresetPicker contentType={contentType} category={category} onApply={applyBundle} onCreate={() => setBuilder("empty")} refreshKey={presetsVersion} />

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

            <section aria-labelledby="extra-fields-title" className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 id="extra-fields-title" className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("presetField.fieldsHeading")} <span className="tabular-nums">({fields.length})</span>
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} data-add-field-open>
                  <Plus size={14} aria-hidden />
                  {t("presetField.addShort")}
                </Button>
              </div>
              <PresetFieldList
                fields={fields}
                selection={clean}
                onChange={setDraft}
                fragmentLanguage={fragmentLanguage}
                onRemoveField={(field) => removeExtraField(field)}
                removableIds={new Set(extra.map((f) => f.id))}
              />
            </section>

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
              <Button type="button" variant="ghost" onClick={() => setBuilder("current")} disabled={selectedCount === 0} data-save-as-preset>
                <BookmarkPlus size={16} aria-hidden />
                <span className="hidden sm:inline">{t("preset.saveAsNew")}</span>
              </Button>
            </div>
            <Button type="button" onClick={() => onApply(clean, extra)} data-apply-settings>
              {t("extra.apply")}
            </Button>
          </div>
        </div>
      </Modal>

      {adding && (
        <AddFieldModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={tools}
          existingIds={new Set(fields.map((f) => f.id))}
          target="form"
          onAdd={(added) => setExtra((current) => mergeFields(current, added.filter((f) => !recommendedIds.has(f.id))))}
          onLibraryUpdate={(updated) => setExtra((current) => current.map((f) => (f.id === updated.id ? updated : f)))}
          onLibraryDelete={(id) => {
            setExtra((current) => current.filter((f) => f.id !== id));
            setDraft((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
          }}
          onClose={() => setAdding(false)}
        />
      )}

      {builder && (
        <PresetBuilderModal
          contentType={contentType}
          category={category}
          subcategory={subcategory}
          tools={tools}
          seed={builder === "current" ? { fields, selection: clean } : undefined}
          onSaved={() => {
            setBuilder(null);
            setPresetsVersion((v) => v + 1);
          }}
          onClose={() => setBuilder(null)}
        />
      )}
    </>
  );
}
